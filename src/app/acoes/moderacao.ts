"use server";

import { revalidatePath } from "next/cache";
import { falha, mensagemDeErro, ok, type Resultado } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";
import * as v from "@/lib/validacao";
import { z } from "zod";

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

// Cada ação valida a forma dos argumentos antes de chamar o banco. Quem
// decide se a pessoa PODE é a RPC (cargo na instituição + sessão aal2).

export async function ocultarPost(postId: unknown, motivo: unknown) {
  const r = v.validar(z.object({ id: v.uuid, motivo: v.motivoDeModeracao }), { id: postId, motivo });
  if (!r.ok) return r.falha;
  return chamar("ocultar_post", { p_post_id: r.dado.id, p_motivo: r.dado.motivo });
}

export async function banir(userId: unknown, motivo: unknown) {
  const r = v.validar(z.object({ id: v.uuid, motivo: v.motivoDeModeracao }), { id: userId, motivo });
  if (!r.ok) return r.falha;
  return chamar("banir_usuario", { p_user_id: r.dado.id, p_motivo: r.dado.motivo });
}

export async function moderarAvatar(userId: unknown, aprovar: unknown, motivo: unknown) {
  const r = v.validar(z.object({ id: v.uuid, aprovar: z.boolean(), motivo: v.motivoDeModeracao }), { id: userId, aprovar, motivo });
  if (!r.ok) return r.falha;
  return chamar("moderar_avatar", { p_user_id: r.dado.id, p_aprovar: r.dado.aprovar, p_motivo: r.dado.motivo });
}

export async function resolverDenuncia(reportId: unknown, status: unknown, nota: unknown) {
  const r = v.validar(
    z.object({ id: v.uuid, status: z.enum(["resolvida", "rejeitada"]), nota: v.motivoDeModeracao }),
    { id: reportId, status, nota },
  );
  if (!r.ok) return r.falha;
  return chamar("resolver_denuncia", { p_report_id: r.dado.id, p_status: r.dado.status, p_nota: r.dado.nota });
}
