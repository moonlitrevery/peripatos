"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { apagarMensagem, buscarMensagem, enviarMensagem, marcarLida, mensagensAnteriores } from "@/app/acoes/mensagens";
import { Denunciar } from "@/components/Denunciar";
import { Gif, urlDoGif } from "@/components/Gif";
import { SeletorDeGif } from "@/components/SeletorDeGif";
import { TextoComLinks } from "@/components/TextoComLinks";
import type { Mensagem } from "@/lib/mensagens";
import { haQuantoTempo } from "@/lib/tempo";
import { avisarLeitura, useEventosDeMensagem, type Evento } from "@/lib/tempo-real";

const LIMITE = 1000; // o mesmo CHECK da coluna messages.body

type Props = {
  conversaId: string;
  uid: string;
  nomeDoOutro: string;
  iniciais: Mensagem[];
  haMaisInicial: boolean;
  /** Aceita mensagens novas: os dois se seguem e não há bloqueio. */
  aberta: boolean;
};

// Não existe "visto" nem "digitando", de propósito: nada aqui avisa a outra
// pessoa de que você abriu a conversa ou começou a escrever.
export function Conversa({ conversaId, uid, nomeDoOutro, iniciais, haMaisInicial, aberta }: Props) {
  const router = useRouter();
  const [mensagens, setMensagens] = useState(iniciais);
  const [haMais, setHaMais] = useState(haMaisInicial);
  const [texto, setTexto] = useState("");
  const [gif, setGif] = useState<{ id: string; previa: string; titulo: string } | null>(null);
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciarEnvio] = useTransition();
  const [carregando, setCarregando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  const acrescentar = useCallback((nova: Mensagem) => {
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
      void buscarMensagem(e.mensagem).then((r) => {
        if (!r.ok || !r.dados) return;
        acrescentar(r.dados);
        if (!r.dados.minha) void marcarLida(conversaId).then(avisarLeitura);
      });
    },
    [conversaId, acrescentar],
  );
  useEventosDeMensagem(uid, aoReceber);

  const vazio = texto.trim() === "" && !gif;

  function enviar() {
    if (vazio || texto.length > LIMITE) return;
    setErro(null);
    iniciarEnvio(async () => {
      const r = await enviarMensagem(conversaId, texto, gif ? { id: gif.id, alt: gif.titulo } : null);
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
        <p className="text-tinta-2">Nenhuma mensagem ainda. Diga oi.</p>
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
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                enviar();
              }
            }}
            placeholder={`Mensagem para ${nomeDoOutro}`}
            aria-describedby="nova-mensagem-contador"
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
          <p className="text-tinta-2">
            Vocês não se seguem mais, então não dá para enviar mensagens novas. O que já foi dito continua aqui para os
            dois. Se voltarem a se seguir, a conversa reabre.
          </p>
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
