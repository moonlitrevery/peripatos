import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { admin, contextoDe, examinarAxe, tornarMutuos, type AchadoAxe } from "./apoio";

// Enter nas mensagens: no computador envia (Shift+Enter quebra a linha); no
// toque quebra a linha e o envio fica no botão. No composer de post, Enter
// sempre quebra a linha e Ctrl+Enter (Cmd+Enter) publica.
test.describe.configure({ mode: "serial" });

const DICA = "Enter envia · Shift+Enter quebra a linha";

/** O mesmo login da Lia, num computador: ponteiro de verdade, sem toque. */
async function computadorDaLia(browser: Browser): Promise<BrowserContext> {
  const celular = await contextoDe(browser, "lia");
  const estado = await celular.storageState();
  await celular.close();
  return browser.newContext({
    storageState: estado,
    viewport: { width: 1280, height: 900 },
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  });
}

/** Um keydown de Enter como o navegador manda no meio de uma composição (IME, autocorretor). */
async function enterSintetico(campo: Locator, extra: { isComposing?: boolean; keyCode?: number; ctrlKey?: boolean } = {}) {
  await campo.evaluate((el, init) => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true, ...init }));
  }, extra);
}

async function mensagensCom(corpo: string): Promise<number> {
  const { data, error } = await admin().from("messages").select("id").eq("body", corpo);
  if (error) throw error;
  return (data ?? []).length;
}

async function postsCom(corpo: string): Promise<number> {
  const { data, error } = await admin().from("posts").select("id").eq("body", corpo);
  if (error) throw error;
  return (data ?? []).length;
}

const marca = Date.now();

/**
 * Espera a página hidratar: o que é digitado antes disso se perde. O sinal é
 * o botão de enviar sair do desabilitado quando o campo tem texto.
 */
async function esperarFormulario(campo: Locator, botao: Locator) {
  await expect(async () => {
    await campo.fill("x");
    await expect(botao).toBeEnabled({ timeout: 1000 });
  }).toPass();
  await campo.fill("");
}

test.describe("Enter nas mensagens", () => {
  let computador: BrowserContext;
  let page: Page;
  let conversa = "";

  const campo = (p: Page = page) => p.getByLabel("Mensagem para Cauê");
  const lista = (p: Page = page) => p.getByRole("list", { name: "Mensagens com Cauê" });

  test.beforeAll(async ({ browser }) => {
    await tornarMutuos("lia", "caue");
    computador = await computadorDaLia(browser);
    page = await computador.newPage();
    await page.goto("/u/caue");
    await page.getByRole("button", { name: "Mensagem", exact: true }).click();
    await expect(page).toHaveURL(/\/mensagens\/[0-9a-f-]{36}$/);
    conversa = new URL(page.url()).pathname;
    await esperarFormulario(campo(), page.getByRole("button", { name: "Enviar", exact: true }));
  });

  test.afterAll(async () => {
    await computador?.close();
  });

  test("no computador: Enter envia e Shift+Enter quebra a linha", async () => {
    const texto = `linha um ${marca}`;
    await expect(page.getByText(DICA)).toBeVisible();
    // A dica também é lida junto com o campo.
    await expect(campo()).toHaveAttribute("aria-describedby", /nova-mensagem-dica/);

    await campo().click();
    await page.keyboard.type(texto);
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("linha dois");
    await expect(campo()).toHaveValue(`${texto}\nlinha dois`);
    expect(await mensagensCom(`${texto}\nlinha dois`)).toBe(0);

    await page.keyboard.press("Enter");
    await expect(lista().getByText(texto)).toBeVisible();
    await expect(campo()).toHaveValue("");
    await expect.poll(() => mensagensCom(`${texto}\nlinha dois`)).toBe(1);
    // O foco continua no campo, pronto para a próxima.
    await expect(campo()).toBeFocused();
  });

  test("mensagem vazia ou só com espaços não sai", async () => {
    const antes = await lista().getByRole("listitem").count();
    await campo().click();
    await page.keyboard.press("Enter");
    await expect(campo()).toHaveValue("");
    await campo().fill("   ");
    await page.keyboard.press("Enter");
    // Não enviou e também não virou quebra de linha.
    await expect(campo()).toHaveValue("   ");
    await expect(page.getByRole("button", { name: "Enviar", exact: true })).toBeDisabled();
    await page.waitForTimeout(500);
    expect(await lista().getByRole("listitem").count()).toBe(antes);
    await campo().fill("");
  });

  test("com texto em composição, o Enter não envia (isComposing e keyCode 229)", async () => {
    const texto = `こんにちは ${marca}`;
    await campo().fill(texto);
    await enterSintetico(campo(), { isComposing: true });
    await enterSintetico(campo(), { keyCode: 229 });
    await page.waitForTimeout(500);
    await expect(campo()).toHaveValue(texto);
    expect(await mensagensCom(texto)).toBe(0);

    // A contraprova: o mesmo evento, sem composição, envia.
    await enterSintetico(campo());
    await expect(lista().getByText(texto)).toBeVisible();
    await expect.poll(() => mensagensCom(texto)).toBe(1);
    await expect(campo()).toHaveValue("");
  });

  test("Enter duas vezes seguidas não envia a mesma mensagem duas vezes", async () => {
    const texto = `uma vez só ${marca}`;
    // Segura a resposta do servidor, para a segunda tecla chegar com a primeira ainda saindo.
    await page.route("**/*", async (rota) => {
      const pedido = rota.request();
      if (pedido.method() === "POST" && pedido.headers()["next-action"]) await new Promise((r) => setTimeout(r, 900));
      await rota.continue().catch(() => undefined);
    });
    await campo().fill(texto);
    await campo().press("Enter");
    await campo().press("Enter");
    await campo().press("Control+Enter");
    await expect(page.getByRole("button", { name: "Enviando…" })).toBeDisabled();
    await expect(lista().getByText(texto)).toHaveCount(1);
    await expect(campo()).toHaveValue("");
    await page.unrouteAll({ behavior: "wait" });
    await page.waitForTimeout(1200);
    expect(await mensagensCom(texto)).toBe(1);
    await expect(lista().getByText(texto)).toHaveCount(1);
  });

  test("Ctrl+Enter e Cmd+Enter continuam enviando", async () => {
    for (const [atalho, nome] of [
      ["Control+Enter", "ctrl"],
      ["Meta+Enter", "cmd"],
    ] as const) {
      const texto = `com ${nome} ${marca}`;
      await campo().fill(texto);
      await campo().press(atalho);
      await expect(lista().getByText(texto)).toBeVisible();
      await expect.poll(() => mensagensCom(texto)).toBe(1);
    }
  });

  test("a conversa, com a dica, passa no axe (claro e escuro)", async () => {
    const achados: AchadoAxe[] = [];
    for (const tema of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: tema });
      await expect(page.getByText(DICA)).toBeVisible();
      await examinarAxe(page, `conversa no computador (${tema})`, achados);
    }
    await page.emulateMedia({ colorScheme: "light" });
    expect(achados).toEqual([]);
  });

  test("no toque: Enter quebra a linha, sem dica, e o envio fica no botão", async ({ browser }) => {
    const celular = await contextoDe(browser, "lia");
    const p = await celular.newPage();
    await p.goto(conversa);
    await esperarFormulario(campo(p), p.getByRole("button", { name: "Enviar", exact: true }));
    await expect(p.getByText(DICA)).toBeHidden();

    const texto = `do celular ${marca}`;
    await campo(p).click();
    await p.keyboard.type(texto);
    await p.keyboard.press("Enter");
    await p.keyboard.type("segunda linha");
    await expect(campo(p)).toHaveValue(`${texto}\nsegunda linha`);
    await p.waitForTimeout(500);
    expect(await mensagensCom(`${texto}\nsegunda linha`)).toBe(0);

    await p.getByRole("button", { name: "Enviar", exact: true }).click();
    await expect(lista(p).getByText(texto)).toBeVisible();
    await expect.poll(() => mensagensCom(`${texto}\nsegunda linha`)).toBe(1);
    await celular.close();
  });
});

test.describe("Atalho no composer de post", () => {
  let computador: BrowserContext;
  let page: Page;

  const campo = () => page.getByLabel("O que você quer conversar?");
  const posts = () => page.getByRole("list", { name: "Posts" }).getByRole("article");

  test.beforeAll(async ({ browser }) => {
    computador = await computadorDaLia(browser);
    page = await computador.newPage();
    await page.goto("/");
    await esperarFormulario(campo(), page.getByRole("button", { name: "Publicar" }));
  });

  test.afterAll(async () => {
    await computador?.close();
  });

  test("Enter quebra a linha; Ctrl+Enter publica", async () => {
    const texto = `post de duas linhas ${marca}`;
    await campo().click();
    await page.keyboard.type(texto);
    await page.keyboard.press("Enter");
    await page.keyboard.type("segunda linha");
    await expect(campo()).toHaveValue(`${texto}\nsegunda linha`);
    await page.waitForTimeout(500);
    expect(await postsCom(`${texto}\nsegunda linha`)).toBe(0);
    // No composer não há a dica do Enter: ali ele não envia.
    await expect(page.getByText("Enter envia")).toHaveCount(0);

    await page.keyboard.press("Control+Enter");
    await expect(posts().filter({ hasText: texto })).toHaveCount(1);
    await expect(campo()).toHaveValue("");
    await expect.poll(() => postsCom(`${texto}\nsegunda linha`)).toBe(1);
  });

  test("Cmd+Enter também publica; vazio e composição não", async () => {
    await campo().click();
    await page.keyboard.press("Control+Enter");
    await campo().fill("  ");
    await page.keyboard.press("Meta+Enter");
    await expect(campo()).toHaveValue("  ");

    const emComposicao = `em composição ${marca}`;
    await campo().fill(emComposicao);
    await enterSintetico(campo(), { ctrlKey: true, isComposing: true });
    await enterSintetico(campo(), { ctrlKey: true, keyCode: 229 });
    await page.waitForTimeout(500);
    await expect(campo()).toHaveValue(emComposicao);
    expect(await postsCom(emComposicao)).toBe(0);

    const texto = `post com cmd ${marca}`;
    await campo().fill(texto);
    await campo().press("Meta+Enter");
    await expect(posts().filter({ hasText: texto })).toHaveCount(1);
    await expect.poll(() => postsCom(texto)).toBe(1);
    expect(await postsCom(emComposicao)).toBe(0);
  });
});
