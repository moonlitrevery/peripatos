#!/usr/bin/env node
// Mede quanto tempo leva cada navegação do app e ONDE o tempo vai.
//
//   supabase start && supabase db reset
//   node scripts/medir-navegacao.mjs [--atraso 60] [--rodadas 5] [--saida arquivo.json]
//
// Como funciona:
//   1. sobe um proxy na frente do Supabase local que atrasa cada requisição
//      (padrão: 60 ms) e anota início, fim e caminho de cada uma. No ambiente
//      local o banco responde em 2 ms e toda página parece instantânea; com o
//      atraso, o que pesa em produção (quantas idas ao Supabase, e quantas
//      delas em fila) aparece no relógio;
//   2. faz o build de produção apontando para o proxy e sobe `next start`;
//   3. entra como a Lia (conta do seed) e, para cada rota, mede:
//        - carga: abrir o endereço direto (documento inteiro);
//        - toque: chegar pela navegação do app (transição no cliente);
//      e, em cada uma, as idas ao Supabase feitas pelo SERVIDOR: quantas, em
//      quantas ondas (requisições que se sobrepõem contam como uma onda) e
//      quanto tempo o servidor passou esperando por elas.
//
// O número que importa é "ondas": cada onda é uma ida e volta ao banco que o
// usuário espera inteira. Dez consultas em paralelo custam uma onda; três em
// sequência custam três.
import { spawn, execSync } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "@playwright/test";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > 0 ? process.argv[i + 1] : padrao;
};
const ATRASO = Number(arg("atraso", "60"));
const RODADAS = Number(arg("rodadas", "5"));
const SAIDA = arg("saida", "");
const PORTA_PROXY = 54399;
const PORTA_APP = 3100;
const SUPABASE = { host: "127.0.0.1", port: 54321 };
const MAILPIT = "http://127.0.0.1:54324";
const APP = `http://127.0.0.1:${PORTA_APP}`;
const EMAIL = "lia.900003@alunos.unisagrado.edu.br";

const ROTAS = [
  { nome: "Início", caminho: "/", aba: "Início" },
  { nome: "Gente", caminho: "/gente", aba: "Gente" },
  { nome: "Perfil de outra pessoa", caminho: "/u/caue", aba: null },
  { nome: "Mensagens", caminho: "/mensagens", aba: "Mensagens" },
  { nome: "Você", caminho: "/voce", aba: "Você" },
  { nome: "Configurações", caminho: "/config", aba: null },
];

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const mediana = (xs) => {
  const o = [...xs].sort((a, b) => a - b);
  return o.length ? o[Math.floor(o.length / 2)] : 0;
};

// ---------------------------------------------------------------------------
// Proxy com atraso
// ---------------------------------------------------------------------------
/** @type {{inicio:number, fim:number, caminho:string, servidor:boolean}[]} */
const registro = [];

const proxy = http.createServer((req, res) => {
  const inicio = performance.now();
  // O navegador manda um User-Agent de navegador; o servidor do Next, não.
  const servidor = !/Mozilla/.test(req.headers["user-agent"] ?? "");
  const caminho = (req.url ?? "").split("?")[0];
  setTimeout(() => {
    const saida = http.request({ ...SUPABASE, method: req.method, path: req.url, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
      r.on("end", () => registro.push({ inicio, fim: performance.now(), caminho, servidor }));
    });
    saida.on("error", () => {
      res.writeHead(502).end();
    });
    req.pipe(saida);
  }, ATRASO);
});
// WebSocket do Realtime: passa direto, sem medir.
proxy.on("upgrade", (req, soquete, cabeca) => {
  const destino = net.connect(SUPABASE.port, SUPABASE.host, () => {
    destino.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n")}\r\n\r\n`);
    destino.write(cabeca);
    soquete.pipe(destino).pipe(soquete);
  });
  destino.on("error", () => soquete.destroy());
  soquete.on("error", () => destino.destroy());
});

/** Resume as idas do servidor ao Supabase dentro de uma janela de tempo. */
function resumir(de, ate) {
  const idas = registro.filter((r) => r.servidor && r.inicio >= de && r.inicio <= ate).sort((a, b) => a.inicio - b.inicio);
  let ondas = 0;
  let espera = 0;
  let fimDaOnda = -Infinity;
  let inicioDaOnda = 0;
  for (const r of idas) {
    if (r.inicio >= fimDaOnda) {
      if (ondas > 0) espera += fimDaOnda - inicioDaOnda;
      ondas++;
      inicioDaOnda = r.inicio;
      fimDaOnda = r.fim;
    } else fimDaOnda = Math.max(fimDaOnda, r.fim);
  }
  if (ondas > 0) espera += fimDaOnda - inicioDaOnda;
  return { consultas: idas.length, ondas, espera, caminhos: idas.map((r) => r.caminho.replace(/^\/(rest|auth|storage)\/v1\//, "$1:")) };
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const ambiente = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${PORTA_PROXY}`, NODE_ENV: "production" };

async function esperarApp() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${APP}/entrar`);
      if (r.ok) return;
    } catch {
      // ainda subindo
    }
    await dormir(500);
  }
  throw new Error("o app não subiu");
}

async function codigoDoEmail(antes) {
  for (let i = 0; i < 60; i++) {
    const r = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${EMAIL}"`)}`)).json();
    const nova = (r.messages ?? []).find((m) => !antes.has(m.ID));
    if (nova) {
      const m = await (await fetch(`${MAILPIT}/api/v1/message/${nova.ID}`)).json();
      return `${m.Text ?? ""}`.match(/(?<!\d)\d{6}(?!\d)/)[0];
    }
    await dormir(300);
  }
  throw new Error("o código não chegou no Mailpit");
}

async function medir() {
  await new Promise((r) => proxy.listen(PORTA_PROXY, "127.0.0.1", r));
  console.error(`proxy com ${ATRASO} ms de atraso em :${PORTA_PROXY}`);
  console.error("build de produção…");
  execSync("pnpm exec next build", { cwd: RAIZ, env: ambiente, stdio: ["ignore", "ignore", "inherit"] });
  const app = spawn("pnpm", ["exec", "next", "start", "--port", String(PORTA_APP)], { cwd: RAIZ, env: ambiente, stdio: "ignore", detached: true });
  const resultado = [];
  try {
    await esperarApp();
    const navegador = await chromium.launch();
    const contexto = await navegador.newContext({ ...devices["Pixel 7"], locale: "pt-BR", serviceWorkers: "block" });
    const page = await contexto.newPage();

    const antes = new Set(((await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${EMAIL}"`)}`)).json()).messages ?? []).map((m) => m.ID));
    await page.goto(`${APP}/entrar`);
    await page.getByLabel("E-mail institucional").fill(EMAIL);
    await page.getByRole("button", { name: "Receber código" }).click();
    await page.getByLabel("Código de 6 dígitos").fill(await codigoDoEmail(antes));
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/entrar"));
    await page.getByRole("heading", { level: 1 }).waitFor();

    for (const rota of ROTAS) {
      const carga = { ttfb: [], pronto: [], consultas: [], ondas: [], espera: [], caminhos: [] };
      const toque = { pronto: [], esqueleto: [], consultas: [], ondas: [], espera: [], caminhos: [] };
      for (let i = 0; i < RODADAS + 1; i++) {
        // --- carga: o endereço direto
        await dormir(400);
        let de = performance.now();
        await page.goto(APP + rota.caminho, { waitUntil: "commit" });
        await page.locator("main h1").first().waitFor();
        const pronto = performance.now() - de;
        const ttfb = await page.evaluate(() => {
          const n = performance.getEntriesByType("navigation")[0];
          return n.responseStart - n.startTime;
        });
        await dormir(250);
        let r = resumir(de, de + pronto);
        // a primeira rodada aquece o servidor e não conta
        if (i > 0) {
          carga.ttfb.push(ttfb);
          carga.pronto.push(pronto);
          carga.consultas.push(r.consultas);
          carga.ondas.push(r.ondas);
          carga.espera.push(r.espera);
          carga.caminhos = r.caminhos;
        }

        // --- toque: chega pela navegação do app, vindo de outra tela
        if (!rota.aba) continue;
        const origem = rota.caminho === "/voce" ? "/" : "/voce";
        await page.goto(APP + origem);
        await page.locator("main h1").first().waitFor();
        await dormir(600); // deixa o prefetch e o contador terminarem
        const elo = page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: new RegExp(`^${rota.aba}`) });
        de = performance.now();
        await elo.click();
        // primeiro sinal de que algo mudou (esqueleto ou a página)
        await page.waitForFunction((c) => location.pathname === c, rota.caminho);
        const esqueleto = performance.now() - de;
        await page.locator("main h1").first().waitFor();
        await page.waitForFunction(() => !document.querySelector("[data-esqueleto]"));
        const prontoToque = performance.now() - de;
        await dormir(250);
        r = resumir(de, de + prontoToque);
        if (i > 0) {
          toque.pronto.push(prontoToque);
          toque.esqueleto.push(esqueleto);
          toque.consultas.push(r.consultas);
          toque.ondas.push(r.ondas);
          toque.espera.push(r.espera);
          toque.caminhos = r.caminhos;
        }
      }
      const m = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, k === "caminhos" ? v : Math.round(mediana(v))]));
      resultado.push({ rota: rota.nome, caminho: rota.caminho, carga: m(carga), toque: rota.aba ? m(toque) : null });
      console.error(`medido: ${rota.nome}`);
    }
    await navegador.close();
  } finally {
    try {
      process.kill(-app.pid);
    } catch {
      // já saiu
    }
    proxy.close();
  }
  return resultado;
}

const resultado = await medir();
const relatorio = { atrasoMs: ATRASO, rodadas: RODADAS, quando: new Date().toISOString(), rotas: resultado };
if (SAIDA) writeFileSync(SAIDA, JSON.stringify(relatorio, null, 2));

console.log(`\nAtraso simulado por ida ao Supabase: ${ATRASO} ms · mediana de ${RODADAS} rodadas\n`);
console.log("| Rota | Carga: 1º byte | Carga: pronta | Consultas | Ondas | Espera no banco | Toque: muda de tela | Toque: pronta | Consultas | Ondas |");
console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const r of resultado) {
  const t = r.toque;
  console.log(
    `| ${r.rota} | ${r.carga.ttfb} ms | ${r.carga.pronto} ms | ${r.carga.consultas} | ${r.carga.ondas} | ${r.carga.espera} ms | ${t ? `${t.esqueleto} ms` : "–"} | ${t ? `${t.pronto} ms` : "–"} | ${t ? t.consultas : "–"} | ${t ? t.ondas : "–"} |`,
  );
}
console.log("\nIdas do servidor ao Supabase, na ordem (carga):");
for (const r of resultado) console.log(`- ${r.rota}: ${r.carga.caminhos.join(" → ")}`);
process.exit(0);
