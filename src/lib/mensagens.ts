import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type Mensagem = {
  id: string;
  minha: boolean;
  corpo: string;
  gifId: string | null;
  gifAlt: string | null;
  criadaEm: string;
};

export const MENSAGENS_POR_PAGINA = 50;

type Linha = { id: string; sender_id: string; body: string; gif_id: string | null; gif_alt: string | null; created_at: string };
const COLUNAS = "id, sender_id, body, gif_id, gif_alt, created_at";

export function deLinha(l: Linha, uid: string): Mensagem {
  return { id: l.id, minha: l.sender_id === uid, corpo: l.body, gifId: l.gif_id, gifAlt: l.gif_alt, criadaEm: l.created_at };
}

// As mensagens mais recentes de uma conversa, da mais antiga para a mais nova.
// O RLS decide se quem pede pode ler: conversa alheia ou escondida por
// bloqueio volta vazia.
export async function ultimasMensagens(supabase: SupabaseClient<Database>, conversaId: string, uid: string, antesDe?: string) {
  let consulta = supabase
    .from("messages")
    .select(COLUNAS)
    .eq("conversation_id", conversaId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MENSAGENS_POR_PAGINA + 1);
  if (antesDe) consulta = consulta.lt("created_at", antesDe);
  const { data, error } = await consulta;
  if (error) return { mensagens: [] as Mensagem[], haMais: false, erro: error };
  const linhas = data ?? [];
  return {
    mensagens: linhas.slice(0, MENSAGENS_POR_PAGINA).reverse().map((l) => deLinha(l, uid)),
    haMais: linhas.length > MENSAGENS_POR_PAGINA,
    erro: null,
  };
}

export async function umaMensagem(supabase: SupabaseClient<Database>, id: string, uid: string): Promise<Mensagem | null> {
  const { data } = await supabase.from("messages").select(COLUNAS).eq("id", id).maybeSingle();
  return data ? deLinha(data, uid) : null;
}
