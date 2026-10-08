import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { TERMOS_VERSAO } from "../src/lib/legal";
import { admin, clientePorApi, entrar, examinarAxe, pessoaNova, type AchadoAxe } from "./apoio";

// A coluna da direita no desktop. Quando a pessoa já segue todo mundo
// parecido, ela mostra quem acabou de chegar, em vez de ficar vazia.
test.describe.configure({ mode: "serial" });

/** Uma conta nova, com o onboarding concluído agora, criada por fora do app. */
async function chegar(prefixo: string, nome: string, tags: string[] = []) {
  const pessoa = pessoaNova(prefixo);
  const api = await clientePorApi(pessoa.email);
  const feito = await api.rpc("completar_onboarding", {
    p_username: pessoa.username,
    p_display_name: nome,
    p_data_nascimento: "2000-05-20",
    p_termos_versao: TERMOS_VERSAO,
  });
  expect(feito.error).toBeNull();
  const {
    data: { user },
  } = await api.auth.getUser();
  if (tags.length > 0) {
    const { data } = await admin().from("tags").select("id").in("slug", tags);
    const gravadas = await api.from("profile_tags").insert((data ?? []).map((t) => ({ tag_id: t.id })));
    expect(gravadas.error).toBeNull();
  }
  return { ...pessoa, nome, id: user!.id };
}

async function desktop(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width: 1440, height: 900 },
    // O projeto "celular" emula toque em todo contexto; aqui é um computador.
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  });
}

test.describe("Recém-chegados", () => {
  let contexto: BrowserContext;
  let page: Page;
  let vera: Awaited<ReturnType<typeof chegar>>;
  let ariadne: Awaited<ReturnType<typeof chegar>>;
  let teseu: Awaited<ReturnType<typeof chegar>>;

  const coluna = () => page.getByRole("complementary", { name: "Sugestões" });
  const pessoas = () => coluna().getByRole("list").first().locator(":scope > li");

  async function abrir() {
    await page.goto("/voce");
    await expect(coluna().getByRole("link", { name: "Ver todo mundo" })).toBeVisible();
    // o esqueleto (aria-hidden) dá lugar à lista de verdade
    await expect(coluna().locator(".osso")).toHaveCount(0);
  }

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    vera = await chegar("vera", "Vera", ["rock", "cafe"]);
    contexto = await desktop(browser);
    page = await contexto.newPage();
    await entrar(page, vera.email);
    await expect(page.getByRole("heading", { level: 1, name: "Início" })).toBeVisible();
  });

  test.afterAll(async () => {
    await contexto?.close();
  });

  test("enquanto há gente parecida para seguir, a coluna é a de sempre", async () => {
    await abrir();
    await expect(coluna().getByRole("heading", { name: "Gente parecida com você" })).toBeVisible();
    await expect(coluna().getByRole("heading", { name: "Recém-chegados" })).toHaveCount(0);
    await expect(coluna().getByText(/\d+ gostos? em comum/).first()).toBeVisible();
  });

  test("quem já segue todo mundo parecido vê os recém-chegados, mais novos primeiro", async () => {
    // A Vera passa a seguir todo mundo que já estava na instituição.
    const { data: todos } = await admin().from("profiles").select("id").eq("onboarding_completo", true).neq("id", vera.id);
    for (const p of todos ?? []) {
      const { error } = await admin().from("follows").insert({ follower_id: vera.id, followee_id: p.id });
      if (error && error.code !== "23505") throw error;
    }
    // E chegam duas pessoas: a Ariadne (com um gosto em comum) e, depois, o Teseu (sem nenhum).
    ariadne = await chegar("ariadne", "Ariadne", ["rock", "xadrez"]);
    teseu = await chegar("teseu", "Teseu");

    // A Ariadne é parecida e a Vera ainda não a segue: a coluna continua sendo a de gente parecida.
    await abrir();
    await expect(coluna().getByRole("heading", { name: "Gente parecida com você" })).toBeVisible();
    await expect(pessoas()).toHaveCount(1);
    await expect(pessoas().first()).toContainText("Ariadne");
    await expect(pessoas().first()).toContainText("1 gosto em comum");

    // Seguiu: não sobra ninguém parecido, e a coluna vira Recém-chegados.
    await coluna().getByRole("button", { name: "Seguir Ariadne" }).click();
    await expect(coluna().getByRole("button", { name: "Deixar de seguir Ariadne" })).toBeVisible();
    await expect
      .poll(async () => (await admin().from("follows").select("followee_id").eq("follower_id", vera.id).eq("followee_id", ariadne.id)).data?.length)
      .toBe(1);
    await abrir();
    await expect(coluna().getByRole("heading", { name: "Recém-chegados" })).toBeVisible();
    await expect(coluna().getByRole("heading", { name: "Gente parecida com você" })).toHaveCount(0);

    // Mais novos primeiro, no máximo cinco, e a própria Vera não entra.
    await expect(pessoas().nth(0)).toContainText("Teseu");
    await expect(pessoas().nth(1)).toContainText("Ariadne");
    expect(await pessoas().count()).toBeLessThanOrEqual(5);
    await expect(coluna().getByRole("link", { name: "Vera", exact: true })).toHaveCount(0);

    // Sem contagem: só o perfil e as tags em comum.
    await expect(coluna().getByText(/\d+ gostos? em comum/)).toHaveCount(0);
    await expect(coluna().getByText(/há \d|dias?|ontem|hoje/i)).toHaveCount(0);
    const emComum = coluna().getByRole("list", { name: "Gostos em comum com Ariadne" });
    await expect(emComum.getByRole("listitem")).toHaveText([/^Rock/]);
    await expect(coluna().getByRole("list", { name: "Gostos em comum com Teseu" })).toHaveCount(0);

    // O botão diz a verdade sobre quem ela já segue.
    await expect(coluna().getByRole("button", { name: "Deixar de seguir Ariadne" })).toBeVisible();
    await expect(coluna().getByRole("button", { name: "Seguir Teseu" })).toBeVisible();
    await expect(coluna().getByRole("link", { name: "Teseu" })).toHaveAttribute("href", `/u/${teseu.username}`);
  });

  test("a coluna passa no axe, no claro e no escuro", async () => {
    const achados: AchadoAxe[] = [];
    for (const tema of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: tema });
      await abrir();
      await expect(coluna().getByRole("heading", { name: "Recém-chegados" })).toBeVisible();
      await examinarAxe(page, `recém-chegados (${tema})`, achados);
    }
    await page.emulateMedia({ colorScheme: "light" });
    expect(achados).toEqual([]);
  });

  test("dá para seguir dali, e a pessoa continua na lista", async () => {
    await abrir();
    await coluna().getByRole("button", { name: "Seguir Teseu" }).click();
    await expect(coluna().getByRole("button", { name: "Deixar de seguir Teseu" })).toBeVisible();
    await expect
      .poll(async () => (await admin().from("follows").select("followee_id").eq("follower_id", vera.id).eq("followee_id", teseu.id)).data?.length)
      .toBe(1);
    await abrir();
    await expect(pessoas().nth(0)).toContainText("Teseu");
    await expect(coluna().getByRole("button", { name: "Deixar de seguir Teseu" })).toBeVisible();
  });

  test("bloqueio e banimento tiram a pessoa da lista", async () => {
    const bloqueio = await admin().from("blocks").insert({ blocker_id: teseu.id, blocked_id: vera.id });
    expect(bloqueio.error).toBeNull();
    await abrir();
    await expect(coluna().getByRole("heading", { name: "Recém-chegados" })).toBeVisible();
    await expect(coluna().getByText("Teseu")).toHaveCount(0);
    await expect(pessoas().nth(0)).toContainText("Ariadne");

    const banida = await admin().from("profiles").update({ banned_at: new Date().toISOString() }).eq("id", ariadne.id);
    expect(banida.error).toBeNull();
    await abrir();
    await expect(coluna().getByText("Ariadne")).toHaveCount(0);
    await expect(coluna().getByText("Teseu")).toHaveCount(0);
  });

  test("no celular a coluna não existe", async ({ browser }) => {
    const estado = await contexto.storageState();
    const celular = await browser.newContext({ storageState: estado });
    const p = await celular.newPage();
    await p.goto("/voce");
    await expect(p.locator("main h1")).toBeVisible();
    await expect(p.getByRole("complementary", { name: "Sugestões" })).toBeHidden();
    await celular.close();
  });
});
