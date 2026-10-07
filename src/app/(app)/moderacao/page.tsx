import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { banir, moderarAvatar, ocultarPost, resolverDenuncia } from "@/app/acoes/moderacao";
import { Gif } from "@/components/Gif";
import { rotuloDoMotivo } from "@/lib/denuncias";
import { exigirSessao, meuCargo, nivelDaSessao } from "@/lib/sessao";
import { haQuantoTempo } from "@/lib/tempo";
import { AcaoComMotivo } from "./AcaoComMotivo";

export const metadata: Metadata = { title: "Moderação" };

export default async function Moderacao() {
  const { supabase } = await exigirSessao();

  // Quem não é staff volta para o Início. Isto é só navegação: sem cargo, as
  // consultas abaixo voltariam vazias e as RPCs recusariam de qualquer jeito.
  const cargo = await meuCargo();
  if (!cargo) redirect("/");
  // Staff sem o segundo fator confirmado neste login vai confirmar antes. Sem
  // isso o banco devolveria as filas vazias e recusaria qualquer ação.
  if ((await nivelDaSessao()) !== "aal2") redirect("/moderacao/verificacao");

  const [denuncias, pendentes] = await Promise.all([
    supabase
      .from("reports")
      .select("id, reason, details, status, created_at, post_id, profile_id")
      .in("status", ["aberta", "em_analise"])
      .order("created_at", { ascending: true })
      .limit(50),
    supabase
      .from("profiles")
      .select("id, username, display_name, avatar_path")
      .eq("avatar_status", "pendente")
      .order("updated_at", { ascending: true })
      .limit(50),
  ]);

  const lista = denuncias.data ?? [];
  const idsPosts = lista.flatMap((d) => (d.post_id ? [d.post_id] : []));
  const { data: posts } = await supabase
    .from("posts")
    .select("id, body, gif_id, gif_alt, author_id, hidden_at, deleted_at")
    .in("id", idsPosts);
  const postPorId = new Map((posts ?? []).map((p) => [p.id, p]));

  const idsPerfis = [
    ...new Set([...lista.flatMap((d) => (d.profile_id ? [d.profile_id] : [])), ...(posts ?? []).map((p) => p.author_id)]),
  ];
  const { data: perfis } = await supabase.from("profiles").select("id, username, display_name, bio, banned_at").in("id", idsPerfis);
  const perfilPorId = new Map((perfis ?? []).map((p) => [p.id, p]));

  const fotos = pendentes.data ?? [];
  const caminhos = fotos.flatMap((f) => (f.avatar_path ? [f.avatar_path] : []));
  const { data: assinadas } = caminhos.length
    ? await supabase.storage.from("avatars").createSignedUrls(caminhos, 600)
    : { data: [] };
  const urlDe = new Map((assinadas ?? []).map((a) => [a.path, a.signedUrl]));

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <Link href="/voce" className="text-petroleo text-sm font-semibold underline underline-offset-4">
          ‹ Você
        </Link>
        <h1 className="text-3xl font-bold">Moderação</h1>
        <p className="text-tinta-2">Toda ação aqui pede um motivo e fica registrada com o seu nome.</p>
      </header>

      <section aria-labelledby="t-denuncias" className="flex flex-col gap-4">
        <h2 id="t-denuncias" className="text-xl font-bold">
          Denúncias em aberto ({lista.length})
        </h2>
        {lista.length === 0 && <p className="text-tinta-2">Nenhuma denúncia esperando.</p>}
        <ul className="flex flex-col gap-4">
          {lista.map((d) => {
            const post = d.post_id ? postPorId.get(d.post_id) : undefined;
            const alvoId = post?.author_id ?? d.profile_id;
            const alvo = alvoId ? perfilPorId.get(alvoId) : undefined;
            return (
              <li key={d.id}>
                <article className="cartao flex flex-col gap-3" aria-label={`Denúncia: ${rotuloDoMotivo(d.reason)}`}>
                  <header className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-lg font-bold">{rotuloDoMotivo(d.reason)}</h3>
                    <p className="fino">
                      {d.post_id ? "Post" : "Perfil"} · <time dateTime={d.created_at}>{haQuantoTempo(d.created_at)}</time>
                    </p>
                  </header>
                  {d.details && (
                    <p>
                      <span className="fino block">Quem denunciou escreveu:</span>
                      {d.details}
                    </p>
                  )}

                  <div className="border-linha bg-fundo flex flex-col gap-2 rounded-2xl border p-3">
                    <p className="fino">
                      {post ? "Post de " : "Perfil de "}
                      {alvo ? (
                        <Link href={`/u/${alvo.username}`} className="text-petroleo font-semibold underline underline-offset-4">
                          {alvo.display_name} (@{alvo.username})
                        </Link>
                      ) : (
                        "conta que não existe mais"
                      )}
                      {alvo?.banned_at && " · já banido"}
                      {post?.hidden_at && " · já oculto"}
                      {post?.deleted_at && " · apagado pelo autor"}
                    </p>
                    {post && post.body && <p className="break-words whitespace-pre-wrap">{post.body}</p>}
                    {post?.gif_id && <Gif id={post.gif_id} alt={post.gif_alt} />}
                    {!post && alvo?.bio && <p className="break-words whitespace-pre-wrap">{alvo.bio}</p>}
                    {d.post_id && !post && <p className="text-tinta-2">O post não está mais disponível.</p>}
                  </div>

                  <footer className="flex flex-wrap gap-2">
                    {post && !post.hidden_at && (
                      <AcaoComMotivo
                        rotulo="Ocultar post"
                        titulo="Ocultar este post"
                        explicacao="O post some para todos, inclusive para quem escreveu."
                        acao={ocultarPost.bind(null, post.id)}
                      />
                    )}
                    {alvo && !alvo.banned_at && (
                      <AcaoComMotivo
                        rotulo="Banir"
                        titulo={`Banir ${alvo.display_name}`}
                        explicacao="A conta some para todos, perde o acesso e o e-mail não consegue se cadastrar de novo."
                        perigo
                        acao={banir.bind(null, alvo.id)}
                      />
                    )}
                    <AcaoComMotivo
                      rotulo="Resolver"
                      titulo="Marcar como resolvida"
                      explicacao="Use depois de agir (ou quando o problema já foi tratado)."
                      acao={resolverDenuncia.bind(null, d.id, "resolvida")}
                    />
                    <AcaoComMotivo
                      rotulo="Rejeitar"
                      titulo="Rejeitar a denúncia"
                      explicacao="Use quando a denúncia não procede."
                      acao={resolverDenuncia.bind(null, d.id, "rejeitada")}
                    />
                  </footer>
                </article>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="t-avatares" className="flex flex-col gap-4">
        <h2 id="t-avatares" className="text-xl font-bold">
          Fotos aguardando aprovação ({fotos.length})
        </h2>
        {fotos.length === 0 && <p className="text-tinta-2">Nenhuma foto esperando.</p>}
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fotos.map((f) => (
            <li key={f.id}>
              <article className="cartao flex flex-col gap-3" aria-label={`Foto de ${f.display_name}`}>
                {f.avatar_path && urlDe.get(f.avatar_path) ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage
                  <img
                    src={urlDe.get(f.avatar_path) ?? undefined}
                    alt={`Foto enviada por ${f.display_name}`}
                    className="bg-papel-2 aspect-square w-full rounded-2xl object-cover"
                  />
                ) : (
                  <p className="text-tinta-2">Arquivo indisponível.</p>
                )}
                <p className="font-semibold">
                  {f.display_name} <span className="fino font-normal">@{f.username}</span>
                </p>
                <footer className="flex flex-wrap gap-2">
                  <AcaoComMotivo rotulo="Aprovar" titulo="Aprovar esta foto" acao={moderarAvatar.bind(null, f.id, true)} />
                  <AcaoComMotivo rotulo="Recusar" titulo="Recusar esta foto" perigo acao={moderarAvatar.bind(null, f.id, false)} />
                </footer>
              </article>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
