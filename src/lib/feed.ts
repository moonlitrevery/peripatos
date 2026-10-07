import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assinarAvatares } from "@/lib/avatares";
import type { Database } from "@/lib/database.types";

export type ItemFeed = {
  id: string;
  autorId: string;
  username: string;
  nome: string;
  avatarUrl: string | null;
  preset: number | null;
  corpo: string;
  gifId: string | null;
  /** Título do GIF no Giphy, usado como texto alternativo. */
  gifAlt: string | null;
  criadoEm: string;
  editado: boolean;
  /** "descoberta" = autor sem nenhum gosto em comum; "proprio" = acabou de publicar. */
  origem: "afinidade" | "descoberta" | "proprio";
};

export const TAMANHO_DA_PAGINA = 15;

// Uma página do feed, direto da RPC. A ordenação, a mistura 3:1 e todas as
// regras de visibilidade são do banco; aqui só se assina a URL dos avatares.
export async function paginaDoFeed(supabase: SupabaseClient<Database>, cursor: string | null) {
  const { data, error } = await supabase.rpc("feed", {
    p_cursor: cursor ?? undefined,
    p_limite: TAMANHO_DA_PAGINA,
  });
  if (error) return { itens: [] as ItemFeed[], proximo: null, erro: error };

  const linhas = data ?? [];
  const urls = await assinarAvatares(supabase, linhas.map((l) => l.avatar_path));
  const itens: ItemFeed[] = linhas.map((l) => ({
    id: l.post_id,
    autorId: l.author_id,
    username: l.username,
    nome: l.display_name,
    avatarUrl: l.avatar_path ? (urls.get(l.avatar_path) ?? null) : null,
    preset: l.avatar_preset,
    corpo: l.body,
    gifId: l.gif_id,
    gifAlt: l.gif_alt,
    criadoEm: l.created_at,
    editado: l.edited_at !== null,
    origem: l.origem === "descoberta" ? "descoberta" : "afinidade",
  }));
  return { itens, proximo: linhas[0]?.next_cursor ?? null, erro: null };
}
