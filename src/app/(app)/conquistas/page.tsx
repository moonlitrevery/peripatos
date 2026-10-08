import type { Metadata } from "next";
import Link from "next/link";
import { Medalha } from "@/components/Conquista";
import { COLUNAS_DA_CONQUISTA, deLinha } from "@/lib/conquistas";
import { exigirSessao } from "@/lib/sessao";
import { Visibilidade } from "./Visibilidade";

export const metadata: Metadata = { title: "Conquistas" };

export default async function Conquistas() {
  const { supabase } = await exigirSessao();
  // O catálogo já vem filtrado pelo banco: uma conquista secreta só existe
  // para quem a ganhou (ou viu alguém que a mostra no perfil).
  const [catalogo, minhas] = await Promise.all([
    supabase.from("achievements").select(COLUNAS_DA_CONQUISTA).order("position"),
    supabase.rpc("minhas_conquistas"),
  ]);
  const todas = (catalogo.data ?? []).map(deLinha);
  const ganhas = new Map((minhas.data ?? []).map((m) => [m.slug, m]));
  const tenho = todas.filter((c) => ganhas.has(c.slug));
  // Secreta que a pessoa ainda não ganhou não entra na lista do que falta,
  // mesmo que ela já tenha visto no perfil de alguém.
  const faltam = todas.filter((c) => !ganhas.has(c.slug) && !c.secreta);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link href="/voce" className="text-petroleo text-sm font-semibold underline underline-offset-4">
          ‹ Você
        </Link>
        <h1 className="text-3xl font-bold">Conquistas</h1>
        <p className="text-tinta-2">
          Ninguém escolhe as próprias conquistas: elas chegam pelo que você faz no Peripatos. Uma vez ganha, é sua para
          sempre, e você decide se ela aparece no seu perfil.
        </p>
      </header>

      <section aria-labelledby="t-suas" className="flex flex-col gap-3">
        <h2 id="t-suas" className="text-xl font-bold">
          Suas conquistas ({tenho.length})
        </h2>
        {tenho.length === 0 ? (
          <p className="text-tinta-2">Você ainda não tem nenhuma.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {tenho.map((c) => {
              const m = ganhas.get(c.slug)!;
              return (
                <li key={c.slug} className="cartao flex flex-wrap items-center gap-3" data-conquista={c.slug}>
                  <Medalha conquista={c} tamanho={48} />
                  <div className="min-w-0 flex-1 basis-48">
                    <h3 className="text-lg leading-snug font-bold">
                      <Link href={`/conquistas/${c.slug}`} className="underline underline-offset-4">
                        {c.nome}
                      </Link>
                      {c.secreta && <span className="fino font-sans font-normal"> · secreta</span>}
                    </h3>
                    <p>{c.descricao}</p>
                    <p className="fino">
                      Desde{" "}
                      <time dateTime={m.ganha_em}>
                        {new Date(m.ganha_em).toLocaleDateString("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" })}
                      </time>
                    </p>
                  </div>
                  <Visibilidade slug={c.slug} nome={c.nome} oculta={m.oculta} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="t-faltam" className="flex flex-col gap-3">
        <h2 id="t-faltam" className="text-xl font-bold">
          Ainda por conquistar ({faltam.length})
        </h2>
        {faltam.length === 0 ? (
          <p className="text-tinta-2">Você tem todas as que estão à vista.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {faltam.map((c) => (
              <li key={c.slug} className="border-linha flex items-center gap-3 rounded-[20px] border border-dashed p-4">
                <Medalha conquista={c} tamanho={40} />
                <div className="min-w-0 flex-1">
                  <h3 className="leading-snug font-bold">
                    <Link href={`/conquistas/${c.slug}`} className="underline underline-offset-4">
                      {c.nome}
                    </Link>
                  </h3>
                  <p className="text-tinta-2">{c.descricao}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="fino">Existem conquistas secretas. Elas só aparecem aqui depois de ganhas.</p>
      </section>
    </div>
  );
}
