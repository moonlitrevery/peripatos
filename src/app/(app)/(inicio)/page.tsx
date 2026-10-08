import { cookies } from "next/headers";
import { Feed } from "@/components/Feed";
import { assinarAvatares } from "@/lib/avatares";
import { abaValida, COOKIE_DA_ABA } from "@/lib/aba-do-inicio";
import { paginaDoFeed } from "@/lib/feed";
import { exigirSessao, meuPerfil } from "@/lib/sessao";

export default async function Inicio() {
  const { supabase } = await exigirSessao();
  // A aba que a pessoa deixou aberta da última vez, lembrada neste aparelho.
  const aba = abaValida((await cookies()).get(COOKIE_DA_ABA)?.value);
  // O perfil e a primeira página do feed não dependem um do outro: saem juntos.
  const [perfil, { itens, proximo }] = await Promise.all([meuPerfil(), paginaDoFeed(supabase, aba, null)]);
  const urls = await assinarAvatares(supabase, [perfil.avatar_status === "aprovado" ? perfil.avatar_path : null]);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">Início</h1>
      <Feed
        abaInicial={aba}
        inicial={itens}
        cursorInicial={proximo}
        eu={{
          id: perfil.id,
          username: perfil.username ?? "",
          nome: perfil.display_name ?? "",
          avatarUrl: perfil.avatar_path ? (urls.get(perfil.avatar_path) ?? null) : null,
          preset: perfil.avatar_preset,
        }}
      />
    </div>
  );
}
