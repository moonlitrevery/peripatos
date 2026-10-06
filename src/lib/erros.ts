// Traduz erros do banco em frases para a pessoa. As regras de negócio levantam
// SQLSTATE PTxxx com mensagem já em português; essas passam direto.
type ErroBanco = { code?: string; message?: string } | null | undefined;

export function mensagemDeErro(erro: ErroBanco, padrao = "Algo deu errado. Tente de novo."): string {
  if (!erro) return padrao;
  const codigo = erro.code ?? "";
  if (codigo.startsWith("PT") && erro.message) return erro.message;
  if (codigo === "23505") return "Isso já foi feito.";
  if (codigo === "23514") return "Algum campo está fora do formato permitido.";
  if (codigo === "42501") return "Você não pode fazer isso.";
  return padrao;
}

export type Resultado<T = undefined> = { ok: true; dados: T } | { ok: false; erro: string };

export const ok = <T,>(dados: T): Resultado<T> => ({ ok: true, dados });
export const falha = (erro: string): Resultado<never> => ({ ok: false, erro });
