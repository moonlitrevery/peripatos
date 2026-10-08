import type { Tag } from "@/lib/tags";

function Cadeado() {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true" focusable="false">
      <path d="M3 5V4a3 3 0 0 1 6 0v1h1v6H2V5zm1.5 0h3V4a1.5 1.5 0 0 0-3 0z" fill="currentColor" />
    </svg>
  );
}

type Props = {
  tag: Tag;
  /** Em comum com quem está vendo: âmbar, e só isso é âmbar no app. */
  comum?: boolean;
  /** Gosto que não é em comum, mostrado de forma discreta. */
  discreta?: boolean;
  /** Tag sensível na seção "Sobre" do perfil: cor neutra, sem destaque. */
  neutra?: boolean;
};

export function TagChip({ tag, comum, discreta, neutra }: Props) {
  // Tag sensível nunca é "em comum": mesmo que alguém peça, não fica âmbar.
  const classe =
    comum && !tag.sensivel ? "chip chip-comum" : neutra ? "chip" : tag.sensivel ? "chip chip-sens" : discreta ? "chip chip-fraco" : "chip";
  return (
    <span className={classe}>
      {tag.sensivel && (
        <>
          <Cadeado />
          <span className="sr-only">Só visível entre quem se segue: </span>
        </>
      )}
      {tag.nome}
      {comum && !tag.sensivel && <span className="sr-only"> (em comum)</span>}
    </span>
  );
}
