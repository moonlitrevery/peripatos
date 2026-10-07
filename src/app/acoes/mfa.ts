"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { falha, ok, type Resultado } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";
import * as v from "@/lib/validacao";

// Verificação em duas etapas (TOTP) da staff.
//
// Estas ações só conversam com o Auth. Quem EXIGE o segundo fator é o banco:
// as RPCs de moderação e as leituras de staff só funcionam com sessão aal2
// (migration 13). Pular esta tela não dá acesso a nada.

export type Cadastro = { fatorId: string; segredo: string; qr: string };

/** Começa o cadastro de um autenticador. Devolve o QR code e o segredo. */
export async function iniciarCadastro(): Promise<Resultado<Cadastro>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return falha("Sua sessão expirou. Entre de novo.");

  const { data: fatores, error: erroLista } = await supabase.auth.mfa.listFactors();
  if (erroLista) return falha("Não foi possível consultar a verificação em duas etapas.");
  if (fatores.totp.length > 0) return falha("Você já tem um autenticador configurado.");

  // Sobras de um cadastro que não foi confirmado: sem isso o Auth recusaria
  // um fator novo com o mesmo nome.
  for (const f of fatores.all.filter((f) => f.status === "unverified")) {
    await supabase.auth.mfa.unenroll({ factorId: f.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "Peripatos", friendlyName: "Autenticador" });
  if (error) return falha("Não foi possível iniciar a configuração. Tente de novo.");
  return ok({ fatorId: data.id, segredo: data.totp.secret, qr: data.totp.qr_code });
}

const Confirmacao = z.object({ fatorId: v.uuid, codigo: v.codigoTotp });

/** Confere o código do autenticador. Dando certo, a sessão passa a ser aal2. */
export async function confirmarCodigo(fatorBruto: unknown, codigoBruto: unknown): Promise<Resultado> {
  const r = v.validar(Confirmacao, { fatorId: fatorBruto, codigo: codigoBruto });
  if (!r.ok) return r.falha;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return falha("Sua sessão expirou. Entre de novo.");

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: r.dado.fatorId, code: r.dado.codigo });
  if (error) {
    if (error.status === 429) return falha("Muitas tentativas. Espere um pouco e tente de novo.");
    return falha("Código incorreto ou vencido. Confira o aplicativo e tente de novo.");
  }
  redirect("/moderacao");
}
