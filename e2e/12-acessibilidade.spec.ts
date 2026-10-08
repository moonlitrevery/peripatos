import { expect, test, type Page } from "@playwright/test";
import { ARQUIVO_DA_STAFF_AAL2, contextoDe, entrar, examinarAxe as examinar, pessoaNova, type AchadoAxe as Achado } from "./apoio";

// axe-core em todas as telas principais, nos dois temas. O critério é zero
// violação séria ou crítica das regras WCAG 2.1 A e AA (contraste incluído).
// De quebra, confere que nenhuma tela dispara violação da CSP.

function vigiarCsp(page: Page, violacoes: string[]) {
  page.on("console", (m) => {
    if (/Content Security Policy|Content-Security-Policy/i.test(m.text())) violacoes.push(`${page.url()} :: ${m.text()}`);
  });
}

for (const tema of ["light", "dark"] as const) {
  test(`acessibilidade (axe) em todas as telas, tema ${tema === "light" ? "claro" : "escuro"}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const achados: Achado[] = [];
    const csp: string[] = [];

    // --- Telas públicas
    const publico = await browser.newContext({ colorScheme: tema });
    const pub = await publico.newPage();
    vigiarCsp(pub, csp);
    for (const caminho of ["/entrar", "/termos", "/privacidade", "/offline", "/maiores-de-18"]) {
      await pub.goto(caminho);
      await expect(pub.getByRole("heading", { level: 1 })).toBeVisible();
      await examinar(pub, caminho, achados);
    }
    // A segunda etapa do login (código) e um erro na tela.
    await pub.goto("/entrar");
    await pub.getByLabel("E-mail institucional").fill("alguem@gmail.com");
    await pub.getByRole("button", { name: "Receber código" }).click();
    await expect(pub.locator('[role="alert"]:not(#__next-route-announcer__)')).toBeVisible();
    await examinar(pub, "/entrar (com erro)", achados);

    // --- Onboarding, os três passos, com a seção sensível aberta
    const pessoa = pessoaNova(tema === "light" ? "axeclaro" : "axeescuro");
    await entrar(pub, pessoa.email);
    await expect(pub.getByRole("heading", { level: 1, name: "Sobre você" })).toBeVisible();
    await examinar(pub, "/onboarding (passo 1)", achados);
    await pub.getByLabel("Como você quer ser chamado").fill("Pessoa do Axe");
    await pub.getByLabel("Username").fill(pessoa.username);
    await pub.getByLabel("Data de nascimento").fill("2000-05-20");
    await pub.getByLabel(/Li e aceito os Termos de uso/).check();
    await pub.getByRole("button", { name: "Continuar" }).click();
    await expect(pub.getByRole("heading", { level: 1, name: "Do que você gosta" })).toBeVisible();
    const sensiveis = pub.locator("details").filter({ hasText: "Identidade e crenças (opcional)" });
    await sensiveis.locator("summary").click();
    await examinar(pub, "/onboarding (passo 2, consentimento fechado)", achados);
    await sensiveis.getByLabel(/Autorizo o Peripatos a tratar/).check();
    await pub.locator("label.chip").filter({ hasText: /^Rock$/ }).click();
    await examinar(pub, "/onboarding (passo 2, com tags marcadas)", achados);
    await pub.getByRole("button", { name: "Continuar" }).click();
    await expect(pub.getByRole("heading", { level: 1, name: "Seu avatar" })).toBeVisible();
    await examinar(pub, "/onboarding (passo 3)", achados);
    await pub.getByRole("button", { name: "Concluir" }).click();
    await expect(pub.getByRole("heading", { level: 1, name: "Início" })).toBeVisible();
    await examinar(pub, "/ (conta nova, feed de descoberta)", achados);
    await publico.close();

    // --- Telas logadas
    const logado = await contextoDe(browser, "lia", { colorScheme: tema });
    const page = await logado.newPage();
    vigiarCsp(page, csp);
    for (const caminho of ["/", "/gente", "/u/caue", "/u/lia", "/voce", "/config", "/u/ninguem_aqui"]) {
      await page.goto(caminho);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await examinar(page, caminho, achados);
    }
    // Diálogos: seletor de GIF (com a rota simulada) e denúncia.
    await page.route(/\/api\/giphy/, (rota) =>
      rota.fulfill({ json: { gifs: [{ id: "axe1", titulo: "Gato de teste", previa: "https://media.giphy.com/e2e/previa.webp", largura: 200, altura: 200 }] } }),
    );
    await page.route(/giphy\.com\//, (rota) =>
      rota.fulfill({ contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64") }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "GIF", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Escolher um GIF" }).getByRole("button", { name: "Gato de teste" })).toBeVisible();
    await examinar(page, "/ (seletor de GIF)", achados);
    await page.keyboard.press("Escape");
    await page.goto("/u/caue");
    await page.getByRole("button", { name: /Denunciar/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await examinar(page, "/u/caue (denúncia)", achados);
    await logado.close();

    // --- Staff: a tela do segundo fator e a moderação
    const semFator = await contextoDe(browser, "admin", { colorScheme: tema });
    const s1 = await semFator.newPage();
    vigiarCsp(s1, csp);
    await s1.goto("/moderacao");
    await expect(s1.getByRole("heading", { level: 1, name: "Verificação em duas etapas" })).toBeVisible();
    await examinar(s1, "/moderacao/verificacao", achados);
    await semFator.close();

    const staff = await browser.newContext({ storageState: ARQUIVO_DA_STAFF_AAL2, colorScheme: tema });
    const s2 = await staff.newPage();
    vigiarCsp(s2, csp);
    await s2.goto("/moderacao");
    await expect(s2.getByRole("heading", { level: 1, name: "Moderação" })).toBeVisible();
    await examinar(s2, "/moderacao", achados);
    await staff.close();

    expect(achados, "violações sérias ou críticas do axe").toEqual([]);
    expect(csp, "violações da Content-Security-Policy").toEqual([]);
  });
}
