import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assinarAvatares } from "@/lib/avatares";
import type { AbaDoFeed } from "@/lib/aba-do-inicio";
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
  /** "descoberta" = fora do círculo (não sigo e não temos gosto em comum); "proprio" = acabou de publicar. */
  origem: "afinidade" | "descoberta" | "proprio";
  /** Publicado na tela, ainda esperando a resposta do servidor. */
  enviando?: boolean;
};



export const TAMANHO_DA_PAGINA = 15;

// Uma página de uma das abas do Início, direto da RPC. Quem aparece, a ordem
// (a hora), a mistura 3:1 da aba Para você e todas as regras de visibilidade
// são do banco; aqui só se assina a URL dos avatares.
export async function paginaDoFeed(supabase: SupabaseClient<Database>, aba: AbaDoFeed, cursor: string | null) {
  const { data, error } = await supabase.rpc(aba === "seguindo" ? "feed_seguindo" : "feed_para_voce", {
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
