import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { BotaoSeguir } from "@/components/BotaoSeguir";
import { SeloMutuo } from "@/components/SeloMutuo";
import { TagChip } from "@/components/TagChip";
import { assinarAvatares } from "@/lib/avatares";
import { exigirSessao } from "@/lib/sessao";
import { fraseEmComum, type Tag } from "@/lib/tags";

export const metadata: Metadata = { title: "Gente" };

const COMUNS_VISIVEIS = 5;

export default async function Gente() {
  const { supabase, user } = await exigirSessao();

  // A RPC devolve a lista ordenada por afinidade e as tags em comum, que são
  // sempre gostos: tag sensível não entra em afinidade nem em "em comum", para
  // ninguém. As três consultas não dependem uma da outra e saem juntas.
  const [parecidas, seguindo, minhas] = await Promise.all([
    supabase.rpc("pessoas_parecidas", { p_limite: 30 }),
    supabase.from("follows").select("followee_id").eq("follower_id", user.id),
    supabase.from("profile_tags").select("tag_id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  const pessoas = parecidas.data ?? [];
  const urls = await assinarAvatares(supabase, pessoas.map((p) => p.avatar_path));

  const sigo = new Set((seguindo.data ?? []).map((f) => f.followee_id));
  const semGostos = (minhas.count ?? 0) === 0;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Gente</h1>
        <p className="text-tinta-2">Quem mais gosta do que você gosta, na sua universidade.</p>
      </header>

      {semGostos && (
        <section className="cartao flex flex-col items-start gap-3">
          <h2 className="text-lg font-bold">Conte do que você gosta</h2>
          <p className="text-tinta-2">Sem nenhum gosto marcado, não temos como achar gente parecida com você.</p>
          <Link href="/config#gostos" className="btn btn-pri btn-peq">
            Escolher meus gostos
          </Link>
        </section>
      )}

      {pessoas.length === 0 ? (
        <section className="cartao flex flex-col gap-2">
          <h2 className="text-lg font-bold">Você chegou cedo</h2>
          <p className="text-tinta-2">
            Ainda não tem mais ninguém da sua universidade por aqui. Chame alguém: o Peripatos fica melhor a cada pessoa
            que entra.
          </p>
        </section>
      ) : (
        <ul className="flex flex-col gap-4">
          {pessoas.map((p) => {
            const comuns = (p.tags_em_comum as unknown as Tag[]) ?? [];
            const resto = comuns.length - COMUNS_VISIVEIS;
            return (
              <li key={p.user_id}>
                {/* O cartão inteiro leva ao perfil: o link do nome se estende
                    por ele. O botão de seguir fica por cima e continua seu. */}
                <article className="cartao cartao-elo flex flex-col gap-3" aria-label={p.display_name}>
                  <header className="flex items-center gap-3">
                    <Avatar url={p.avatar_path ? urls.get(p.avatar_path) : null} preset={p.avatar_preset} semente={p.user_id} tamanho={52} nome={p.display_name} />
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-xl leading-tight font-bold">
                        <Link href={`/u/${p.username}`} className="elo-do-cartao">
                          {p.display_name}
                        </Link>
                      </h2>
                      <p className="fino truncate">@{p.username}</p>
                    </div>
                    <span className="por-cima">
                      <BotaoSeguir alvoId={p.user_id} nome={p.display_name} seguindoInicial={sigo.has(p.user_id)} />
                    </span>
                  </header>

                  {p.mutual && <SeloMutuo />}
                  {p.bio && <p className="break-words">{p.bio}</p>}

                  {/* Só o que os dois têm em comum, e o âmbar marca exatamente
                      as tags contadas na frase. */}
                  <div className="flex flex-col gap-2">
                    <p className={`flex items-center gap-2 text-[0.9375rem] font-bold ${comuns.length > 0 ? "text-ambar" : "text-tinta-2"}`}>
                      {comuns.length > 0 && <span aria-hidden="true" className="bg-ambar h-0.5 w-5 rounded-full" />}
                      {fraseEmComum(comuns.length)}
                    </p>
                    {comuns.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5" aria-label="Gostos em comum">
                        {comuns.slice(0, COMUNS_VISIVEIS).map((t) => (
                          <li key={t.id}>
                            <TagChip tag={t} comum />
                          </li>
                        ))}
                        {resto > 0 && (
                          <li className="text-ambar self-center text-[0.8125rem] font-bold" data-testid="mais-em-comum">
                            +{resto} em comum
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
