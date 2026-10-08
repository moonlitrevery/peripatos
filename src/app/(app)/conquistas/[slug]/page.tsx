import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Medalha } from "@/components/Conquista";
import { assinarAvatares } from "@/lib/avatares";
import { COLUNAS_DA_CONQUISTA, deLinha } from "@/lib/conquistas";
import { exigirSessao } from "@/lib/sessao";

export const metadata: Metadata = { title: "Conquista" };

export default async function PaginaDaConquista({ params }: PageProps<"/conquistas/[slug]">) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) notFound();
  const { supabase, user } = await exigirSessao();

  // O RLS decide se esta conquista existe para quem está olhando: uma
  // secreta que a pessoa nunca viu devolve "não encontrada", igual a um
  // endereço inventado.
  const { data: linha } = await supabase.from("achievements").select(COLUNAS_DA_CONQUISTA).eq("slug", slug).maybeSingle();
  if (!linha) notFound();
  const conquista = deLinha(linha);

  // Quem tem: o banco só devolve quem deixou a conquista à mostra e é
  // visível para quem lê (mais a própria linha, mesmo oculta).
  const { data: linhas } = await supabase
    .from("user_achievements")
    .select("user_id, hidden, profiles(id, username, display_name, avatar_path, avatar_status, avatar_preset)")
    .eq("achievement_slug", slug)
    .limit(200);
  const minha = (linhas ?? []).find((l) => l.user_id === user.id);
  const pessoas = (linhas ?? [])
    .filter((l) => !l.hidden)
    .flatMap((l) => (l.profiles ? [l.profiles] : []))
    .sort((a, b) => (a.display_name ?? "").localeCompare(b.display_name ?? "", "pt-BR"));
  const urls = await assinarAvatares(supabase, pessoas.map((p) => (p.avatar_status === "aprovado" ? p.avatar_path : null)));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Link href="/conquistas" className="text-petroleo self-start text-sm font-semibold underline underline-offset-4">
          ‹ Conquistas
        </Link>
        <div className="flex items-center gap-4">
          <Medalha conquista={conquista} tamanho={72} />
          <div className="min-w-0">
            <h1 className="text-3xl leading-tight font-bold break-words">{conquista.nome}</h1>
            {conquista.secreta && <p className="fino">Conquista secreta</p>}
          </div>
        </div>
        <p>{conquista.descricao}</p>
        {minha && (
          <p className="text-petroleo font-semibold" data-testid="voce-tem">
            Você tem esta conquista{minha.hidden ? ", escondida do seu perfil." : "."}
          </p>
        )}
      </header>

      <section aria-labelledby="t-quem" className="flex flex-col gap-3">
        <h2 id="t-quem" className="text-xl font-bold">
          Quem tem ({pessoas.length})
        </h2>
        {pessoas.length === 0 ? (
          <p className="text-tinta-2">Ninguém que você possa ver mostra esta conquista no perfil.</p>
        ) : (
          <ul className="flex flex-col gap-3" aria-label={`Quem tem ${conquista.nome}`}>
            {pessoas.map((p) => (
              <li key={p.id}>
                <Link href={`/u/${p.username}`} className="cartao flex items-center gap-3">
                  <Avatar
                    url={p.avatar_status === "aprovado" && p.avatar_path ? urls.get(p.avatar_path) : null}
                    preset={p.avatar_preset}
                    semente={p.id}
                    tamanho={40}
                    nome={p.display_name}
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold break-words">{p.display_name}</span>
                    <span className="text-tinta-2 block text-sm">@{p.username}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="fino">Aparece aqui só quem deixou a conquista visível no perfil.</p>
      </section>
    </div>
  );
}
