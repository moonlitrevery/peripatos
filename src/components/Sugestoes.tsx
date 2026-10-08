"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { sugestoesDeGente, type ColunaDeGente } from "@/app/acoes/sugestoes";
import { Avatar } from "@/components/Avatar";
import { BotaoSeguir } from "@/components/BotaoSeguir";
import { TagChip } from "@/components/TagChip";

const TELA_LARGA = "(min-width: 80rem)"; // o mesmo "xl" em que a coluna aparece

// A coluna da direita no desktop. Só busca as sugestões quando a coluna está
// de fato na tela: no celular e no tablet nada é pedido ao servidor.
// Quando a pessoa já segue todo mundo parecido, a coluna mostra quem acabou de
// chegar: sem contagem, só o perfil e as tags em comum.
export function Sugestoes() {
  const caminho = usePathname();
  const [coluna, setColuna] = useState<ColunaDeGente | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(TELA_LARGA);
    let cancelado = false;
    const buscar = () => {
      if (!mq.matches) return;
      void sugestoesDeGente().then((l) => {
        if (!cancelado) setColuna(l);
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

  const recem = coluna?.tipo === "recem-chegados" && coluna.pessoas.length > 0;

  return (
    <section aria-labelledby="t-sugestoes" className="cartao sticky top-8 flex flex-col gap-4">
      <h2 id="t-sugestoes" className="text-lg font-bold">
        {recem ? "Recém-chegados" : "Gente parecida com você"}
      </h2>
      {coluna === null ? (
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
      ) : coluna.pessoas.length === 0 ? (
        <p className="text-tinta-2 text-sm">Quando houver mais gente com gostos parecidos com os seus, aparece aqui.</p>
      ) : coluna.tipo === "recem-chegados" ? (
        <>
          <p className="text-tinta-2 text-sm">Você já segue todo mundo parecido com você. Estes chegaram há pouco.</p>
          <ul className="flex flex-col gap-4">
            {coluna.pessoas.map((p) => (
              <li key={p.id} className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <Avatar url={p.avatarUrl} preset={p.preset} semente={p.id} tamanho={40} nome={p.nome} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/u/${p.username}`} className="block truncate font-bold">
                      {p.nome}
                    </Link>
                    <p className="fino truncate">@{p.username}</p>
                  </div>
                  <BotaoSeguir alvoId={p.id} nome={p.nome} seguindoInicial={p.seguindo} />
                </div>
                {p.comuns.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5" aria-label={`Gostos em comum com ${p.nome}`}>
                    {p.comuns.map((t) => (
                      <li key={t.id}>
                        <TagChip tag={t} comum />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <ul className="flex flex-col gap-4">
          {coluna.pessoas.map((p) => (
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
