"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemDeErro, ok, type Resultado } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";

// Cada ação chama a RPC correspondente com a sessão de quem clicou. É a RPC
// que confere se a pessoa é staff daquela instituição e que grava o registro
// em moderation_actions, na mesma transação. Chamar isto sem cargo devolve
// "Sem permissão para esta ação".

type Rpc = "ocultar_post" | "banir_usuario" | "moderar_avatar" | "resolver_denuncia";

async function chamar(fn: Rpc, args: Record<string, unknown>): Promise<Resultado> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return falha("Sua sessão expirou. Entre de novo.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- os argumentos variam por RPC e são conferidos pelo banco
  const { error } = await supabase.rpc(fn, args as any);
  if (error) return falha(mensagemDeErro(error));
  revalidatePath("/moderacao");
  return ok(undefined);
}

export async function ocultarPost(postId: string, motivo: string) {
  return chamar("ocultar_post", { p_post_id: postId, p_motivo: motivo });
}

export async function banir(userId: string, motivo: string) {
  return chamar("banir_usuario", { p_user_id: userId, p_motivo: motivo });
}

export async function moderarAvatar(userId: string, aprovar: boolean, motivo: string) {
  return chamar("moderar_avatar", { p_user_id: userId, p_aprovar: aprovar, p_motivo: motivo });
}

export async function resolverDenuncia(reportId: string, status: "resolvida" | "rejeitada", nota: string) {
  return chamar("resolver_denuncia", { p_report_id: reportId, p_status: status, p_nota: nota });
}
