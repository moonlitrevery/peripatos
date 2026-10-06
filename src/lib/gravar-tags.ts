import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Tabela = "profile_tags" | "profile_sensitive_tags";

// Deixa as tags do perfil iguais à lista pedida: apaga as que saíram, insere
// as que entraram. Tudo com a sessão da pessoa; o banco confere o dono, o
// teto e se cada tag está na tabela certa (comum x sensível).
async function sincronizar(supabase: SupabaseClient<Database>, tabela: Tabela, uid: string, desejadas: number[]) {
  const { data: atuais, error } = await supabase.from(tabela).select("tag_id").eq("user_id", uid);
  if (error) return error;

  const tem = new Set((atuais ?? []).map((l) => l.tag_id));
  const quer = new Set(desejadas);
  const remover = [...tem].filter((id) => !quer.has(id));
  const inserir = [...quer].filter((id) => !tem.has(id));

  if (remover.length > 0) {
    const r = await supabase.from(tabela).delete().eq("user_id", uid).in("tag_id", remover);
    if (r.error) return r.error;
  }
  if (inserir.length > 0) {
    const r = await supabase.from(tabela).insert(inserir.map((tag_id) => ({ tag_id })));
    if (r.error) return r.error;
  }
  return null;
}

export async function gravarTags(supabase: SupabaseClient<Database>, uid: string, comuns: number[], sensiveis: number[]) {
  return (
    (await sincronizar(supabase, "profile_tags", uid, comuns)) ??
    (await sincronizar(supabase, "profile_sensitive_tags", uid, sensiveis))
  );
}
