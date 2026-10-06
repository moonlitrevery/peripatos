// Só valores públicos passam por aqui. A service role não existe neste app.
function exigir(nome: string, valor: string | undefined): string {
  if (!valor) {
    throw new Error(`Variável de ambiente ausente: ${nome}. Veja .env.example.`);
  }
  return valor;
}

export const SUPABASE_URL = exigir("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_KEY = exigir(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
