"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { falha, mensagemDeErro, ok, type Resultado } from "@/lib/erros";
import type { AbaDoFeed } from "@/lib/aba-do-inicio";
import { paginaDoFeed, type ItemFeed } from "@/lib/feed";
import { createClient } from "@/lib/supabase/server";
import * as v from "@/lib/validacao";

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

// Uma página de uma aba do Início: a primeira (cursor nulo, ao trocar de aba)
// ou a seguinte.
export async function maisFeed(
  abaBruta: unknown,
  cursorBruto: unknown,
): Promise<Resultado<{ itens: ItemFeed[]; proximo: string | null }>> {
  const a = v.validar(v.abaDoFeed, abaBruta);
  if (!a.ok) return a.falha;
  const c = v.validar(v.cursorDoFeed.nullable(), cursorBruto);
  if (!c.ok) return c.falha;
  const aba: AbaDoFeed = a.dado;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const r = await paginaDoFeed(supabase, user.id, aba, c.dado);
  if (r.erro) return falha(mensagemDeErro(r.erro));
  return ok({ itens: r.itens, proximo: r.proximo });
}

export async function publicar(
  corpoBruto: unknown,
  gifBruto: unknown,
): Promise<Resultado<{ id: string; criadoEm: string; gifAlt: string | null }>> {
  const corpo = v.validar(v.corpoDoPost, corpoBruto);
  if (!corpo.ok) return corpo.falha;
  const gif = v.validar(z.object({ id: v.gifId, alt: v.gifAlt }).nullable(), gifBruto);
  if (!gif.ok) return gif.falha;
  if (corpo.dado === "" && !gif.dado) return falha("Escreva algo ou escolha um GIF.");

  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);

  // Só body, gif_id e gif_alt. author_id e institution_id nem são enviados: o
  // banco preenche, e recusaria se viessem.
  const { data, error } = await supabase
    .from("posts")
    .insert({ body: corpo.dado, gif_id: gif.dado?.id ?? null, gif_alt: gif.dado?.alt ?? null })
    .select("id, created_at")
    .single();
  if (error) return falha(mensagemDeErro(error, "Não foi possível publicar."));
  return ok({ id: data.id, criadoEm: data.created_at, gifAlt: gif.dado?.alt ?? null });
}

export async function apagarPost(idBruto: unknown): Promise<Resultado> {
  const id = v.validar(v.uuid, idBruto);
  if (!id.ok) return id.falha;
  const postId = id.dado;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.rpc("apagar_post", { p_post_id: postId });
  if (error) return falha(mensagemDeErro(error));
  revalidatePath("/", "layout");
  return ok(undefined);
}

// `postBruto` só vem quando a pessoa seguiu a partir de um post: o banco
// guarda de qual post veio, para a notificação de quem foi seguido, e confere
// que o post é mesmo dessa pessoa. Se o post saiu do ar entre a tela e o
// toque (código PT422), o follow acontece do mesmo jeito, sem origem.
export async function seguir(idBruto: unknown, postBruto?: unknown): Promise<Resultado> {
  const id = v.validar(v.uuid, idBruto);
  if (!id.ok) return id.falha;
  const alvoId = id.dado;
  const post = v.validar(v.uuid.optional(), postBruto ?? undefined);
  if (!post.ok) return post.falha;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  // A coluna da origem só vai no pedido quando há post: seguir pelo perfil é o
  // mesmo INSERT de sempre. PGRST204 (coluna desconhecida) cobre a janela do
  // deploy em que o app já está no ar e a migration ainda não foi aplicada.
  let { error } = await supabase.from("follows").insert(post.dado ? { followee_id: alvoId, via_post_id: post.dado } : { followee_id: alvoId });
  if (post.dado && (error?.code === "PT422" || error?.code === "PGRST204")) {
    ({ error } = await supabase.from("follows").insert({ followee_id: alvoId }));
  }
  if (error && error.code !== "23505") return falha(mensagemDeErro(error, "Não foi possível seguir."));
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function deixarDeSeguir(idBruto: unknown): Promise<Resultado> {
  const id = v.validar(v.uuid, idBruto);
  if (!id.ok) return id.falha;
  const alvoId = id.dado;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.from("follows").delete().eq("follower_id", user.id).eq("followee_id", alvoId);
  if (error) return falha(mensagemDeErro(error));
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function removerSeguidor(idBruto: unknown): Promise<Resultado> {
  const id = v.validar(v.uuid, idBruto);
  if (!id.ok) return id.falha;
  const seguidorId = id.dado;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.from("follows").delete().eq("follower_id", seguidorId).eq("followee_id", user.id);
  if (error) return falha(mensagemDeErro(error));
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function bloquear(idBruto: unknown): Promise<Resultado> {
  const id = v.validar(v.uuid, idBruto);
  if (!id.ok) return id.falha;
  const alvoId = id.dado;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.from("blocks").insert({ blocked_id: alvoId });
  if (error && error.code !== "23505") return falha(mensagemDeErro(error, "Não foi possível bloquear."));
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function desbloquear(idBruto: unknown): Promise<Resultado> {
  const id = v.validar(v.uuid, idBruto);
  if (!id.ok) return id.falha;
  const alvoId = id.dado;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.from("blocks").delete().eq("blocker_id", user.id).eq("blocked_id", alvoId);
  if (error) return falha(mensagemDeErro(error));
  revalidatePath("/", "layout");
  return ok(undefined);
}

const Denuncia = z.object({
  alvo: z.union([z.strictObject({ postId: v.uuid }), z.strictObject({ perfilId: v.uuid })], "Alvo inválido."),
  motivo: v.motivoDeDenuncia,
  detalhe: v.detalheDaDenuncia,
});

export async function denunciar(alvoBruto: unknown, motivoBruto: unknown, detalheBruto: unknown): Promise<Resultado> {
  const r = v.validar(Denuncia, { alvo: alvoBruto, motivo: motivoBruto, detalhe: detalheBruto });
  if (!r.ok) return r.falha;
  const { alvo, motivo, detalhe } = r.dado;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.from("reports").insert({
    post_id: "postId" in alvo ? alvo.postId : null,
    profile_id: "perfilId" in alvo ? alvo.perfilId : null,
    reason: motivo,
    details: detalhe || null,
  });
  if (error?.code === "23505") return falha("Você já denunciou isto. A moderação vai olhar.");
  if (error) return falha(mensagemDeErro(error, "Não foi possível enviar a denúncia."));
  return ok(undefined);
}
