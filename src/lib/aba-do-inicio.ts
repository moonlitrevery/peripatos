// As duas abas do Início, e onde o aparelho lembra a que ficou aberta.
// Sem "server-only": a tela (cliente) e a página (servidor) usam os dois.

export type AbaDoFeed = "para-voce" | "seguindo";

/** Preferência local do aparelho, sem dado pessoal. */
export const COOKIE_DA_ABA = "aba_do_inicio";

export function abaValida(valor: string | undefined | null): AbaDoFeed {
  return valor === "seguindo" ? "seguindo" : "para-voce";
}

/** Grava a escolha neste navegador, por um ano. Só roda no cliente. */
export function lembrarAba(aba: AbaDoFeed) {
  document.cookie = `${COOKIE_DA_ABA}=${aba}; path=/; max-age=31536000; samesite=lax`;
}
