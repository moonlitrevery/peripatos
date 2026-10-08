import Link from "next/link";
import type { CSSProperties } from "react";
import type { Conquista } from "@/lib/conquistas";

// Conquistas têm forma própria, para não se confundirem com os cargos: o
// cargo é uma pílula cheia, só com texto; a conquista é uma medalha de cantos
// retos com o emoji e a cor dela, e o nome escrito ao lado.

type Medalha = Pick<Conquista, "emoji" | "emojiRotulo" | "cor">;

/** A medalha: o emoji sobre a cor da conquista. O emoji tem descrição para leitor de tela. */
export function Medalha({ conquista, tamanho = 40 }: { conquista: Medalha; tamanho?: number }) {
  return (
    <span
      className="medalha"
      style={{ "--cor": conquista.cor, width: tamanho, height: tamanho, fontSize: tamanho * 0.52 } as CSSProperties}
    >
      <span role="img" aria-label={conquista.emojiRotulo}>
        {conquista.emoji}
      </span>
    </span>
  );
}

/** A conquista como aparece no perfil: medalha, nome e link para a página dela. */
export function SeloDeConquista({ conquista, oculta }: { conquista: Conquista; oculta?: boolean }) {
  return (
    <Link href={`/conquistas/${conquista.slug}`} className="conquista" title={conquista.descricao}>
      <Medalha conquista={conquista} tamanho={28} />
      <span>
        {conquista.nome}
        {oculta && <span className="text-tinta-2 font-normal"> (oculta)</span>}
      </span>
    </Link>
  );
}
