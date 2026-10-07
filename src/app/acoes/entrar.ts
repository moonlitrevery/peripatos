"use server";

import { redirect } from "next/navigation";
import { falha, ok, type Resultado } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";
import * as v from "@/lib/validacao";

export async function pedirCodigo(emailBruto: unknown): Promise<Resultado> {
  const e = v.validar(v.email, emailBruto);
  if (!e.ok) return e.falha;
  const email = e.dado;

  const supabase = await createClient();
  // Sem emailRedirectTo: o e-mail leva só o código de 6 dígitos, nunca um link.
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (!error) return ok(undefined);

  // 403 é a recusa do auth hook (domínio fora da lista, formato sem RA,
  // e-mail banido). A mensagem já vem do banco, em português.
  if (error.status === 403 && error.message) return falha(error.message);
  if (error.status === 429) return falha("Muitos pedidos em pouco tempo. Espere um minuto e tente de novo.");
  if (error.code === "user_banned") return falha("Esta conta foi suspensa.");
  return falha("Não foi possível enviar o código agora. Tente de novo em instantes.");
}

export async function verificarCodigo(emailBruto: unknown, codigoBruto: unknown): Promise<Resultado> {
  const e = v.validar(v.email, emailBruto);
  if (!e.ok) return e.falha;
  const c = v.validar(v.codigoOtp, codigoBruto);
  if (!c.ok) return c.falha;
  const email = e.dado;
  const token = c.dado;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) {
    // O Auth devolve otp_expired tanto para código errado quanto para vencido.
    if (error.code === "user_banned") return falha("Esta conta foi suspensa.");
    return falha("Código inválido ou expirado. Confira os dígitos ou peça outro.");
  }

  // Quem ainda não fez o onboarding vai direto para lá. Deixar isso para o
  // proxy funciona, mas ele reescreve o destino de um redirect de server
  // action sem trocar o endereço: a tela certa apareceria sob a URL "/".
  const { data: perfil } = data.user
    ? await supabase.from("profiles").select("onboarding_completo").eq("id", data.user.id).maybeSingle()
    : { data: null };
  redirect(perfil?.onboarding_completo === true ? "/" : "/onboarding");
}

// Encerra a sessão deste aparelho.
export async function sair() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/entrar");
}

// Encerra TODAS as sessões da conta: revoga os refresh tokens de todos os
// aparelhos. Um aparelho que já esteja com um token de acesso válido continua
// até ele vencer (no máximo 1 hora); depois disso não consegue renovar.
export async function sairDeTodosOsDispositivos() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/entrar?conta=saiu-de-tudo");
}
