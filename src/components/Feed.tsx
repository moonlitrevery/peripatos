"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { apagarPost, maisFeed, publicar } from "@/app/acoes/social";
import { Denunciar } from "@/components/Denunciar";
import { urlDoGif } from "@/components/Gif";
import { Post } from "@/components/Post";
import { SeletorDeGif } from "@/components/SeletorDeGif";
import { lembrarAba, type AbaDoFeed } from "@/lib/aba-do-inicio";
import type { ItemFeed } from "@/lib/feed";

const LIMITE = 500; // o mesmo CHECK da coluna posts.body

type Eu = { id: string; username: string; nome: string; avatarUrl: string | null; preset: number | null };

const ABAS: { id: AbaDoFeed; rotulo: string }[] = [
  { id: "para-voce", rotulo: "Para você" },
  { id: "seguindo", rotulo: "Seguindo" },
];

type Props = { abaInicial: AbaDoFeed; inicial: ItemFeed[]; cursorInicial: string | null; eu: Eu };

export function Feed({ abaInicial, inicial, cursorInicial, eu }: Props) {
  const [aba, setAba] = useState(abaInicial);
  const [trocando, setTrocando] = useState(false);
  const [itens, setItens] = useState(inicial);
  const [cursor, setCursor] = useState(cursorInicial);
  const [texto, setTexto] = useState("");
  const [gif, setGif] = useState<{ id: string; previa: string; titulo: string } | null>(null);
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [publicando, iniciarPublicacao] = useTransition();
  const [carregando, setCarregando] = useState(false);
  const sentinela = useRef<HTMLDivElement>(null);

  const vazio = texto.trim() === "" && !gif;

  // Otimista: o post aparece no topo e o formulário esvazia na hora do toque.
  // Se o servidor recusar (limite de posts, termos, sessão), o post some da
  // lista e o texto e o GIF voltam para o formulário, com o motivo.
  function enviar() {
    if (vazio || texto.length > LIMITE || publicando) return;
    setErro(null);
    const rascunho = { texto, gif };
    const provisorio = `enviando-${Date.now()}`;
    setItens((atual) => [
      {
        id: provisorio,
        autorId: eu.id,
        username: eu.username,
        nome: eu.nome,
        avatarUrl: eu.avatarUrl,
        preset: eu.preset,
        corpo: texto.trim(),
        gifId: gif?.id ?? null,
        gifAlt: gif?.titulo ?? null,
        criadoEm: new Date().toISOString(),
        editado: false,
        origem: "proprio",
        enviando: true,
      },
      ...atual,
    ]);
    setTexto("");
    setGif(null);
    iniciarPublicacao(async () => {
      const r = await publicar(rascunho.texto, rascunho.gif ? { id: rascunho.gif.id, alt: rascunho.gif.titulo } : null);
      if (!r.ok) {
        setItens((atual) => atual.filter((i) => i.id !== provisorio));
        setTexto(rascunho.texto);
        setGif(rascunho.gif);
        setErro(r.erro);
        return;
      }
      // O feed do banco não traz os próprios posts: o que acabou de sair fica
      // no topo, agora com o id e a hora de verdade.
      setItens((atual) =>
        atual.map((i) =>
          i.id === provisorio ? { ...i, id: r.dados.id, criadoEm: r.dados.criadoEm, gifAlt: r.dados.gifAlt, enviando: false } : i,
        ),
      );
    });
  }

  // Trocar de aba: lembra a escolha neste aparelho (um cookie de preferência,
  // para a próxima visita já abrir na aba certa) e busca a primeira página.
  // Os posts que a pessoa acabou de publicar continuam no topo.
  const pedido = useRef(0);
  async function trocarDeAba(nova: AbaDoFeed) {
    if (nova === aba) return;
    lembrarAba(nova);
    const meu = ++pedido.current;
    setAba(nova);
    setTrocando(true);
    setErroLista(null);
    const r = await maisFeed(nova, null);
    if (meu !== pedido.current) return; // trocou de novo antes de chegar
    if (r.ok) {
      setItens((atual) => [...atual.filter((i) => i.origem === "proprio"), ...r.dados.itens]);
      setCursor(r.dados.proximo);
    } else {
      setItens((atual) => atual.filter((i) => i.origem === "proprio"));
      setCursor(null);
      setErroLista(r.erro);
    }
    setTrocando(false);
  }

  const carregarMais = useCallback(async () => {
    if (!cursor || carregando) return;
    setCarregando(true);
    setErroLista(null);
    const r = await maisFeed(aba, cursor);
    if (r.ok) {
      setItens((atual) => {
        const vistos = new Set(atual.map((i) => i.id));
        return [...atual, ...r.dados.itens.filter((i) => !vistos.has(i.id))];
      });
      setCursor(r.dados.proximo);
    } else {
      setErroLista(r.erro);
      setCursor(null);
    }
    setCarregando(false);
  }, [aba, cursor, carregando]);

  // Scroll infinito: carrega a próxima página quando o fim da lista aparece.
  // O botão "Carregar mais" continua ali para quem navega por teclado.
  useEffect(() => {
    const alvo = sentinela.current;
    if (!alvo || !cursor) return;
    const obs = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) void carregarMais();
    }, { rootMargin: "400px" });
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [cursor, carregarMais]);

  function remover(id: string) {
    setItens((atual) => atual.filter((i) => i.id !== id));
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        className="cartao flex flex-col gap-3"
        aria-label="Novo post"
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
      >
        <label htmlFor="novo-post" className="sr-only">
          O que você quer conversar?
        </label>
        <textarea
          id="novo-post"
          rows={3}
          maxLength={LIMITE}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="O que você quer conversar?"
          aria-describedby="novo-post-contador"
          className="placeholder:text-tinta-2 w-full resize-none bg-transparent text-base"
        />
        {gif && (
          <div className="relative self-start">
            {/* eslint-disable-next-line @next/next/no-img-element -- GIF escolhido, servido pelo Giphy */}
            <img src={urlDoGif(gif.id)} alt={`GIF escolhido: ${gif.titulo}`} referrerPolicy="no-referrer" className="max-h-48 rounded-2xl" />
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
            id="novo-post-contador"
            className={`ml-auto text-[0.8125rem] tabular-nums ${texto.length >= LIMITE ? "text-perigo font-semibold" : "text-tinta-2"}`}
          >
            {texto.length} / {LIMITE}
            <span className="sr-only"> caracteres</span>
          </span>
          <button type="submit" className="btn btn-pri btn-peq" disabled={vazio || publicando}>
            Publicar
          </button>
        </div>
      </form>

      <SeletorDeGif aberto={seletorAberto} aoFechar={() => setSeletorAberto(false)} aoEscolher={setGif} />

      {/* Duas abas. "Para você": quem eu sigo e gente da instituição, pela
          hora, com um post de fora do círculo a cada quatro. "Seguindo": só
          quem eu sigo, pela hora. */}
      <div role="tablist" aria-label="O que mostrar no Início" className="border-linha flex border-b">
        {ABAS.map((a, i) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            id={`aba-${a.id}`}
            aria-selected={aba === a.id}
            aria-controls="painel-do-feed"
            tabIndex={aba === a.id ? 0 : -1}
            className={`min-h-11 flex-1 cursor-pointer text-[0.9375rem] font-bold ${
              aba === a.id ? "text-petroleo shadow-[inset_0_-3px_0_var(--petroleo)]" : "text-tinta-2"
            }`}
            onClick={() => void trocarDeAba(a.id)}
            onKeyDown={(e) => {
              // Padrão de abas: as setas andam entre elas e já selecionam.
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const outra = ABAS[(i + (e.key === "ArrowRight" ? 1 : ABAS.length - 1)) % ABAS.length]!;
              document.getElementById(`aba-${outra.id}`)?.focus();
              void trocarDeAba(outra.id);
            }}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      <div id="painel-do-feed" role="tabpanel" aria-labelledby={`aba-${aba}`} aria-busy={trocando} className="flex flex-col gap-4">
      {trocando ? (
        <p role="status" className="text-tinta-2 py-6 text-center">
          Carregando…
        </p>
      ) : itens.length === 0 ? (
        aba === "seguindo" ? (
          <section className="cartao flex flex-col items-start gap-3">
            <h2 className="text-xl font-bold">Ninguém que você segue postou ainda</h2>
            <p className="text-tinta-2">Aqui aparecem só os posts de quem você segue, do mais recente para o mais antigo.</p>
            <Link href="/gente" className="btn btn-pri">
              Encontrar gente para seguir
            </Link>
          </section>
        ) : (
          <section className="cartao flex flex-col items-start gap-3">
            <h2 className="text-xl font-bold">Seu Início ainda está quieto</h2>
            <p className="text-tinta-2">
              Os posts de quem você segue e de quem tem gostos parecidos com os seus aparecem aqui. Que tal ver quem gosta
              do que você gosta?
            </p>
            <Link href="/gente" className="btn btn-pri">
              Conhecer gente
            </Link>
          </section>
        )
      ) : (
        <ul className="flex flex-col gap-4" aria-label="Posts">
          {itens.map((item) => (
            <li key={item.id}>
              <Post
                item={item}
                acoes={
                  item.enviando ? (
                    <span className="fino" role="status">
                      Publicando…
                    </span>
                  ) : item.autorId === eu.id ? (
                    <ApagarPost id={item.id} aoApagar={() => remover(item.id)} />
                  ) : (
                    <Denunciar alvo={{ postId: item.id }} className="fino underline underline-offset-4" />
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}

      {erroLista && (
        <p role="alert" className="erro">
          {erroLista}
        </p>
      )}
      <div ref={sentinela} />
      {cursor && !trocando && (
        <button type="button" className="btn btn-qui self-center" disabled={carregando} onClick={() => void carregarMais()}>
          {carregando ? "Carregando…" : "Carregar mais"}
        </button>
      )}
      {!cursor && !trocando && itens.length > 0 && <p className="fino text-center">Você chegou ao fim. Volte mais tarde.</p>}
      </div>
    </div>
  );
}

function ApagarPost({ id, aoApagar }: { id: string; aoApagar: () => void }) {
  const [pendente, iniciar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  if (!confirmando) {
    return (
      <button type="button" className="fino underline underline-offset-4" onClick={() => setConfirmando(true)}>
        Apagar
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2 text-sm">
      Apagar este post?
      <button
        type="button"
        className="btn btn-per btn-peq"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await apagarPost(id);
            if (r.ok) aoApagar();
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
