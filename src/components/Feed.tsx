"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { apagarPost, maisFeed, publicar } from "@/app/acoes/social";
import { Denunciar } from "@/components/Denunciar";
import { urlDoGif } from "@/components/Gif";
import { Post } from "@/components/Post";
import { SeletorDeGif } from "@/components/SeletorDeGif";
import type { ItemFeed } from "@/lib/feed";

const LIMITE = 500; // o mesmo CHECK da coluna posts.body

type Eu = { id: string; username: string; nome: string; avatarUrl: string | null; preset: number | null };

export function Feed({ inicial, cursorInicial, eu }: { inicial: ItemFeed[]; cursorInicial: string | null; eu: Eu }) {
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

  function enviar() {
    if (vazio || texto.length > LIMITE) return;
    setErro(null);
    iniciarPublicacao(async () => {
      const r = await publicar(texto, gif ? { id: gif.id, alt: gif.titulo } : null);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      // O feed do banco não traz os próprios posts; mostramos o que acabou de
      // sair no topo para a pessoa ver que publicou.
      setItens((atual) => [
        {
          id: r.dados.id,
          autorId: eu.id,
          username: eu.username,
          nome: eu.nome,
          avatarUrl: eu.avatarUrl,
          preset: eu.preset,
          corpo: texto.trim(),
          gifId: gif?.id ?? null,
          gifAlt: r.dados.gifAlt,
          criadoEm: r.dados.criadoEm,
          editado: false,
          origem: "proprio",
        },
        ...atual,
      ]);
      setTexto("");
      setGif(null);
    });
  }

  const carregarMais = useCallback(async () => {
    if (!cursor || carregando) return;
    setCarregando(true);
    setErroLista(null);
    const r = await maisFeed(cursor);
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
  }, [cursor, carregando]);

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
            {publicando ? "Publicando…" : "Publicar"}
          </button>
        </div>
      </form>

      <SeletorDeGif aberto={seletorAberto} aoFechar={() => setSeletorAberto(false)} aoEscolher={setGif} />

      {itens.length === 0 ? (
        <section className="cartao flex flex-col items-start gap-3">
          <h2 className="text-xl font-bold">Seu Início ainda está quieto</h2>
          <p className="text-tinta-2">
            Os posts de quem tem gostos parecidos com os seus aparecem aqui. Que tal ver quem gosta do que você gosta?
          </p>
          <Link href="/gente" className="btn btn-pri">
            Conhecer gente
          </Link>
        </section>
      ) : (
        <ul className="flex flex-col gap-4" aria-label="Posts">
          {itens.map((item) => (
            <li key={item.id}>
              <Post
                item={item}
                acoes={
                  item.autorId === eu.id ? (
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
      {cursor && (
        <button type="button" className="btn btn-qui self-center" disabled={carregando} onClick={() => void carregarMais()}>
          {carregando ? "Carregando…" : "Carregar mais"}
        </button>
      )}
      {!cursor && itens.length > 0 && <p className="fino text-center">Você chegou ao fim. Volte mais tarde.</p>}
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
