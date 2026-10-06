import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------------

const DOMINIO = "alunos.unisagrado.edu.br";

// As contas do seed (supabase/seed.sql). O número é o RA.
const SEED = {
  admin: 900001,
  moderadora: 900002,
  lia: 900003,
  caue: 900004,
  nina: 900005,
  tomas: 900006,
  iris: 900007,
  beto: 900008,
} as const;

export type Alias = keyof typeof SEED;

export function emailDe(alias: Alias): string {
  return `${alias}.${SEED[alias]}@${DOMINIO}`;
}

let sequencia = 0;

// Uma pessoa que ainda não existe: e-mail e username únicos por execução.
export function pessoaNova(prefixo: string) {
  const n = `${Date.now() % 100_000_000}${sequencia++}`;
  return { email: `${prefixo}.${n}@${DOMINIO}`, username: `${prefixo}_${n}`.slice(0, 20) };
}

// ---------------------------------------------------------------------------
// Mailpit: o código de 6 dígitos chega por e-mail, e é de lá que o teste lê
// ---------------------------------------------------------------------------

const mailpit = () => process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";

type Resumo = { ID: string };

async function mensagensPara(email: string): Promise<Resumo[]> {
  const r = await fetch(`${mailpit()}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  if (!r.ok) throw new Error(`Mailpit respondeu ${r.status}`);
  const corpo = (await r.json()) as { messages?: Resumo[] };
  return corpo.messages ?? [];
}

/** Guarda o que já estava na caixa, para depois reconhecer o e-mail novo. */
export async function caixaAntes(email: string): Promise<Set<string>> {
  return new Set((await mensagensPara(email)).map((m) => m.ID));
}

/** Espera o próximo e-mail para o endereço e devolve o código de 6 dígitos. */
export async function codigoNovo(email: string, antes: Set<string>): Promise<string> {
  const limite = Date.now() + 20_000;
  for (;;) {
    const nova = (await mensagensPara(email)).find((m) => !antes.has(m.ID));
    if (nova) {
      const r = await fetch(`${mailpit()}/api/v1/message/${nova.ID}`);
      const mensagem = (await r.json()) as { Text?: string; HTML?: string };
      const texto = `${mensagem.Text ?? ""}\n${(mensagem.HTML ?? "").replace(/<[^>]+>/g, " ")}`;
      const codigo = texto.match(/(?<!\d)\d{6}(?!\d)/)?.[0];
      if (!codigo) throw new Error(`E-mail para ${email} chegou sem código de 6 dígitos:\n${texto}`);
      return codigo;
    }
    if (Date.now() > limite) throw new Error(`Nenhum e-mail novo para ${email} no Mailpit.`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

// ---------------------------------------------------------------------------
// Entrar pela interface
// ---------------------------------------------------------------------------

/** Pede o código em /entrar e para na tela do código. Devolve o código certo. */
export async function pedirCodigo(page: Page, email: string): Promise<string> {
  const antes = await caixaAntes(email);
  await page.goto("/entrar");
  await page.getByLabel("E-mail institucional").fill(email);
  await page.getByRole("button", { name: "Receber código" }).click();
  await expect(page.getByLabel("Código de 6 dígitos")).toBeVisible();
  return codigoNovo(email, antes);
}

export async function entrar(page: Page, email: string) {
  const codigo = await pedirCodigo(page, email);
  await page.getByLabel("Código de 6 dígitos").fill(codigo);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/entrar"));
}

/**
 * Um contexto de navegador já logado como uma conta do seed. O login pelo
 * código acontece uma vez por execução; depois a sessão é reaproveitada.
 */
export async function contextoDe(browser: Browser, alias: Alias): Promise<BrowserContext> {
  const pasta = path.join(__dirname, ".auth");
  const arquivo = path.join(pasta, `${alias}.json`);
  if (!existsSync(arquivo)) {
    mkdirSync(pasta, { recursive: true });
    const contexto = await browser.newContext();
    const page = await contexto.newPage();
    await entrar(page, emailDe(alias));
    await expect(page.getByRole("heading", { level: 1, name: "Início" })).toBeVisible();
    await contexto.storageState({ path: arquivo });
    await contexto.close();
  }
  return browser.newContext({ storageState: arquivo });
}

/** Onboarding mínimo de um adulto, a partir de /onboarding. Termina no Início. */
export async function concluirOnboarding(page: Page, d: { nome: string; username: string; nascimento?: string }) {
  await expect(page.getByRole("heading", { level: 1, name: "Sobre você" })).toBeVisible();
  await page.getByLabel("Como você quer ser chamado").fill(d.nome);
  await page.getByLabel("Username").fill(d.username);
  await page.getByLabel("Data de nascimento").fill(d.nascimento ?? "2000-05-20");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Do que você gosta" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Seu avatar" })).toBeVisible();
  await page.getByRole("button", { name: "Concluir" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Início" })).toBeVisible();
}

/** Marca uma tag no seletor (cada chip é um <label> com um checkbox dentro). */
export async function marcarTag(page: Page, nome: string) {
  await page.locator("label.chip").filter({ hasText: new RegExp(`^${nome}$`) }).click();
  await expect(page.getByRole("checkbox", { name: nome, exact: true })).toBeChecked();
}

// ---------------------------------------------------------------------------
// Conferências por fora do app
// ---------------------------------------------------------------------------

function env(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} ausente: o global-setup não rodou?`);
  return v;
}

/** Cliente com a service role. Só os testes usam; o app não tem essa chave. */
export function admin(): SupabaseClient {
  return createClient(env("E2E_SUPABASE_URL"), env("E2E_SUPABASE_SERVICE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** O usuário do Auth com este e-mail, ou null se não existe (mais). */
export async function usuarioDoAuth(email: string) {
  const { data, error } = await admin().auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((u) => u.email === email) ?? null;
}

/**
 * Um cliente logado como a pessoa, falando direto com a API, sem passar pelo
 * app. É o caminho de quem tenta burlar a interface.
 */
export async function clientePorApi(email: string): Promise<SupabaseClient> {
  const cliente = createClient(env("E2E_SUPABASE_URL"), env("E2E_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const antes = await caixaAntes(email);
  const pedido = await cliente.auth.signInWithOtp({ email });
  if (pedido.error) throw pedido.error;
  const token = await codigoNovo(email, antes);
  const { error } = await cliente.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
  return cliente;
}
