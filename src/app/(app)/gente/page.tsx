import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { BotaoSeguir } from "@/components/BotaoSeguir";
import { TagChip } from "@/components/TagChip";
import { assinarAvatares } from "@/lib/avatares";
import { exigirSessao } from "@/lib/sessao";
import { deLinha, fraseEmComum, type Tag } from "@/lib/tags";

export const metadata: Metadata = { title: "Gente" };

const OUTRAS_VISIVEIS = 4;

export default async function Gente() {
  const { supabase, user } = await exigirSessao();

  // A RPC já devolve a lista ordenada por afinidade e as tags em comum. As
  // sensíveis só vêm quando os dois se seguem: a interface não filtra nada,
  // mostra o que o banco mandou.
  const { data } = await supabase.rpc("pessoas_parecidas", { p_limite: 30 });
  const pessoas = data ?? [];
  const ids = pessoas.map((p) => p.user_id);

  const [seguindo, outras, urls, minhas] = await Promise.all([
    supabase.from("follows").select("followee_id").eq("follower_id", user.id).in("followee_id", ids),
    supabase.from("profile_tags").select("user_id, tags(id, slug, name, category, is_sensitive)").in("user_id", ids),
    assinarAvatares(supabase, pessoas.map((p) => p.avatar_path)),
    supabase.from("profile_tags").select("tag_id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);

  const sigo = new Set((seguindo.data ?? []).map((f) => f.followee_id));
  const tagsDe = new Map<string, Tag[]>();
  for (const linha of outras.data ?? []) {
    if (!linha.tags) continue;
    const lista = tagsDe.get(linha.user_id) ?? [];
    lista.push(deLinha(linha.tags));
    tagsDe.set(linha.user_id, lista);
  }
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
            const idsComuns = new Set(comuns.map((t) => t.id));
            const demais = (tagsDe.get(p.user_id) ?? []).filter((t) => !idsComuns.has(t.id));
            const resto = demais.length - OUTRAS_VISIVEIS;
            return (
              <li key={p.user_id}>
                <article className="cartao flex flex-col gap-3" aria-label={p.display_name}>
                  <header className="flex items-center gap-3">
                    <Avatar url={p.avatar_path ? urls.get(p.avatar_path) : null} preset={p.avatar_preset} semente={p.user_id} tamanho={52} />
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-xl leading-tight font-bold">
                        <Link href={`/u/${p.username}`}>{p.display_name}</Link>
                      </h2>
                      <p className="fino truncate">@{p.username}</p>
                    </div>
                    {p.mutual && (
                      <span className="text-petroleo border-petroleo rounded-full border-[1.5px] px-2.5 py-1 text-[0.75rem] font-bold whitespace-nowrap">
                        Vocês se seguem
                      </span>
                    )}
                  </header>

                  {p.bio && <p className="break-words">{p.bio}</p>}

                  {/* O âmbar marca exatamente as tags contadas na frase: nem uma a mais, nem uma a menos. */}
                  <div className="flex flex-col gap-2">
                    <p className={`flex items-center gap-2 text-[0.9375rem] font-bold ${comuns.length > 0 ? "text-ambar" : "text-tinta-2"}`}>
                      {comuns.length > 0 && <span aria-hidden="true" className="bg-ambar h-0.5 w-5 rounded-full" />}
                      {fraseEmComum(comuns.length)}
                    </p>
                    {(comuns.length > 0 || demais.length > 0) && (
                      <ul className="flex flex-wrap gap-1.5" aria-label="Gostos">
                        {comuns.map((t) => (
                          <li key={t.id}>
                            <TagChip tag={t} comum />
                          </li>
                        ))}
                        {demais.slice(0, OUTRAS_VISIVEIS).map((t) => (
                          <li key={t.id}>
                            <TagChip tag={t} discreta />
                          </li>
                        ))}
                        {resto > 0 && (
                          <li className="fino self-center">
                            e mais {resto}
                          </li>
                        )}
                      </ul>
                    )}
                  </div>

                  <footer className="flex items-center gap-3">
                    <BotaoSeguir alvoId={p.user_id} nome={p.display_name} seguindoInicial={sigo.has(p.user_id)} />
                    <Link href={`/u/${p.username}`} className="text-petroleo text-sm font-semibold underline underline-offset-4">
                      Ver perfil
                    </Link>
                  </footer>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
