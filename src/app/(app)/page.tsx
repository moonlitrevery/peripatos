import { Feed } from "@/components/Feed";
import { assinarAvatares } from "@/lib/avatares";
import { paginaDoFeed } from "@/lib/feed";
import { exigirSessao, meuPerfil } from "@/lib/sessao";

export default async function Inicio() {
  const { supabase } = await exigirSessao();
  const perfil = await meuPerfil();
  const [{ itens, proximo }, urls] = await Promise.all([
    paginaDoFeed(supabase, null),
    assinarAvatares(supabase, [perfil.avatar_status === "aprovado" ? perfil.avatar_path : null]),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">Início</h1>
      <Feed
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
