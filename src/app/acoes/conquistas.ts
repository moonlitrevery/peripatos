"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { falha, mensagemDeErro, ok, type Resultado } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";
import * as v from "@/lib/validacao";

// Ninguém ganha conquista por aqui: quem concede é o banco. As duas ações
// são esconder ou mostrar uma conquista que a pessoa JÁ tem, e a concessão
// manual de admin, que a RPC confere (cargo, segundo fator) e registra.

const SEM_SESSAO = "Sua sessão expirou. Entre de novo.";
const slug = z.string("Conquista inválida.").regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Conquista inválida.").max(60, "Conquista inválida.");

async function sessao() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function mostrarConquista(slugBruto: unknown, mostrarBruto: unknown): Promise<Resultado> {
  const r = v.validar(z.object({ slug, mostrar: z.boolean() }), { slug: slugBruto, mostrar: mostrarBruto });
  if (!r.ok) return r.falha;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  // Só a coluna hidden, e só na própria linha: é tudo o que o banco deixa.
  const { error } = await supabase
    .from("user_achievements")
    .update({ hidden: !r.dado.mostrar })
    .eq("user_id", user.id)
    .eq("achievement_slug", r.dado.slug);
  if (error) return falha(mensagemDeErro(error));
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function concederConquista(userId: unknown, slugBruto: unknown, motivo: unknown): Promise<Resultado> {
  const r = v.validar(z.object({ id: v.uuid, slug, motivo: v.motivoDeModeracao }), { id: userId, slug: slugBruto, motivo });
  if (!r.ok) return r.falha;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.rpc("conceder_conquista", {
    p_user_id: r.dado.id,
    p_conquista: r.dado.slug,
    p_motivo: r.dado.motivo,
  });
  if (error) return falha(mensagemDeErro(error));
  revalidatePath("/", "layout");
  return ok(undefined);
}
