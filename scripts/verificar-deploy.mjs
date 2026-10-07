#!/usr/bin/env node
// Verificação pós-deploy: confere, de fora e só com a chave anon/publishable,
// que o projeto Supabase não entrega nada a quem não está logado.
//
//   node scripts/verificar-deploy.mjs <URL do projeto> <chave anon/publishable>
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... pnpm verificar:deploy
//
// Opções:
//   --testar-hook   também tenta um cadastro com e-mail de domínio de fora da
//                   lista e exige a recusa do auth hook. Se o hook NÃO estiver
//                   ligado, isso cria um usuário de teste no projeto (o script
//                   avisa e você apaga no painel). Por isso é opcional.
//
// Só faz leituras (e a tentativa de cadastro acima, se pedida). Não usa nem
// aceita a service role: com ela tudo "passaria" pelo motivo errado.
//
// As listas de tabelas e funções saem das migrations do repositório
// (supabase/migrations), então acompanham o schema.
//
// Sai com código 0 se tudo passou e 1 se algo falhou.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const opcoes = new Set(args.filter((a) => a.startsWith("--")));
const posicionais = args.filter((a) => !a.startsWith("--"));
const URL_BASE = (posicionais[0] ?? process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const CHAVE = posicionais[1] ?? process.env.SUPABASE_ANON_KEY ?? "";

if (!URL_BASE || !CHAVE) {
  console.error("Uso: node scripts/verificar-deploy.mjs <URL do projeto> <chave anon/publishable> [--testar-hook]");
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Recusa a service role
// ---------------------------------------------------------------------------
function papelDoJwt(chave) {
  try {
    return JSON.parse(Buffer.from(chave.split(".")[1], "base64url").toString("utf8")).role ?? null;
  } catch {
    return null;
  }
}
if (CHAVE.startsWith("sb_secret_") || papelDoJwt(CHAVE) === "service_role") {
  console.error("Esta é a chave secreta (service role). Use a chave anon/publishable: é ela que o navegador tem.");
  process.exit(2);
}

// ---------------------------------------------------------------------------
// O que existe no schema, segundo o repositório
// ---------------------------------------------------------------------------
const pastaMigrations = path.join(RAIZ, "supabase/migrations");
const sql = readdirSync(pastaMigrations)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(path.join(pastaMigrations, f), "utf8"))
  .join("\n")
  .replace(/--.*$/gm, "");

function declarados(regex) {
  return [...new Set([...sql.matchAll(regex)].map((m) => m[1].toLowerCase()))].sort();
}

const TABELAS = declarados(/create\s+(?:table|(?:or\s+replace\s+)?(?:materialized\s+)?view)\s+(?:if\s+not\s+exists\s+)?public\.([a-z_0-9]+)/gi);

// Cada função pública com os nomes dos argumentos obrigatórios. Chamar com a
// assinatura certa importa: com a errada o PostgREST responde 404 antes de
// conferir a permissão, e o teste passaria sem provar nada.
function funcoesPublicas() {
  const mapa = new Map();
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_0-9]+)\s*\(/gi)) {
    let nivel = 1;
    let i = m.index + m[0].length;
    const inicio = i;
    for (; i < sql.length && nivel > 0; i++) {
      if (sql[i] === "(") nivel++;
      if (sql[i] === ")") nivel--;
    }
    const partes = [];
    let atual = "";
    nivel = 0;
    for (const c of sql.slice(inicio, i - 1)) {
      if (c === "(") nivel++;
      if (c === ")") nivel--;
      if (c === "," && nivel === 0) {
        partes.push(atual);
        atual = "";
      } else atual += c;
    }
    partes.push(atual);
    const obrigatorios = partes
      .map((p) => p.trim())
      .filter((p) => p !== "" && !/\bdefault\b/i.test(p))
      .map((p) => p.split(/\s+/)[0].toLowerCase());
    mapa.set(m[1].toLowerCase(), obrigatorios); // a última definição vale
  }
  return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b));
}
const FUNCOES = funcoesPublicas();
const PRIVADAS = declarados(/create\s+table\s+(?:if\s+not\s+exists\s+)?private\.([a-z_0-9]+)/gi);
const BUCKETS = ["avatars", "avatar-uploads"];

if (TABELAS.length === 0 || FUNCOES.length === 0 || PRIVADAS.length === 0) {
  console.error("Não consegui ler as tabelas em supabase/migrations. Nada foi verificado.");
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Infra
// ---------------------------------------------------------------------------
const cabecalhos = { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` };

async function pedir(caminho, init = {}) {
  const r = await fetch(`${URL_BASE}${caminho}`, {
    ...init,
    headers: { ...cabecalhos, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    signal: AbortSignal.timeout(20_000),
  });
  const texto = await r.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {
    // corpo não é JSON
  }
  return { status: r.status, texto, json };
}

let falhas = 0;
let avisos = 0;
const ok = (msg) => console.log(`  ok     ${msg}`);
const falha = (msg) => {
  falhas++;
  console.log(`  FALHA  ${msg}`);
};
const aviso = (msg) => {
  avisos++;
  console.log(`  aviso  ${msg}`);
};
const titulo = (t) => console.log(`\n${t}`);
const resumo = (r) => `${r.status} ${r.texto.replace(/\s+/g, " ").slice(0, 120)}`;

// "Negado" é o banco ou o gateway recusando. Um 5xx ou um erro de rede não
// prova nada, e por isso conta como falha, não como sucesso.
const negado = (status) => status === 401 || status === 403 || status === 404;

// ---------------------------------------------------------------------------
console.log(`Verificando ${URL_BASE}`);
console.log(`${TABELAS.length} tabelas, ${FUNCOES.length} funções, ${PRIVADAS.length} tabelas privadas (lidas do repositório)`);

titulo("1. O projeto responde");
{
  const r = await pedir("/auth/v1/settings");
  if (r.status === 200 && r.json) ok("Auth respondeu com a chave informada");
  else {
    falha(`Auth não respondeu como esperado: ${resumo(r)}`);
    console.log("\nSem o projeto respondendo, o resto não prova nada. Confira a URL e a chave.");
    process.exit(1);
  }

  const cfg = r.json;
  const ext = cfg.external ?? {};
  if (ext.email === true) ok("login por e-mail ligado");
  else falha("login por e-mail desligado: ninguém consegue entrar");
  if (ext.anonymous_users === false) ok("login anônimo desligado");
  else falha("login anônimo LIGADO: desligue em Authentication → Sign In / Providers");
  if (ext.phone === false) ok("login por telefone desligado");
  else falha("login por telefone LIGADO");
  const provedores = Object.entries(ext).filter(([k, v]) => v === true && k !== "email");
  if (provedores.length === 0) ok("nenhum provedor social ligado");
  else falha(`provedores ligados além do e-mail: ${provedores.map(([k]) => k).join(", ")} (eles não passam pelo formato nome.RA@dominio)`);
  if (cfg.mailer_autoconfirm === false) ok("confirmação de e-mail obrigatória");
  else falha("confirmação de e-mail DESLIGADA (mailer_autoconfirm): qualquer um entra sem provar o e-mail");
}

titulo("2. A chave anon não lê nenhuma tabela");
for (const t of TABELAS) {
  const r = await pedir(`/rest/v1/${t}?select=*&limit=1`);
  if (negado(r.status)) ok(`${t}: negado (${r.status})`);
  else if (r.status === 200 && Array.isArray(r.json) && r.json.length === 0)
    falha(`${t}: respondeu 200 com lista vazia. A anon tem SELECT nesta tabela e só o RLS a segura; o projeto foi desenhado para a anon não ter privilégio nenhum`);
  else if (r.status === 200) falha(`${t}: a anon LEU dados: ${resumo(r)}`);
  else falha(`${t}: resposta inesperada: ${resumo(r)}`);
}

titulo("3. A chave anon não escreve nem chama funções");
for (const t of TABELAS) {
  // Corpo vazio: se a anon tivesse INSERT, o banco tentaria inserir os valores
  // padrão. Sem privilégio, a recusa vem antes de qualquer validação.
  const r = await pedir(`/rest/v1/${t}`, { method: "POST", body: "{}" });
  if (r.status === 401 || r.status === 403) ok(`inserir em ${t}: negado (${r.status})`);
  else falha(`inserir em ${t}: ${resumo(r)}`);
}
for (const [f, obrigatorios] of FUNCOES) {
  const corpo = JSON.stringify(Object.fromEntries(obrigatorios.map((a) => [a, null])));
  const r = await pedir(`/rest/v1/rpc/${f}`, { method: "POST", body: corpo });
  if (r.status === 401 || r.status === 403) ok(`rpc ${f}: negado (${r.status})`);
  else if (r.status === 404) aviso(`rpc ${f}: 404 (assinatura não reconhecida). Não prova que a anon está sem permissão`);
  else falha(`rpc ${f}: a anon chegou até a função: ${resumo(r)}`);
}

titulo("4. O schema private não está exposto");
for (const t of PRIVADAS) {
  for (const cabecalho of ["Accept-Profile", "Content-Profile"]) {
    const r =
      cabecalho === "Accept-Profile"
        ? await pedir(`/rest/v1/${t}?select=*&limit=1`, { headers: { "Accept-Profile": "private" } })
        : await pedir(`/rest/v1/${t}`, { method: "POST", body: "{}", headers: { "Content-Profile": "private" } });
    // 406 PGRST106 = o schema não está na lista de expostos. É a resposta certa.
    if (r.status === 406 && r.json?.code === "PGRST106") {
      if (/\bprivate\b/.test(r.json.hint ?? "")) falha(`private.${t}: a lista de schemas expostos inclui private: ${r.json.hint}`);
      else ok(`private.${t} (${cabecalho}): schema não exposto`);
    } else if (r.status === 401 || r.status === 403) {
      falha(`private.${t} (${cabecalho}): negado por permissão (${r.status}), e não por o schema estar fora da API. O schema private ESTÁ exposto: tire-o de Exposed schemas`);
    } else {
      falha(`private.${t} (${cabecalho}): resposta inesperada: ${resumo(r)}`);
    }
  }
  // E o nome não pode existir em public (uma view esquecida, por exemplo).
  const r = await pedir(`/rest/v1/${t}?select=*&limit=1`);
  if (r.status === 404) ok(`${t} não existe em public`);
  else if (negado(r.status)) aviso(`${t}: a API responde ${r.status} em public para um nome que só deveria existir em private`);
  else falha(`${t} acessível por public: ${resumo(r)}`);
}
{
  const r = await pedir("/rest/v1/");
  const caminhos = Object.keys(r.json?.paths ?? {}).filter((p) => p !== "/");
  if (r.status !== 200) ok(`descrição da API (OpenAPI) negada à anon (${r.status})`);
  else if (caminhos.length === 0) ok("descrição da API (OpenAPI) não lista nenhuma tabela para a anon");
  else aviso(`a descrição da API lista ${caminhos.length} caminhos para a anon (nomes de tabelas, sem dados)`);
  if (PRIVADAS.some((t) => caminhos.includes(`/${t}`))) falha("a descrição da API lista tabelas do schema private");
}

titulo("5. Storage");
{
  const r = await pedir("/storage/v1/bucket");
  if (r.status === 200 && Array.isArray(r.json) && r.json.length === 0) ok("a anon não lista nenhum bucket");
  else if (r.status >= 400 && r.status < 500) ok(`listar buckets: negado (${r.status})`);
  else falha(`a anon lista buckets: ${resumo(r)}`);
}
for (const b of BUCKETS) {
  const lista = await pedir(`/storage/v1/object/list/${b}`, { method: "POST", body: JSON.stringify({ prefix: "", limit: 10 }) });
  if (lista.status === 200 && Array.isArray(lista.json) && lista.json.length === 0) ok(`${b}: a anon não lista arquivos`);
  else if (lista.status >= 400 && lista.status < 500) ok(`${b}: listar negado (${lista.status})`);
  else falha(`${b}: a anon lista arquivos: ${resumo(lista)}`);

  // Um bucket público serviria qualquer arquivo por URL, sem passar pelo RLS.
  const publico = await pedir(`/storage/v1/object/public/${b}/verificacao-inexistente.webp`);
  if (/bucket not found/i.test(publico.texto)) ok(`${b}: bucket não é público`);
  else if (publico.status >= 500) falha(`${b}: resposta inesperada na URL pública: ${resumo(publico)}`);
  else falha(`${b}: o bucket parece PÚBLICO (a URL pública respondeu "${resumo(publico)}"). Ele precisa ser privado`);
}

titulo("6. Edge Function processar-avatar");
{
  const r = await pedir("/functions/v1/processar-avatar", { method: "POST", body: "{}" });
  if (r.status === 401) ok("recusa quem não está logado (401)");
  else if (r.status === 404) falha("a função não está publicada (404): rode `supabase functions deploy processar-avatar`");
  else falha(`sem login a função respondeu: ${resumo(r)}`);
}

if (opcoes.has("--testar-hook")) {
  titulo("7. Auth hook de cadastro");
  const email = `verificacao.${Date.now()}@fora-da-lista.invalid`;
  const r = await pedir("/auth/v1/otp", { method: "POST", body: JSON.stringify({ email, create_user: true }) });
  if (r.status === 403) ok(`cadastro de domínio de fora recusado: ${(r.json?.msg ?? r.json?.message ?? "").slice(0, 100)}`);
  else if (r.status === 429) aviso("limite de e-mails atingido (429): não deu para testar o hook agora");
  else if (r.status === 200)
    falha(`o cadastro de ${email} foi ACEITO: o hook Before User Created não está ligado. Ligue o hook e apague esse usuário em Authentication → Users`);
  else
    falha(`resposta inesperada: ${resumo(r)}. Se o usuário ${email} aparecer em Authentication → Users, o hook não está ligado: apague-o`);
} else {
  titulo("7. Auth hook de cadastro");
  console.log("  pulado (rode com --testar-hook; veja o aviso no topo do script)");
}

console.log(`\n${falhas === 0 ? "PASSOU" : "FALHOU"}: ${falhas} falha(s), ${avisos} aviso(s).`);
process.exit(falhas === 0 ? 0 : 1);
