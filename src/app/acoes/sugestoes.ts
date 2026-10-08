"use server";

import { assinarAvatares } from "@/lib/avatares";
import { createClient } from "@/lib/supabase/server";

export type Sugestao = {
  id: string;
  username: string;
  nome: string;
  avatarUrl: string | null;
  preset: number | null;
  emComum: number;
};

// Gente parecida que a pessoa ainda não segue, para a coluna da direita no
// desktop. Só é chamada quando essa coluna existe na tela: no celular esta
// consulta nem acontece. A lista, a ordem e quem pode aparecer são do banco.
export async function sugestoesDeGente(): Promise<Sugestao[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [parecidas, sigo] = await Promise.all([
    supabase.rpc("pessoas_parecidas", { p_limite: 20 }),
    supabase.from("follows").select("followee_id").eq("follower_id", user.id),
  ]);
  const jaSigo = new Set((sigo.data ?? []).map((f) => f.followee_id));
  const escolhidas = (parecidas.data ?? []).filter((p) => !jaSigo.has(p.user_id) && Number(p.afinidade) > 0).slice(0, 5);
  const urls = await assinarAvatares(supabase, escolhidas.map((p) => p.avatar_path));

  return escolhidas.map((p) => ({
    id: p.user_id,
    username: p.username,
    nome: p.display_name,
    avatarUrl: p.avatar_path ? (urls.get(p.avatar_path) ?? null) : null,
    preset: p.avatar_preset,
    emComum: Array.isArray(p.tags_em_comum) ? p.tags_em_comum.length : 0,
  }));
}
