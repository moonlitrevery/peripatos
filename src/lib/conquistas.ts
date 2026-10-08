// Conquistas. O catálogo mora no banco (public.achievements), e é o banco que
// decide quem ganha o quê: aqui só se lê e se mostra.

export type Conquista = {
  slug: string;
  nome: string;
  descricao: string;
  emoji: string;
  /** O que o leitor de tela diz no lugar do emoji. */
  emojiRotulo: string;
  /** Cor própria da conquista, em hexadecimal. Nunca é a única diferença: o nome vem sempre junto. */
  cor: string;
  secreta: boolean;
  posicao: number;
};

export const COLUNAS_DA_CONQUISTA = "slug, name, description, emoji, emoji_label, color, is_secret, position";

type Linha = {
  slug: string;
  name: string;
  description: string;
  emoji: string;
  emoji_label: string;
  color: string;
  is_secret: boolean;
  position: number;
};

export function deLinha(l: Linha): Conquista {
  return {
    slug: l.slug,
    nome: l.name,
    descricao: l.description,
    emoji: l.emoji,
    emojiRotulo: l.emoji_label,
    cor: l.color,
    secreta: l.is_secret,
    posicao: l.position,
  };
}
