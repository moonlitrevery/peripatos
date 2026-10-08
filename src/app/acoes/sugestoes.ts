"use server";

import { assinarAvatares } from "@/lib/avatares";
import { createClient } from "@/lib/supabase/server";
import type { Tag } from "@/lib/tags";

export type Sugestao = {
  id: string;
  username: string;
  nome: string;
  avatarUrl: string | null;
  preset: number | null;
  emComum: number;
};

export type RecemChegado = {
  id: string;
  username: string;
  nome: string;
  avatarUrl: string | null;
  preset: number | null;
  seguindo: boolean;
  comuns: Tag[];
};

export type ColunaDeGente = { tipo: "parecidas"; pessoas: Sugestao[] } | { tipo: "recem-chegados"; pessoas: RecemChegado[] };

// A coluna da direita no desktop: gente parecida que a pessoa ainda não segue
// e, quando ela já segue todo mundo parecido, quem chegou nos últimos 14 dias.
// Só é chamada quando essa coluna existe na tela: no celular esta consulta nem
// acontece. A lista, a ordem e quem pode aparecer são do banco.
export async function sugestoesDeGente(): Promise<ColunaDeGente> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { tipo: "parecidas", pessoas: [] };

  const [parecidas, sigo] = await Promise.all([
    supabase.rpc("pessoas_parecidas", { p_limite: 20 }),
    supabase.from("follows").select("followee_id").eq("follower_id", user.id),
  ]);
  const jaSigo = new Set((sigo.data ?? []).map((f) => f.followee_id));
  const escolhidas = (parecidas.data ?? []).filter((p) => !jaSigo.has(p.user_id) && Number(p.afinidade) > 0).slice(0, 5);

  if (escolhidas.length === 0) {
    const { data } = await supabase.rpc("recem_chegados", { p_limite: 5 });
    const novos = data ?? [];
    const urls = await assinarAvatares(supabase, novos.map((p) => p.avatar_path));
    return {
      tipo: "recem-chegados",
      pessoas: novos.map((p) => ({
        id: p.user_id,
        username: p.username,
        nome: p.display_name,
        avatarUrl: p.avatar_path ? (urls.get(p.avatar_path) ?? null) : null,
        preset: p.avatar_preset,
        seguindo: p.seguindo,
        comuns: Array.isArray(p.tags_em_comum) ? (p.tags_em_comum as unknown as Tag[]) : [],
      })),
    };
  }

  const urls = await assinarAvatares(supabase, escolhidas.map((p) => p.avatar_path));
  return {
    tipo: "parecidas",
    pessoas: escolhidas.map((p) => ({
      id: p.user_id,
      username: p.username,
      nome: p.display_name,
      avatarUrl: p.avatar_path ? (urls.get(p.avatar_path) ?? null) : null,
      preset: p.avatar_preset,
      emComum: Array.isArray(p.tags_em_comum) ? p.tags_em_comum.length : 0,
    })),
  };
}
