"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { falha, mensagemDeErro, ok, type Resultado } from "@/lib/erros";
import { gravarTags } from "@/lib/gravar-tags";
import { createClient } from "@/lib/supabase/server";
import * as v from "@/lib/validacao";
import { z } from "zod";

const SEM_SESSAO = "Sua sessão expirou. Entre de novo.";

async function sessao() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const Perfil = z.object({ displayName: v.nomeDeExibicao, username: v.username, bio: v.bio });

export async function salvarPerfil(bruto: unknown): Promise<Resultado> {
  const r = v.validar(Perfil, bruto);
  if (!r.ok) return r.falha;
  const d = r.dado;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);

  // Só as três colunas que o banco deixa a pessoa editar.
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: d.displayName, username: d.username, bio: d.bio || null })
    .eq("id", user.id);
  if (error?.code === "23505") return falha("Este username já está em uso.");
  if (error) return falha(mensagemDeErro(error));
  revalidatePath("/", "layout");
  return ok(undefined);
}

const Tags = z.object({ comuns: v.tagsComuns, sensiveis: v.tagsSensiveis, consentiuSensiveis: z.boolean() });

// `consentiuSensiveis` é a caixa de consentimento específico marcada NESTA
// tela. Só ela registra o consentimento; sem registro, o banco recusa a tag.
export async function salvarTags(bruto: unknown): Promise<Resultado> {
  const r = v.validar(Tags, bruto);
  if (!r.ok) return r.falha;
  const d = r.dado;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);

  if (d.sensiveis.length > 0 && d.consentiuSensiveis) {
    const consentimento = await supabase.rpc("consentir_tags_sensiveis");
    if (consentimento.error) return falha(mensagemDeErro(consentimento.error));
  }
  const erro = await gravarTags(supabase, user.id, d.comuns, d.sensiveis);
  if (erro) return falha(mensagemDeErro(erro));
  revalidatePath("/", "layout");
  return ok(undefined);
}

// Revoga o consentimento: o banco apaga todas as tags sensíveis e o registro
// do consentimento na mesma transação.
export async function revogarSensiveis(): Promise<Resultado> {
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.rpc("revogar_tags_sensiveis");
  if (error) return falha(mensagemDeErro(error));
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function escolherAvatarPronto(bruto: unknown): Promise<Resultado> {
  const r = v.validar(v.avatarPronto, bruto);
  if (!r.ok) return r.falha;
  const n = r.dado;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.from("profiles").update({ avatar_preset: n }).eq("id", user.id);
  if (error) return falha(mensagemDeErro(error));
  revalidatePath("/", "layout");
  return ok(undefined);
}

// Apaga, pela Storage API e com a sessão da própria pessoa, tudo o que ela
// tem nos dois buckets de avatar. É a Storage API que remove o arquivo de
// verdade; apagar a linha no banco deixaria o arquivo órfão.
async function apagarArquivos(supabase: Awaited<ReturnType<typeof createClient>>, uid: string) {
  for (const bucket of ["avatars", "avatar-uploads"]) {
    const { data, error } = await supabase.storage.from(bucket).list(uid, { limit: 1000 });
    if (error) return error;
    const caminhos = (data ?? []).map((f) => `${uid}/${f.name}`);
    if (caminhos.length > 0) {
      const r = await supabase.storage.from(bucket).remove(caminhos);
      if (r.error) return r.error;
    }
  }
  return null;
}

export async function removerFoto(): Promise<Resultado> {
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const erro = await apagarArquivos(supabase, user.id);
  if (erro) return falha("Não foi possível remover a foto. Tente de novo.");
  revalidatePath("/", "layout");
  return ok(undefined);
}

// Registra o aceite da versão vigente dos Termos e da Política. O banco
// confere de novo que a versão enviada é a que está valendo.
export async function aceitarTermos(versaoBruta: unknown): Promise<Resultado> {
  const r = v.validar(z.string().max(40), versaoBruta);
  if (!r.ok) return r.falha;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.rpc("aceitar_termos", { p_versao: r.dado });
  if (error) return falha(mensagemDeErro(error, "Não foi possível registrar o aceite. Tente de novo."));
  redirect("/");
}

export async function excluirConta(confirmacao: unknown): Promise<Resultado> {
  const r = v.validar(z.string().max(20), confirmacao);
  if (!r.ok || r.dado.trim() !== "EXCLUIR") return falha("Digite EXCLUIR, em maiúsculas, para confirmar.");
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);

  const erroArquivos = await apagarArquivos(supabase, user.id);
  if (erroArquivos) return falha("Não foi possível apagar sua foto, então a conta não foi excluída. Tente de novo.");

  const { error } = await supabase.rpc("excluir_conta", { p_confirmacao: "EXCLUIR" });
  if (error) return falha(mensagemDeErro(error, "Não foi possível excluir a conta. Tente de novo."));

  // O usuário não existe mais no Auth; só resta limpar os cookies.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/entrar?conta=excluida");
}
