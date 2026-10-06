import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AcoesDoPerfil } from "@/components/AcoesDoPerfil";
import { Avatar } from "@/components/Avatar";
import { Post } from "@/components/Post";
import { TagChip } from "@/components/TagChip";
import { assinarAvatares } from "@/lib/avatares";
import { exigirSessao } from "@/lib/sessao";
import { deLinha, fraseEmComum, type Tag } from "@/lib/tags";

export async function generateMetadata({ params }: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username}` };
}

const CARGOS = { admin: "Administração", moderador: "Moderação" } as const;
const TAGS = "tags(id, slug, name, category, is_sensitive)";

export default async function Perfil({ params }: PageProps<"/u/[username]">) {
  const { username } = await params;
  const { supabase, user } = await exigirSessao();

  // O RLS decide se este perfil existe para quem está olhando: outra
  // instituição, bloqueio ou banimento devolvem "não encontrado".
  const { data: perfil } = await supabase
    .from("profiles")
    .select("id, username, display_name, bio, avatar_path, avatar_status, avatar_preset")
    .eq("username", username.toLowerCase())
    .maybeSingle();
  if (!perfil) notFound();

  const ehMeu = perfil.id === user.id;
  const par = `and(follower_id.eq.${user.id},followee_id.eq.${perfil.id}),and(follower_id.eq.${perfil.id},followee_id.eq.${user.id})`;

  const [tags, sensiveis, minhas, minhasSens, follows, cargo, posts, urls] = await Promise.all([
    supabase.from("profile_tags").select(TAGS).eq("user_id", perfil.id),
    // Tags sensíveis: a consulta é sempre feita; o banco só devolve linhas
    // para o dono e para mutuals. Aqui não existe "se for mutual, mostre".
    supabase.from("profile_sensitive_tags").select(TAGS).eq("user_id", perfil.id),
    supabase.from("profile_tags").select("tag_id").eq("user_id", user.id),
    supabase.from("profile_sensitive_tags").select("tag_id").eq("user_id", user.id),
    ehMeu ? Promise.resolve({ data: [] }) : supabase.from("follows").select("follower_id").or(par),
    supabase.from("staff_roles").select("role").eq("user_id", perfil.id).maybeSingle(),
    supabase
      .from("posts")
      .select("id, body, gif_id, created_at, edited_at")
      .eq("author_id", perfil.id)
      .order("created_at", { ascending: false })
      .limit(30),
    assinarAvatares(supabase, [perfil.avatar_status === "aprovado" ? perfil.avatar_path : null]),
  ]);

  const doPerfil: Tag[] = [...(tags.data ?? []), ...(sensiveis.data ?? [])].flatMap((l) => (l.tags ? [deLinha(l.tags)] : []));
  const meus = new Set([...(minhas.data ?? []), ...(minhasSens.data ?? [])].map((l) => l.tag_id));
  const comuns = ehMeu ? [] : doPerfil.filter((t) => meus.has(t.id));
  const demais = ehMeu ? doPerfil : doPerfil.filter((t) => !meus.has(t.id));

  const seguindo = (follows.data ?? []).some((f) => f.follower_id === user.id);
  const segueVoce = (follows.data ?? []).some((f) => f.follower_id === perfil.id);
  const avatarUrl = perfil.avatar_path ? (urls.get(perfil.avatar_path) ?? null) : null;
  const nome = perfil.display_name ?? "";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div className="flex items-end gap-4">
          <Avatar url={avatarUrl} preset={perfil.avatar_preset} semente={perfil.id} tamanho={84} />
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="text-3xl leading-tight font-bold break-words">{nome}</h1>
            <p className="text-tinta-2">@{perfil.username}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 empty:hidden">
          {cargo.data && (
            <span className="bg-petroleo text-sobre-petroleo rounded-full px-3 py-1 text-[0.75rem] font-bold">
              {CARGOS[cargo.data.role]}
            </span>
          )}
          {seguindo && segueVoce && (
            <span className="text-petroleo border-petroleo rounded-full border-[1.5px] px-3 py-1 text-[0.75rem] font-bold">
              Vocês se seguem
            </span>
          )}
          {!seguindo && segueVoce && (
            <span className="border-linha text-tinta-2 rounded-full border px-3 py-1 text-[0.75rem] font-semibold">
              Segue você
            </span>
          )}
        </div>
        {perfil.bio && <p className="break-words whitespace-pre-wrap">{perfil.bio}</p>}
        {ehMeu ? (
          <Link href="/config" className="btn btn-sec btn-peq self-start">
            Editar perfil
          </Link>
        ) : (
          <AcoesDoPerfil alvoId={perfil.id} nome={nome} seguindo={seguindo} segueVoce={segueVoce} />
        )}
      </header>

      <section aria-labelledby="titulo-gostos" className="flex flex-col gap-3">
        <h2 id="titulo-gostos" className="text-xl font-bold">
          Gostos
        </h2>
        {!ehMeu && (
          <p className={`flex items-center gap-2 text-[0.9375rem] font-bold ${comuns.length > 0 ? "text-ambar" : "text-tinta-2"}`}>
            {comuns.length > 0 && <span aria-hidden="true" className="bg-ambar h-0.5 w-5 rounded-full" />}
            {fraseEmComum(comuns.length)}
          </p>
        )}
        {doPerfil.length === 0 ? (
          <p className="text-tinta-2">{ehMeu ? "Você ainda não marcou nenhum gosto." : "Ainda não marcou nenhum gosto."}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {comuns.map((t) => (
              <li key={t.id}>
                <TagChip tag={t} comum />
              </li>
            ))}
            {demais.map((t) => (
              <li key={t.id}>
                <TagChip tag={t} discreta={!ehMeu} />
              </li>
            ))}
          </ul>
        )}
        {doPerfil.some((t) => t.sensivel) && (
          <p className="fino">
            {ehMeu
              ? "As tags com cadeado só aparecem para quem você segue e que te segue de volta."
              : "As tags com cadeado aparecem porque vocês se seguem."}
          </p>
        )}
      </section>

      <section aria-labelledby="titulo-posts" className="flex flex-col gap-3">
        <h2 id="titulo-posts" className="text-xl font-bold">
          Posts
        </h2>
        {(posts.data ?? []).length === 0 ? (
          <p className="text-tinta-2">Nenhum post ainda.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {(posts.data ?? []).map((p) => (
              <li key={p.id}>
                <Post
                  item={{
                    id: p.id,
                    autorId: perfil.id,
                    username: perfil.username ?? "",
                    nome,
                    avatarUrl,
                    preset: perfil.avatar_preset,
                    corpo: p.body,
                    gifId: p.gif_id,
                    criadoEm: p.created_at,
                    editado: p.edited_at !== null,
                    origem: "afinidade",
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
