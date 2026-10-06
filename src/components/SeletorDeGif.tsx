"use client";

import { useEffect, useState } from "react";
import { Dialogo } from "@/components/Dialogo";

type GifEncontrado = { id: string; titulo: string; previa: string; largura: number; altura: number };

type Props = {
  aberto: boolean;
  aoFechar: () => void;
  aoEscolher: (gif: { id: string; previa: string }) => void;
};

export function SeletorDeGif({ aberto, aoFechar, aoEscolher }: Props) {
  const [busca, setBusca] = useState("");
  const [gifs, setGifs] = useState<GifEncontrado[]>([]);
  const [estado, setEstado] = useState<"parado" | "buscando" | "erro">("parado");
  const [mensagem, setMensagem] = useState("");

  useEffect(() => {
    if (!aberto) return;
    const controle = new AbortController();
    // espera a pessoa parar de digitar
    const t = setTimeout(async () => {
      setEstado("buscando");
      try {
        const r = await fetch(`/api/giphy?q=${encodeURIComponent(busca)}`, { signal: controle.signal });
        const corpo = (await r.json()) as { gifs?: GifEncontrado[]; erro?: string };
        if (!r.ok) {
          setGifs([]);
          setMensagem(corpo.erro ?? "Não foi possível buscar GIFs.");
          setEstado("erro");
          return;
        }
        setGifs(corpo.gifs ?? []);
        setEstado("parado");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setMensagem("Não foi possível buscar GIFs.");
        setEstado("erro");
      }
    }, 350);
    return () => {
      clearTimeout(t);
      controle.abort();
    };
  }, [aberto, busca]);

  return (
    <Dialogo aberto={aberto} aoFechar={aoFechar} titulo="Escolher um GIF">
      <div>
        <label htmlFor="gif-busca" className="rotulo">
          Buscar
        </label>
        <input
          id="gif-busca"
          type="search"
          className="campo"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="gato, comemorando, sono…"
          autoComplete="off"
        />
      </div>

      <div aria-live="polite" className="min-h-40">
        {estado === "erro" && (
          <p role="alert" className="erro">
            {mensagem}
          </p>
        )}
        {estado === "buscando" && gifs.length === 0 && <p className="fino">Buscando…</p>}
        {estado === "parado" && gifs.length === 0 && <p className="fino">Nenhum GIF encontrado.</p>}
        {gifs.length > 0 && (
          <ul className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {gifs.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  className="bg-papel-2 block w-full overflow-hidden rounded-xl"
                  onClick={() => {
                    aoEscolher({ id: g.id, previa: g.previa });
                    aoFechar();
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- prévia servida pelo Giphy */}
                  <img src={g.previa} alt={g.titulo} loading="lazy" referrerPolicy="no-referrer" className="h-28 w-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-tinta-2 text-[0.75rem] font-bold tracking-wide uppercase">Powered by GIPHY</p>
        <button type="button" className="btn btn-qui btn-peq" onClick={aoFechar}>
          Fechar
        </button>
      </div>
    </Dialogo>
  );
}
