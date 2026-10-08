"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { sugestoesDeGente, type Sugestao } from "@/app/acoes/sugestoes";
import { Avatar } from "@/components/Avatar";
import { BotaoSeguir } from "@/components/BotaoSeguir";

const TELA_LARGA = "(min-width: 80rem)"; // o mesmo "xl" em que a coluna aparece

// A coluna da direita no desktop. Só busca as sugestões quando a coluna está
// de fato na tela: no celular e no tablet nada é pedido ao servidor.
export function Sugestoes() {
  const caminho = usePathname();
  const [lista, setLista] = useState<Sugestao[] | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(TELA_LARGA);
    let cancelado = false;
    const buscar = () => {
      if (!mq.matches) return;
      void sugestoesDeGente().then((l) => {
        if (!cancelado) setLista(l);
      });
    };
    buscar();
    mq.addEventListener("change", buscar);
    return () => {
      cancelado = true;
      mq.removeEventListener("change", buscar);
    };
  }, []);

  // Em Gente a lista inteira já está na coluna do meio.
  if (caminho.startsWith("/gente")) return null;

  return (
    <section aria-labelledby="t-sugestoes" className="cartao sticky top-8 flex flex-col gap-4">
      <h2 id="t-sugestoes" className="text-lg font-bold">
        Gente parecida com você
      </h2>
      {lista === null ? (
        <ul className="flex flex-col gap-4" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="osso arco h-[50px] w-10" />
              <span className="flex flex-1 flex-col gap-2">
                <span className="osso h-4 w-28" />
                <span className="osso h-3 w-20" />
              </span>
            </li>
          ))}
        </ul>
      ) : lista.length === 0 ? (
        <p className="text-tinta-2 text-sm">Quando houver mais gente com gostos parecidos com os seus, aparece aqui.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {lista.map((p) => (
            <li key={p.id} className="flex items-center gap-3">
              <Avatar url={p.avatarUrl} preset={p.preset} semente={p.id} tamanho={40} nome={p.nome} />
              <div className="min-w-0 flex-1">
                <Link href={`/u/${p.username}`} className="block truncate font-bold">
                  {p.nome}
                </Link>
                <p className="text-ambar text-[0.8125rem] font-semibold">
                  {p.emComum} {p.emComum === 1 ? "gosto em comum" : "gostos em comum"}
                </p>
              </div>
              <BotaoSeguir alvoId={p.id} nome={p.nome} seguindoInicial={false} />
            </li>
          ))}
        </ul>
      )}
      <Link href="/gente" className="text-petroleo text-sm font-semibold underline underline-offset-4">
        Ver todo mundo
      </Link>
    </section>
  );
}
