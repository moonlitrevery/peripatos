import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export const TOTAL_AVATARES_PRONTOS = 12;

// O bucket é privado: cada imagem precisa de uma URL assinada, e o Storage só
// assina o que o RLS deixa aquele usuário ler (foto aprovada de perfil
// visível, ou a própria). Caminho que o banco não libera simplesmente não
// ganha URL.
export async function assinarAvatares(
  supabase: SupabaseClient<Database>,
  caminhos: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unicos = [...new Set(caminhos.filter((c): c is string => !!c))];
  const mapa = new Map<string, string>();
  if (unicos.length === 0) return mapa;
  const { data } = await supabase.storage.from("avatars").createSignedUrls(unicos, 60 * 60);
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) mapa.set(item.path, item.signedUrl);
  }
  return mapa;
}

// Avatar pronto estável para quem não escolheu nenhum.
export function avatarPadrao(semente: string): number {
  let h = 0;
  for (let i = 0; i < semente.length; i++) h = (h * 31 + semente.charCodeAt(i)) >>> 0;
  return (h % TOTAL_AVATARES_PRONTOS) + 1;
}
