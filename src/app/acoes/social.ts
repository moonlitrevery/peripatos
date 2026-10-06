"use server";

import { revalidatePath } from "next/cache";
import type { MotivoDenuncia } from "@/lib/denuncias";
import { falha, mensagemDeErro, ok, type Resultado } from "@/lib/erros";
import { paginaDoFeed, type ItemFeed } from "@/lib/feed";
import { createClient } from "@/lib/supabase/server";

// Todas as ações rodam com a sessão de quem clicou. Nenhuma recebe "quem sou
// eu": o banco tira isso de auth.uid() e o RLS confere o resto. Se alguém
// chamar uma ação à mão com o id de outra pessoa, o banco recusa.

async function sessao() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const SEM_SESSAO = "Sua sessão expirou. Entre de novo.";

export async function maisFeed(cursor: string): Promise<Resultado<{ itens: ItemFeed[]; proximo: string | null }>> {
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const r = await paginaDoFeed(supabase, cursor);
  if (r.erro) return falha(mensagemDeErro(r.erro));
  return ok({ itens: r.itens, proximo: r.proximo });
}

export async function publicar(corpo: string, gifId: string | null): Promise<Resultado<{ id: string; criadoEm: string }>> {
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);

  // Só body e gif_id. author_id e institution_id nem são enviados: o banco
  // preenche, e recusaria se viessem.
  const { data, error } = await supabase
    .from("posts")
    .insert({ body: corpo.trim(), gif_id: gifId })
    .select("id, created_at")
    .single();
  if (error) return falha(mensagemDeErro(error, "Não foi possível publicar."));
  return ok({ id: data.id, criadoEm: data.created_at });
}

export async function apagarPost(postId: string): Promise<Resultado> {
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.rpc("apagar_post", { p_post_id: postId });
  if (error) return falha(mensagemDeErro(error));
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function seguir(alvoId: string): Promise<Resultado> {
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.from("follows").insert({ followee_id: alvoId });
  if (error && error.code !== "23505") return falha(mensagemDeErro(error, "Não foi possível seguir."));
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function deixarDeSeguir(alvoId: string): Promise<Resultado> {
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.from("follows").delete().eq("follower_id", user.id).eq("followee_id", alvoId);
  if (error) return falha(mensagemDeErro(error));
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function removerSeguidor(seguidorId: string): Promise<Resultado> {
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.from("follows").delete().eq("follower_id", seguidorId).eq("followee_id", user.id);
  if (error) return falha(mensagemDeErro(error));
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function bloquear(alvoId: string): Promise<Resultado> {
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.from("blocks").insert({ blocked_id: alvoId });
  if (error && error.code !== "23505") return falha(mensagemDeErro(error, "Não foi possível bloquear."));
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function desbloquear(alvoId: string): Promise<Resultado> {
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.from("blocks").delete().eq("blocker_id", user.id).eq("blocked_id", alvoId);
  if (error) return falha(mensagemDeErro(error));
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function denunciar(
  alvo: { postId: string } | { perfilId: string },
  motivo: MotivoDenuncia,
  detalhe: string,
): Promise<Resultado> {
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.from("reports").insert({
    post_id: "postId" in alvo ? alvo.postId : null,
    profile_id: "perfilId" in alvo ? alvo.perfilId : null,
    reason: motivo,
    details: detalhe.trim() || null,
  });
  if (error?.code === "23505") return falha("Você já denunciou isto. A moderação vai olhar.");
  if (error) return falha(mensagemDeErro(error, "Não foi possível enviar a denúncia."));
  return ok(undefined);
}
