import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

// Antes de tudo:
//   1. recria o banco local (migrations + seed), para os testes partirem
//      sempre do mesmo estado. Pule com E2E_SEM_RESET=1 se já acabou de rodar
//      `supabase db reset`;
//   2. lê do `supabase status` a URL e as chaves locais;
//   3. esvazia o Mailpit e apaga as sessões guardadas de execuções anteriores.
//
// A service role aparece aqui e em e2e/apoio.ts, e só aqui: é usada pelos
// TESTES para conferir, por fora do app, que uma conta ou um arquivo deixou de
// existir. O app Next.js não a conhece.

const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";

function supabase(args: string): string {
  return execSync(`supabase ${args}`, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

function lerStatus(): Record<string, string> {
  const saida = supabase("status -o env");
  const valores: Record<string, string> = {};
  for (const linha of saida.split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
    if (m) valores[m[1]] = m[2];
  }
  return valores;
}

async function esperar(url: string, headers: Record<string, string>, oQue: string) {
  const limite = Date.now() + 90_000;
  for (;;) {
    try {
      const r = await fetch(url, { headers });
      if (r.ok) return;
    } catch {
      // ainda subindo
    }
    if (Date.now() > limite) throw new Error(`${oQue} não respondeu em ${url}. O 'supabase start' está rodando?`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export default async function globalSetup() {
  if (!process.env.E2E_SEM_RESET) {
    console.log("e2e: recriando o banco local (supabase db reset)…");
    supabase("db reset");
  }

  const status = lerStatus();
  const url = status.API_URL;
  const anon = status.ANON_KEY ?? status.PUBLISHABLE_KEY;
  const servico = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY;
  if (!url || !anon || !servico) {
    throw new Error("Não consegui ler API_URL e as chaves em `supabase status -o env`. Rode `supabase start` antes.");
  }
  process.env.E2E_SUPABASE_URL = url;
  process.env.E2E_SUPABASE_ANON_KEY = anon;
  process.env.E2E_SUPABASE_SERVICE_KEY = servico;
  process.env.E2E_MAILPIT_URL = MAILPIT;

  // Depois do reset o Auth leva alguns segundos para voltar.
  await esperar(`${url}/auth/v1/health`, { apikey: anon }, "O Auth local");
  await esperar(`${MAILPIT}/api/v1/info`, {}, "O Mailpit");

  await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
  rmSync(path.join(__dirname, ".auth"), { recursive: true, force: true });
}
