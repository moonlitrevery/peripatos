"use server";

import { redirect } from "next/navigation";
import { falha, ok, type Resultado } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";

export async function pedirCodigo(emailBruto: string): Promise<Resultado> {
  const email = emailBruto.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return falha("Digite seu e-mail institucional completo.");

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

export async function verificarCodigo(emailBruto: string, codigoBruto: string): Promise<Resultado> {
  const email = emailBruto.trim().toLowerCase();
  const token = codigoBruto.replace(/\D/g, "");
  if (token.length !== 6) return falha("O código tem 6 dígitos.");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) {
    // O Auth devolve otp_expired tanto para código errado quanto para vencido.
    if (error.code === "user_banned") return falha("Esta conta foi suspensa.");
    return falha("Código inválido ou expirado. Confira os dígitos ou peça outro.");
  }
  redirect("/");
}

export async function sair() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/entrar");
}
