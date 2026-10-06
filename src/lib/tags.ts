export type Tag = {
  id: number;
  slug: string;
  nome: string;
  categoria: string;
  sensivel: boolean;
};

// Limites impostos por trigger no banco. Aqui servem só para a interface
// avisar antes; quem decide é o banco.
export const MAX_TAGS_COMUNS = 20;
export const MAX_TAGS_SENSIVEIS = 5;

const NOMES_DE_CATEGORIA: Record<string, string> = {
  jogos: "Jogos",
  rpg: "RPG",
  "anime-e-manga": "Anime e mangá",
  musica: "Música",
  "cinema-e-series": "Cinema e séries",
  livros: "Livros",
  cursos: "Cursos",
  esportes: "Esportes",
  filosofia: "Filosofia e ideias",
  tecnologia: "Tecnologia",
  arte: "Arte e criação",
  "estilo-de-vida": "Estilo de vida",
  "orientacao-sexual": "Orientação sexual",
  "identidade-de-genero": "Identidade de gênero",
  religiao: "Religião",
  "posicao-politica": "Posição política",
};

export function nomeDaCategoria(slug: string): string {
  return NOMES_DE_CATEGORIA[slug] ?? slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function agruparPorCategoria(tags: Tag[]): { categoria: string; nome: string; tags: Tag[] }[] {
  const grupos = new Map<string, Tag[]>();
  for (const t of tags) {
    const g = grupos.get(t.categoria);
    if (g) g.push(t);
    else grupos.set(t.categoria, [t]);
  }
  return [...grupos].map(([categoria, lista]) => ({
    categoria,
    nome: nomeDaCategoria(categoria),
    tags: lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  }));
}

export function fraseEmComum(n: number): string {
  if (n === 0) return "Ainda sem gostos em comum";
  if (n === 1) return "Vocês têm 1 gosto em comum";
  return `Vocês têm ${n} gostos em comum`;
}

type LinhaTag = { id: number; slug: string; name: string; category: string; is_sensitive: boolean };

export function deLinha(t: LinhaTag): Tag {
  return { id: t.id, slug: t.slug, nome: t.name, categoria: t.category, sensivel: t.is_sensitive };
}
