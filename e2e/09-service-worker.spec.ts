import { expect, test } from "@playwright/test";
import { emailDe, entrar } from "./apoio";

// O resto da suíte roda com o service worker bloqueado. Aqui ele é o assunto.
test.use({ serviceWorkers: "allow" });

// Tudo o que o service worker pode guardar: público e igual para todo mundo.
const PERMITIDOS = ["/icones/icone-192.png", "/icones/icone-512.png", "/icones/icone.svg", "/offline"];

type Guardado = { cache: string; url: string; corpo: string };

test("o service worker não guarda nada do Supabase nem de rota autenticada", async ({ page, context, baseURL }) => {
  const supabaseUrl = process.env.E2E_SUPABASE_URL!;
  const paraOSupabase: string[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith(supabaseUrl)) paraOSupabase.push(r.url());
  });

  await entrar(page, emailDe("beto"));
  await expect(page.getByRole("heading", { level: 1, name: "Início" })).toBeVisible();

  // O service worker instalou, ativou e passou a controlar a página. Sem isto
  // o teste passaria à toa, com a Cache Storage vazia.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state ?? null)).toBe("activated");

  // Navega logado, com o service worker no caminho: páginas com dados de
  // outras pessoas, o próprio perfil, as configurações, e navegações
  // completas (as únicas requisições em que o service worker responde).
  for (const caminho of ["/gente", "/u/lia", "/voce", "/config", "/"]) {
    await page.goto(caminho);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  }
  await page.getByRole("link", { name: "Gente" }).first().click();
  await expect(page).toHaveURL(/\/gente$/);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

  // Uma chamada autenticada do navegador direto ao Supabase, do jeito que o
  // app faz, para garantir que esse tráfego existiu durante o teste.
  const cookies = await context.cookies();
  expect(cookies.some((c) => c.name.startsWith("sb-"))).toBe(true);
  const status = await page.evaluate(
    async ({ url }) => (await fetch(`${url}/auth/v1/health`)).status,
    { url: supabaseUrl },
  );
  expect(status).toBeLessThan(500);
  expect(paraOSupabase.length).toBeGreaterThan(0);

  const guardados: Guardado[] = await page.evaluate(async () => {
    const saida: { cache: string; url: string; corpo: string }[] = [];
    for (const nome of await caches.keys()) {
      const cache = await caches.open(nome);
      for (const req of await cache.keys()) {
        const resposta = await cache.match(req);
        saida.push({ cache: nome, url: req.url, corpo: resposta ? await resposta.text() : "" });
      }
    }
    return saida;
  });

  const origem = new URL(baseURL!).origin;
  const supabase = new URL(supabaseUrl);

  // Nenhuma resposta do Supabase.
  for (const g of guardados) {
    const u = new URL(g.url);
    expect(u.origin, `em cache: ${g.url}`).toBe(origem);
    expect(u.host, `em cache: ${g.url}`).not.toBe(supabase.host);
    expect(g.url).not.toMatch(/supabase|\/rest\/v1|\/auth\/v1|\/storage\/v1|\/functions\/v1/);
  }

  // Nenhuma rota autenticada: o que está guardado é exatamente a lista
  // pública, e nada além dela. Nem "/", nem /gente, nem RSC, nem /api.
  expect(guardados.map((g) => new URL(g.url).pathname + new URL(g.url).search).sort()).toEqual(PERMITIDOS);

  // E o conteúdo guardado não tem nada de quem estava logado.
  for (const g of guardados) {
    expect(g.corpo, `corpo de ${g.url}`).not.toContain(emailDe("beto"));
    expect(g.corpo, `corpo de ${g.url}`).not.toContain("@beto");
    expect(g.corpo, `corpo de ${g.url}`).not.toContain("access_token");
  }

  // Sem rede, o que o service worker entrega é a página offline, e não uma
  // cópia do Início de quem estava logado.
  await context.setOffline(true);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Você está sem conexão" })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await context.setOffline(false);
});
