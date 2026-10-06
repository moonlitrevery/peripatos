"use server";

import { redirect } from "next/navigation";
import { falha, mensagemDeErro, ok, type Resultado } from "@/lib/erros";
import { gravarTags } from "@/lib/gravar-tags";
import { createClient } from "@/lib/supabase/server";

type Dados = {
  username: string;
  displayName: string;
  nascimento: string;
  bio: string;
  tagsComuns: number[];
  tagsSensiveis: number[];
  preset: number | null;
};

export async function concluirOnboarding(d: Dados): Promise<Resultado> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return falha("Sua sessão expirou. Entre de novo.");

  const { data, error } = await supabase.rpc("completar_onboarding", {
    p_username: d.username.trim().toLowerCase(),
    p_display_name: d.displayName,
    p_data_nascimento: d.nascimento,
    p_bio: d.bio,
  });
  if (error) return falha(mensagemDeErro(error));

  const resposta = data as { menor_de_idade?: boolean } | null;
  if (resposta?.menor_de_idade) {
    // O banco já apagou a conta inteira. Aqui só limpamos os cookies e
    // levamos a pessoa para a página pública que explica. Devolver o aviso
    // para a tela de onboarding não funciona: sem sessão, o proxy tira a
    // pessoa de lá antes de a mensagem aparecer.
    await supabase.auth.signOut({ scope: "local" });
    redirect("/maiores-de-18");
  }

  const erroTags = await gravarTags(supabase, user.id, d.tagsComuns, d.tagsSensiveis);
  if (erroTags) return falha(mensagemDeErro(erroTags, "Seu perfil foi criado, mas não conseguimos salvar os gostos. Ajuste em Configurações."));

  if (d.preset) {
    await supabase.from("profiles").update({ avatar_preset: d.preset }).eq("id", user.id);
  }
  return ok(undefined);
}
