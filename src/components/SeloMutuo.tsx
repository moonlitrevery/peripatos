// "Vocês se seguem" e "Segue você" são STATUS, não ações: texto com um
// sinal, sem borda e sem fundo, para não parecerem botão em nenhuma tela.
export function SeloMutuo({ tipo = "mutuo" }: { tipo?: "mutuo" | "segue-voce" }) {
  if (tipo === "segue-voce") return <span className="selo selo-fraco">Segue você</span>;
  return (
    <span className="selo">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
        <path d="M4 3 1 6l3 3V7h7V5H4zm8 4v2H5v2h7v2l3-3z" fill="currentColor" />
      </svg>
      Vocês se seguem
    </span>
  );
}
