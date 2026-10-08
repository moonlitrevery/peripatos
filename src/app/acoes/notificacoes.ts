"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { falha, mensagemDeErro, ok, type Resultado } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";
import * as v from "@/lib/validacao";

// As notificações nascem no banco, por trigger. Daqui só se lê, se marca como
// lida e se escolhe quais tipos viram push. Nada aqui cria notificação.

const SEM_SESSAO = "Sua sessão expirou. Entre de novo.";

async function sessao() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Quantos grupos de notificação não lidos, para o contador da aba. */
export async function contarNotificacoes(): Promise<number> {
  const { supabase, user } = await sessao();
  if (!user) return 0;
  const { data } = await supabase.rpc("total_notificacoes_nao_lidas");
  return typeof data === "number" ? data : 0;
}

export async function marcarNotificacoesLidas(): Promise<Resultado> {
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.rpc("marcar_notificacoes_lidas");
  if (error) return falha(mensagemDeErro(error));
  return ok(undefined);
}

const PushPorTipo = z.strictObject({
  mensagem: z.boolean(),
  mutuo: z.boolean(),
  novo_seguidor: z.boolean(),
  conquista: z.boolean(),
  avatar: z.boolean(),
  denuncia: z.boolean(),
  termos: z.boolean(),
});

export type PushPorTipo = z.infer<typeof PushPorTipo>;

// A escolha é da conta. user_id nem é enviado: o banco preenche com quem
// está logado e recusaria outro valor.
export async function salvarPushPorTipo(bruto: unknown): Promise<Resultado> {
  const r = v.validar(PushPorTipo, bruto);
  if (!r.ok) return r.falha;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.from("push_preferences").upsert(r.dado, { onConflict: "user_id" });
  if (error) return falha(mensagemDeErro(error, "Não foi possível salvar. Tente de novo."));
  revalidatePath("/config");
  return ok(undefined);
}
