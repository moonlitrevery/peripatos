import { z } from "zod";
import { falha, type Resultado } from "@/lib/erros";

// Validação no servidor de tudo o que chega por server action ou route
// handler. O navegador manda o que quiser: os tipos do TypeScript não existem
// em tempo de execução, então um "string" pode chegar como objeto ou array.
//
// Isto vem ANTES do banco, não no lugar dele. As constraints, o RLS e as RPCs
// continuam sendo quem decide; aqui se recusa cedo o que nem tem a forma certa
// e se devolve uma mensagem que a pessoa entende.

const semControle = (s: string) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(s);

export const uuid = z.uuid("Identificador inválido.");

export const email = z
  .string("Digite seu e-mail institucional completo.")
  .trim()
  .toLowerCase()
  .max(254, "Digite seu e-mail institucional completo.")
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Digite seu e-mail institucional completo.");

export const codigoOtp = z
  .string("O código tem 6 dígitos.")
  .max(32, "O código tem 6 dígitos.")
  .transform((s) => s.replace(/\D/g, ""))
  .refine((s) => s.length === 6, "O código tem 6 dígitos.");

export const username = z
  .string("Informe um username.")
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, "O username precisa ter de 3 a 20 caracteres: letras minúsculas, números e _.");

export const nomeDeExibicao = z
  .string("Diga como você quer ser chamado.")
  .trim()
  .min(1, "Diga como você quer ser chamado.")
  .max(50, "O nome pode ter até 50 caracteres.")
  .refine(semControle, "O nome tem caracteres inválidos.");

export const bio = z
  .string()
  .trim()
  .max(300, "A bio pode ter até 300 caracteres.")
  .refine(semControle, "A bio tem caracteres inválidos.");

export const dataDeNascimento = z.iso.date("Informe sua data de nascimento.");

const idDeTag = z.number().int().positive().max(1_000_000);
const listaDeTags = (maximo: number) =>
  z
    .array(idDeTag, "Lista de gostos inválida.")
    .max(maximo, `Escolha até ${maximo}.`)
    .refine((l) => new Set(l).size === l.length, "Lista de gostos inválida.");

export const tagsComuns = listaDeTags(20);
export const tagsSensiveis = listaDeTags(5);

export const avatarPronto = z.number().int().min(1).max(12);

export const corpoDoPost = z
  .string("Texto inválido.")
  .trim()
  .max(500, "O post pode ter até 500 caracteres.")
  .refine(semControle, "O post tem caracteres inválidos.");

export const gifId = z.string().regex(/^[A-Za-z0-9]{1,64}$/, "GIF inválido.");

// O título que o Giphy dá ao GIF vira o texto alternativo. Chega pelo
// navegador, então é tratado como texto do usuário.
export const gifAlt = z
  .string()
  .transform((s) => s.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200))
  .transform((s) => (s === "" ? null : s));

export const cursorDoFeed = z.string().regex(/^[0-9]{1,18}:[0-9]{1,4}$/, "Recarregue o Início.");

export const motivoDeDenuncia = z.enum(
  [
    "assedio",
    "discurso_de_odio",
    "exposicao_de_dados_pessoais",
    "violencia_ou_ameaca",
    "conteudo_sexual",
    "menor_de_idade",
    "perfil_falso",
    "spam",
    "outro",
  ],
  "Escolha um motivo.",
);

export const detalheDaDenuncia = z
  .string()
  .trim()
  .max(1000, "O detalhe pode ter até 1000 caracteres.")
  .refine(semControle, "O detalhe tem caracteres inválidos.");

export const motivoDeModeracao = z
  .string("Informe o motivo.")
  .trim()
  .min(3, "Informe o motivo (3 a 1000 caracteres).")
  .max(1000, "Informe o motivo (3 a 1000 caracteres).")
  .refine(semControle, "O motivo tem caracteres inválidos.");

export const codigoTotp = z
  .string("O código tem 6 dígitos.")
  .max(32, "O código tem 6 dígitos.")
  .transform((s) => s.replace(/\D/g, ""))
  .refine((s) => s.length === 6, "O código tem 6 dígitos.");

export const buscaDeGif = z
  .string()
  .max(200)
  .transform((s) => s.replace(/[\u0000-\u001F\u007F]+/g, " ").trim().slice(0, 50));

/** Valida e devolve o dado já normalizado, ou a falha pronta para devolver à tela. */
export function validar<T>(
  esquema: z.ZodType<T>,
  dado: unknown,
): { ok: true; dado: T } | { ok: false; falha: Resultado<never> } {
  const r = esquema.safeParse(dado);
  if (r.success) return { ok: true, dado: r.data };
  return { ok: false, falha: falha(r.error.issues[0]?.message ?? "Dados inválidos.") };
}
