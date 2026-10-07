"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { falha, mensagemDeErro, ok, type Resultado } from "@/lib/erros";
import { gravarTags } from "@/lib/gravar-tags";
import { TERMOS_VERSAO } from "@/lib/legal";
import { createClient } from "@/lib/supabase/server";
import * as v from "@/lib/validacao";

const Dados = z.object({
  username: v.username,
  displayName: v.nomeDeExibicao,
  nascimento: v.dataDeNascimento,
  bio: v.bio,
  tagsComuns: v.tagsComuns,
  tagsSensiveis: v.tagsSensiveis,
  preset: v.avatarPronto.nullable(),
  // A versão dos termos que a tela mostrou e a pessoa aceitou.
  termosAceitos: z.string().max(40).nullable(),
  // Consentimento específico para identidade e crenças (LGPD, art. 11).
  consentiuSensiveis: z.boolean(),
});

export async function concluirOnboarding(bruto: unknown): Promise<Resultado> {
  const r = v.validar(Dados, bruto);
  if (!r.ok) return r.falha;
  const d = r.dado;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return falha("Sua sessão expirou. Entre de novo.");

  if (d.tagsSensiveis.length > 0 && !d.consentiuSensiveis) {
    return falha("Para marcar identidade ou crenças é preciso dar o consentimento específico.");
  }

  // O banco confere de novo se a versão aceita é a vigente e registra a data.
  const { data, error } = await supabase.rpc("completar_onboarding", {
    p_username: d.username,
    p_display_name: d.displayName,
    p_data_nascimento: d.nascimento,
    p_bio: d.bio,
    p_termos_versao: d.termosAceitos === TERMOS_VERSAO ? TERMOS_VERSAO : undefined,
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

  if (d.tagsSensiveis.length > 0) {
    const consentimento = await supabase.rpc("consentir_tags_sensiveis");
    if (consentimento.error) return falha(mensagemDeErro(consentimento.error));
  }

  const erroTags = await gravarTags(supabase, user.id, d.tagsComuns, d.tagsSensiveis);
  if (erroTags) return falha(mensagemDeErro(erroTags, "Seu perfil foi criado, mas não conseguimos salvar os gostos. Ajuste em Configurações."));

  if (d.preset) {
    await supabase.from("profiles").update({ avatar_preset: d.preset }).eq("id", user.id);
  }
  return ok(undefined);
}
