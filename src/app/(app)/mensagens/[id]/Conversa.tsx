"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { apagarMensagem, enviarMensagem, marcarLida, mensagensAnteriores, receberMensagem } from "@/app/acoes/mensagens";
import { Denunciar } from "@/components/Denunciar";
import { Gif, urlDoGif } from "@/components/Gif";
import { SeletorDeGif } from "@/components/SeletorDeGif";
import { TextoComLinks } from "@/components/TextoComLinks";
import type { Mensagem } from "@/lib/mensagens";
import { haQuantoTempo } from "@/lib/tempo";
import { avisarLeitura, useEventosDeMensagem, type Evento } from "@/lib/tempo-real";

const LIMITE = 1000; // o mesmo CHECK da coluna messages.body

// Computador, e não aparelho de toque: o ponteiro principal é preciso e passa
// por cima das coisas. Um notebook com tela de toque continua sendo
// computador; um celular com teclado bluetooth continua sendo celular.
const TECLADO_FISICO = "(hover: hover) and (pointer: fine)";
const temTecladoFisico = () => window.matchMedia(TECLADO_FISICO).matches;

type Props = {
  conversaId: string;
  uid: string;
  nomeDoOutro: string;
  iniciais: Mensagem[];
  haMaisInicial: boolean;
  /** Aceita mensagens novas: os dois se seguem e não há bloqueio. */
  aberta: boolean;
  /** A outra pessoa excluiu a conta (as mensagens dela foram apagadas). */
  outroExcluido: boolean;
};

// Não existe "visto" nem "digitando", de propósito: nada aqui avisa a outra
// pessoa de que você abriu a conversa ou começou a escrever.
export function Conversa({ conversaId, uid, nomeDoOutro, iniciais, haMaisInicial, aberta, outroExcluido }: Props) {
  const router = useRouter();
  const [mensagens, setMensagens] = useState(iniciais);
  const [haMais, setHaMais] = useState(haMaisInicial);
  const [texto, setTexto] = useState("");
  const [gif, setGif] = useState<{ id: string; previa: string; titulo: string } | null>(null);
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciarEnvio] = useTransition();
  // O estado acima só muda no próximo desenho: dois Enter seguidos chegariam
  // aqui antes disso. A referência fecha a porta na hora.
  const saindo = useRef(false);
  const [carregando, setCarregando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  // ids que esta tela já tem ou já está buscando, para não pedir duas vezes
  const conhecidas = useRef(new Set(iniciais.map((m) => m.id)));

  const acrescentar = useCallback((nova: Mensagem) => {
    conhecidas.current.add(nova.id);
    setMensagens((atual) => (atual.some((m) => m.id === nova.id) ? atual : [...atual, nova]));
  }, []);

  // Marca como lida ao abrir. O marcador é só de quem lê: a outra pessoa não
  // tem como saber.
  useEffect(() => {
    void marcarLida(conversaId).then(avisarLeitura);
  }, [conversaId]);

  // Desce até a última mensagem ao abrir e quando chega uma nova.
  const total = mensagens.length;
  const ultima = mensagens[total - 1]?.id;
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [ultima]);

  const aoReceber = useCallback(
    (e: Evento) => {
      if (e.conversa !== conversaId) return;
      if (e.tipo === "apagada") {
        setMensagens((atual) => atual.filter((m) => m.id !== e.mensagem));
        return;
      }
      // O aviso só traz o id. O conteúdo vem pela API, onde o banco decide de
      // novo se esta pessoa pode ler.
      // A minha própria mensagem já entrou na tela pelo retorno do envio.
      if (conhecidas.current.has(e.mensagem)) return;
      conhecidas.current.add(e.mensagem);
      void receberMensagem(e.mensagem).then((r) => {
        if (!r.ok || !r.dados) return;
        acrescentar(r.dados);
        // a mesma chamada já marcou como lida, se era da outra pessoa
        if (!r.dados.minha) avisarLeitura();
      });
    },
    [conversaId, acrescentar],
  );
  useEventosDeMensagem(uid, aoReceber);

  const vazio = texto.trim() === "" && !gif;

  function enviar() {
    if (vazio || texto.length > LIMITE || saindo.current) return;
    saindo.current = true;
    setErro(null);
    iniciarEnvio(async () => {
      const r = await enviarMensagem(conversaId, texto, gif ? { id: gif.id, alt: gif.titulo } : null).finally(() => {
        saindo.current = false;
      });
      if (!r.ok) {
        setErro(r.erro);
        // pode ter fechado (deixaram de se seguir): busca o estado atual
        router.refresh();
        return;
      }
      acrescentar(r.dados);
      setTexto("");
      setGif(null);
    });
  }

  async function carregarAnteriores() {
    const primeira = mensagens[0];
    if (!primeira || carregando) return;
    setCarregando(true);
    const r = await mensagensAnteriores(conversaId, primeira.criadaEm);
    if (r.ok) {
      setMensagens((atual) => {
        const vistas = new Set(atual.map((m) => m.id));
        return [...r.dados.mensagens.filter((m) => !vistas.has(m.id)), ...atual];
      });
      setHaMais(r.dados.haMais);
    }
    setCarregando(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {haMais && (
        <button type="button" className="btn btn-qui btn-peq self-center" disabled={carregando} onClick={() => void carregarAnteriores()}>
          {carregando ? "Carregando…" : "Ver mensagens anteriores"}
        </button>
      )}

      {mensagens.length === 0 ? (
        <p className="text-tinta-2">{outroExcluido ? "Não sobrou nenhuma mensagem nesta conversa." : "Nenhuma mensagem ainda. Diga oi."}</p>
      ) : (
        <ol className="flex flex-col gap-3" aria-label={`Mensagens com ${nomeDoOutro}`}>
          {mensagens.map((m) => (
            <li key={m.id} className={`flex flex-col gap-1 ${m.minha ? "items-end" : "items-start"}`}>
              <div
                className={`flex max-w-[85%] flex-col gap-2 rounded-[20px] px-4 py-2.5 ${
                  m.minha ? "bg-petroleo text-sobre-petroleo" : "bg-papel border-linha border"
                }`}
              >
                <span className="sr-only">{m.minha ? "Você: " : `${nomeDoOutro}: `}</span>
                {m.corpo && (
                  <p className="break-words whitespace-pre-wrap">
                    <TextoComLinks texto={m.corpo} />
                  </p>
                )}
                {m.gifId && <Gif id={m.gifId} alt={m.gifAlt} />}
              </div>
              <div className="fino flex items-center gap-3 px-1">
                <time dateTime={m.criadaEm}>{haQuantoTempo(m.criadaEm)}</time>
                {m.minha ? (
                  <ApagarMensagem id={m.id} aoApagar={() => setMensagens((atual) => atual.filter((x) => x.id !== m.id))} />
                ) : (
                  <Denunciar alvo={{ mensagemId: m.id }} className="fino underline underline-offset-4" />
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      <div ref={fim} />

      {/* Região viva vazia para leitores de tela anunciarem a chegada de mensagens. */}
      <p className="sr-only" role="status" aria-live="polite">
        {total > 0 && !mensagens[total - 1]!.minha ? `Nova mensagem de ${nomeDoOutro}` : ""}
      </p>

      {aberta ? (
        <form
          className="cartao flex flex-col gap-3"
          aria-label="Nova mensagem"
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
        >
          <label htmlFor="nova-mensagem" className="sr-only">
            Mensagem para {nomeDoOutro}
          </label>
          <textarea
            id="nova-mensagem"
            rows={2}
            maxLength={LIMITE}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              // Texto em composição (teclado japonês, chinês, autocorretor):
              // este Enter confirma a palavra, não envia nem quebra a linha.
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              // Ctrl+Enter / Cmd+Enter enviam em qualquer aparelho. Enter
              // sozinho só envia com teclado de verdade: no toque ele quebra a
              // linha e o envio fica no botão. Shift+Enter sempre quebra a linha.
              const atalho = e.metaKey || e.ctrlKey;
              if (!atalho && (e.shiftKey || e.altKey || !temTecladoFisico())) return;
              e.preventDefault();
              enviar();
            }}
            placeholder={`Mensagem para ${nomeDoOutro}`}
            aria-describedby="nova-mensagem-contador nova-mensagem-dica"
            className="placeholder:text-tinta-2 w-full resize-none bg-transparent text-base"
          />
          {gif && (
            <div className="relative self-start">
              {/* eslint-disable-next-line @next/next/no-img-element -- GIF escolhido, servido pelo Giphy */}
              <img src={urlDoGif(gif.id)} alt={`GIF escolhido: ${gif.titulo}`} referrerPolicy="no-referrer" className="max-h-40 rounded-2xl" />
              <button type="button" className="btn btn-qui btn-peq absolute top-2 right-2" onClick={() => setGif(null)}>
                Tirar GIF
              </button>
            </div>
          )}
          {erro && (
            <p role="alert" className="erro">
              {erro}
            </p>
          )}
          <div className="flex items-center gap-3">
            <button type="button" className="btn btn-qui btn-peq" onClick={() => setSeletorAberto(true)}>
              GIF
            </button>
            {/* Só aparece onde o Enter envia (a mesma consulta de mídia, no CSS). */}
            <span id="nova-mensagem-dica" className="so-teclado text-tinta-2 text-[0.8125rem]">
              Enter envia · Shift+Enter quebra a linha
            </span>
            <span
              id="nova-mensagem-contador"
              className={`ml-auto text-[0.8125rem] tabular-nums ${texto.length >= LIMITE ? "text-perigo font-semibold" : "text-tinta-2"}`}
            >
              {texto.length} / {LIMITE}
              <span className="sr-only"> caracteres</span>
            </span>
            <button type="submit" className="btn btn-pri btn-peq" disabled={vazio || enviando}>
              {enviando ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </form>
      ) : (
        <section className="cartao flex flex-col gap-2" aria-labelledby="conversa-fechada">
          <h2 id="conversa-fechada" className="text-lg font-bold">
            Conversa fechada
          </h2>
          {outroExcluido ? (
            <p className="text-tinta-2">
              Esta pessoa excluiu a conta. As mensagens que ela escreveu foram apagadas; as suas continuam aqui, e você
              pode apagá-las quando quiser.
            </p>
          ) : (
            <p className="text-tinta-2">
              Vocês não se seguem mais, então não dá para enviar mensagens novas. O que já foi dito continua aqui para
              os dois. Se voltarem a se seguir, a conversa reabre.
            </p>
          )}
        </section>
      )}

      <SeletorDeGif aberto={seletorAberto} aoFechar={() => setSeletorAberto(false)} aoEscolher={setGif} />
    </div>
  );
}

function ApagarMensagem({ id, aoApagar }: { id: string; aoApagar: () => void }) {
  const [pendente, iniciar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState(false);
  if (!confirmando) {
    return (
      <button type="button" className="underline underline-offset-4" onClick={() => setConfirmando(true)}>
        Apagar
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2">
      {erro ? "Não deu para apagar." : "Apagar para os dois?"}
      <button
        type="button"
        className="btn btn-per btn-peq"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await apagarMensagem(id);
            if (r.ok) aoApagar();
            else setErro(true);
          })
        }
      >
        Apagar
      </button>
      <button type="button" className="btn btn-qui btn-peq" onClick={() => setConfirmando(false)}>
        Cancelar
      </button>
    </span>
  );
}
