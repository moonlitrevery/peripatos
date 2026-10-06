"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { falha, mensagemDeErro, ok, type Resultado } from "@/lib/erros";
import { gravarTags } from "@/lib/gravar-tags";
import { createClient } from "@/lib/supabase/server";

const SEM_SESSAO = "Sua sessão expirou. Entre de novo.";

async function sessao() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function salvarPerfil(d: { displayName: string; username: string; bio: string }): Promise<Resultado> {
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);

  const username = d.username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return falha("O username precisa ter de 3 a 20 caracteres: letras minúsculas, números e _.");
  if (d.displayName.trim() === "") return falha("Diga como você quer ser chamado.");

  // Só as três colunas que o banco deixa a pessoa editar.
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: d.displayName.trim(), username, bio: d.bio.trim() || null })
    .eq("id", user.id);
  if (error?.code === "23505") return falha("Este username já está em uso.");
  if (error) return falha(mensagemDeErro(error));
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function salvarTags(comuns: number[], sensiveis: number[]): Promise<Resultado> {
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const erro = await gravarTags(supabase, user.id, comuns, sensiveis);
  if (erro) return falha(mensagemDeErro(erro));
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function escolherAvatarPronto(n: number): Promise<Resultado> {
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

export async function excluirConta(confirmacao: string): Promise<Resultado> {
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  if (confirmacao.trim() !== "EXCLUIR") return falha("Digite EXCLUIR, em maiúsculas, para confirmar.");

  const erroArquivos = await apagarArquivos(supabase, user.id);
  if (erroArquivos) return falha("Não foi possível apagar sua foto, então a conta não foi excluída. Tente de novo.");

  const { error } = await supabase.rpc("excluir_conta", { p_confirmacao: "EXCLUIR" });
  if (error) return falha(mensagemDeErro(error, "Não foi possível excluir a conta. Tente de novo."));

  // O usuário não existe mais no Auth; só resta limpar os cookies.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/entrar?conta=excluida");
}
