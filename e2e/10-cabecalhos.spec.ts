import { expect, test, type APIResponse } from "@playwright/test";
import { contextoDe } from "./apoio";

function diretivas(csp: string): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const parte of csp.split(";")) {
    const [nome, ...valores] = parte.trim().split(/\s+/);
    if (nome) mapa.set(nome, valores);
  }
  return mapa;
}

function conferirComuns(r: APIResponse) {
  const h = r.headers();
  expect(h["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains; preload");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["permissions-policy"]).toContain("geolocation=()");
  expect(h["x-powered-by"]).toBeUndefined();
}

function conferirCspDePagina(r: APIResponse) {
  const csp = diretivas(r.headers()["content-security-policy"] ?? "");
  const supabase = new URL(process.env.E2E_SUPABASE_URL!).origin;

  expect(csp.get("default-src")).toEqual(["'self'"]);
  expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
  expect(csp.get("object-src")).toEqual(["'none'"]);
  expect(csp.get("base-uri")).toEqual(["'self'"]);
  expect(csp.get("form-action")).toEqual(["'self'"]);

  // Scripts: só os do app, com nonce. Nada de inline solto, eval ou curinga.
  const script = csp.get("script-src") ?? [];
  expect(script).toContain("'self'");
  expect(script.some((v) => /^'nonce-[A-Za-z0-9+/=]{16,}'$/.test(v))).toBe(true);
  expect(script).not.toContain("'unsafe-inline'");
  expect(script).not.toContain("'unsafe-eval'");
  expect(script.some((v) => v === "*" || v === "https:" || v === "http:" || v === "data:")).toBe(false);

  // Conexões: só o próprio app e o Supabase.
  expect(csp.get("connect-src")).toEqual(["'self'", supabase, supabase.replace(/^http/, "ws")]);
  // Imagens: o app, o Supabase (avatares) e o Giphy (GIFs). Mais ninguém.
  expect(csp.get("img-src")).toEqual(["'self'", "data:", "blob:", supabase, "https://*.giphy.com"]);

  return script.find((v) => v.startsWith("'nonce-"))!;
}

test.describe("Cabeçalhos de segurança", () => {
  test("página pública sai com CSP, HSTS, Referrer-Policy e sem permitir iframe", async ({ request }) => {
    const r = await request.get("/entrar");
    expect(r.status()).toBe(200);
    conferirComuns(r);
    const nonce = conferirCspDePagina(r);

    // O nonce é novo a cada resposta, e os scripts da página saem com ele.
    const outra = await request.get("/entrar");
    expect(conferirCspDePagina(outra)).not.toBe(nonce);
    const html = await r.text();
    const valor = nonce.slice("'nonce-".length, -1);
    expect(html).toContain(`nonce="${valor}"`);
    expect(html).not.toMatch(/<script(?![^>]*\bnonce=)[^>]*>/);
  });

  test("páginas logadas, redirecionamentos, API e arquivos estáticos também", async ({ browser, request }) => {
    const contexto = await contextoDe(browser, "lia");
    for (const caminho of ["/", "/gente", "/config", "/termos", "/privacidade"]) {
      const r = await contexto.request.get(caminho);
      expect(r.status(), caminho).toBe(200);
      conferirComuns(r);
      conferirCspDePagina(r);
    }
    await contexto.close();

    // Sem login: o redirecionamento para /entrar também leva os cabeçalhos.
    const redirecionado = await request.get("/config", { maxRedirects: 0 });
    expect(redirecionado.status()).toBe(307);
    conferirComuns(redirecionado);
    expect(redirecionado.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");

    // A API não passa pelo proxy: recebe uma CSP que não deixa nada rodar.
    const api = await request.get("/api/giphy?q=gato");
    expect(api.status()).toBe(401);
    conferirComuns(api);
    expect(api.headers()["content-security-policy"]).toBe(
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );

    const sw = await request.get("/sw.js");
    conferirComuns(sw);
  });
});
