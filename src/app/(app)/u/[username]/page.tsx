import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { concederConquista } from "@/app/acoes/conquistas";
import { AcoesDoPerfil } from "@/components/AcoesDoPerfil";
import { Avatar } from "@/components/Avatar";
import { Cargo } from "@/components/Cargo";
import { SeloDeConquista } from "@/components/Conquista";
import { MenuDoPost } from "@/components/MenuDoPost";
import { Post } from "@/components/Post";
import { SeloMutuo } from "@/components/SeloMutuo";
import { TagChip } from "@/components/TagChip";
import { assinarAvatares } from "@/lib/avatares";
import { COLUNAS_DA_CONQUISTA, deLinha as conquistaDeLinha } from "@/lib/conquistas";
import { exigirSessao, meuCargo, nivelDaSessao } from "@/lib/sessao";
import { AcaoComMotivo } from "../../moderacao/AcaoComMotivo";
import { deLinha, fraseEmComum, type Tag } from "@/lib/tags";

export async function generateMetadata({ params }: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username}` };
}

const TAGS = "tags(id, slug, name, category, is_sensitive)";

// As conquistas que só a administração concede, à mão.
const MANUAIS = [
  { slug: "heracles", nome: "Héracles", para: "Para quem reportou um bug que foi confirmado." },
  { slug: "hefesto", nome: "Hefesto", para: "Para quem deu uma sugestão que virou funcionalidade." },
];

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
  // Duas consultas com .eq(), e não um .or() montado com texto: filtro do
  // PostgREST escrito por concatenação é injeção de filtro esperando um
  // valor que venha do usuário.
  const segue = (de: string, para: string) =>
    supabase.from("follows").select("follower_id").eq("follower_id", de).eq("followee_id", para).limit(1);
  const ninguem = Promise.resolve({ data: [] as { follower_id: string }[] });

  const [tags, sensiveis, minhas, euSigo, meSegue, cargo, posts, urls, conquistasDoPerfil, cargoDeQuemVe, nivel] = await Promise.all([
    supabase.from("profile_tags").select(TAGS).eq("user_id", perfil.id),
    // Tags sensíveis: a consulta é sempre feita; o banco só devolve linhas
    // para o dono e para mutuals. Aqui não existe "se for mutual, mostre".
    supabase.from("profile_sensitive_tags").select(TAGS).eq("user_id", perfil.id),
    // Só os GOSTOS de quem olha entram na conta de "em comum". As tags
    // sensíveis de quem olha nem são consultadas: não são gostos.
    supabase.from("profile_tags").select("tag_id").eq("user_id", user.id),
    ehMeu ? ninguem : segue(user.id, perfil.id),
    ehMeu ? ninguem : segue(perfil.id, user.id),
    supabase.from("staff_roles").select("role").eq("user_id", perfil.id).maybeSingle(),
    supabase
      .from("posts")
      .select("id, body, gif_id, gif_alt, created_at, edited_at")
      .eq("author_id", perfil.id)
      .order("created_at", { ascending: false })
      .limit(30),
    assinarAvatares(supabase, [perfil.avatar_status === "aprovado" ? perfil.avatar_path : null]),
    // Conquistas: o banco devolve as que a pessoa deixou à mostra (no próprio
    // perfil, todas, com as ocultas marcadas).
    supabase.from("user_achievements").select(`hidden, achievements(${COLUNAS_DA_CONQUISTA})`).eq("user_id", perfil.id),
    meuCargo(),
    nivelDaSessao(),
  ]);

  const conquistas = (conquistasDoPerfil.data ?? [])
    .flatMap((l) => (l.achievements ? [{ ...conquistaDeLinha(l.achievements), oculta: l.hidden }] : []))
    .sort((a, b) => a.posicao - b.posicao);
  // Esconder os botões é conforto: a RPC recusa quem não é admin com o segundo
  // fator, e registra a concessão em moderation_actions.
  const podeConceder = !ehMeu && cargoDeQuemVe === "admin" && nivel === "aal2";
  const concessoes = podeConceder ? MANUAIS.filter((m) => !conquistas.some((c) => c.slug === m.slug)) : [];

  const doPerfil: Tag[] = (tags.data ?? []).flatMap((l) => (l.tags ? [deLinha(l.tags)] : []));
  // Orientação, gênero e religião ficam numa seção à parte ("Sobre"), sem
  // âmbar e sem contagem: nunca são "em comum".
  const sobre: Tag[] = (sensiveis.data ?? []).flatMap((l) => (l.tags ? [deLinha(l.tags)] : []));
  const meus = new Set((minhas.data ?? []).map((l) => l.tag_id));
  const comuns = ehMeu ? [] : doPerfil.filter((t) => meus.has(t.id));
  const demais = ehMeu ? doPerfil : doPerfil.filter((t) => !meus.has(t.id));

  const seguindo = (euSigo.data ?? []).length > 0;
  const segueVoce = (meSegue.data ?? []).length > 0;
  const avatarUrl = perfil.avatar_path ? (urls.get(perfil.avatar_path) ?? null) : null;
  const nome = perfil.display_name ?? "";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div className="flex items-end gap-4">
          <Avatar url={avatarUrl} preset={perfil.avatar_preset} semente={perfil.id} tamanho={84} nome={nome} />
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="text-3xl leading-tight font-bold break-words">{nome}</h1>
            <p className="text-tinta-2">@{perfil.username}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 empty:hidden">
          {cargo.data && <Cargo papel={cargo.data.role} />}
          {seguindo && segueVoce && <SeloMutuo />}
          {!seguindo && segueVoce && <SeloMutuo tipo="segue-voce" />}
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
      </section>

      {sobre.length > 0 && (
        <section aria-labelledby="titulo-sobre" className="flex flex-col gap-3">
          <h2 id="titulo-sobre" className="text-xl font-bold">
            Sobre
          </h2>
          <ul className="flex flex-wrap gap-1.5">
            {sobre.map((t) => (
              <li key={t.id}>
                <TagChip tag={t} neutra />
              </li>
            ))}
          </ul>
          <p className="fino">
            {ehMeu
              ? "Esta seção só aparece para quem você segue e que te segue de volta. Não conta como gosto em comum com ninguém."
              : "Você vê esta seção porque vocês se seguem."}
          </p>
        </section>
      )}

      {(conquistas.length > 0 || ehMeu || concessoes.length > 0) && (
        <section aria-labelledby="titulo-conquistas" className="flex flex-col gap-3">
          <h2 id="titulo-conquistas" className="text-xl font-bold">
            Conquistas
          </h2>
          {conquistas.length === 0 ? (
            <p className="text-tinta-2">{ehMeu ? "Você ainda não tem nenhuma conquista." : "Nenhuma conquista à mostra."}</p>
          ) : (
            <ul className="flex flex-wrap gap-2" aria-label={ehMeu ? "Suas conquistas" : `Conquistas de ${nome}`}>
              {conquistas.map((c) => (
                <li key={c.slug}>
                  <SeloDeConquista conquista={c} oculta={c.oculta} />
                </li>
              ))}
            </ul>
          )}
          {ehMeu && (
            <p className="fino">
              As ocultas só você vê.{" "}
              <Link href="/conquistas" className="text-petroleo font-semibold underline underline-offset-4">
                Escolher o que aparece
              </Link>
            </p>
          )}
          {concessoes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {concessoes.map((m) => (
                <AcaoComMotivo
                  key={m.slug}
                  rotulo={`Conceder ${m.nome}`}
                  titulo={`Conceder ${m.nome} a ${nome}`}
                  explicacao={`${m.para} A concessão é permanente e fica registrada.`}
                  acao={concederConquista.bind(null, perfil.id, m.slug)}
                />
              ))}
            </div>
          )}
        </section>
      )}

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
                    gifAlt: p.gif_alt,
                    criadoEm: p.created_at,
                    editado: p.edited_at !== null,
                    origem: "afinidade",
                  }}
                  menu={ehMeu ? undefined : <MenuDoPost id={p.id} nome={nome} />}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
