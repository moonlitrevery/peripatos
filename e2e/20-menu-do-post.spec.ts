import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { admin, contextoDe, examinarAxe, idDe, tornarMutuos, type AchadoAxe } from "./apoio";

// "Denunciar" no post fica no menu de mais ações (os três pontos), como no
// perfil: nada de link solto embaixo de cada post.
test.describe.configure({ mode: "serial" });

test.describe("Menu de mais ações no post", () => {
  const corpo = `Post para o menu de ações ${Date.now()}`;
  let contexto: BrowserContext;
  let page: Page;
  let postId = "";

  const post = () => page.getByRole("list", { name: "Posts" }).getByRole("article").filter({ hasText: corpo });
  const botao = () => post().getByRole("button", { name: "Mais ações para o post de Cauê" });
  const menu = () => post().getByRole("menu", { name: "Mais ações para o post de Cauê" });

  test.beforeAll(async ({ browser }) => {
    await tornarMutuos("lia", "caue");
    const { data: caue } = await admin().from("profiles").select("id, institution_id").eq("id", await idDe("caue")).single();
    const criado = await admin()
      .from("posts")
      .insert({ author_id: caue!.id, institution_id: caue!.institution_id, body: corpo })
      .select("id")
      .single();
    expect(criado.error).toBeNull();
    postId = criado.data!.id as string;

    contexto = await contextoDe(browser, "lia");
    page = await contexto.newPage();
  });

  test.afterAll(async () => {
    await contexto?.close();
  });

  test("o post dos outros tem os três pontos, e nenhum Denunciar solto", async () => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Seguindo" }).click();
    await expect(post()).toBeVisible();

    await expect(page.getByRole("list", { name: "Posts" }).getByRole("button", { name: "Denunciar" })).toHaveCount(0);
    await expect(botao()).toBeVisible();
    await expect(botao()).toHaveAttribute("aria-haspopup", "menu");
    await expect(botao()).toHaveAttribute("aria-expanded", "false");
    await expect(menu()).toHaveCount(0);

    // Alvo de toque de pelo menos 44 px.
    const caixa = (await botao().boundingBox())!;
    expect(caixa.width).toBeGreaterThanOrEqual(44);
    expect(caixa.height).toBeGreaterThanOrEqual(44);
  });

  test("o próprio post não tem menu: tem Apagar", async () => {
    await page.getByLabel("O que você quer conversar?").fill(`Meu post ${Date.now()}`);
    await page.getByRole("button", { name: "Publicar" }).click();
    const meu = page.getByRole("list", { name: "Posts" }).getByRole("article", { name: "Post de Lia" }).first();
    await expect(meu.getByRole("button", { name: "Apagar" })).toBeVisible();
    await expect(meu.getByRole("button", { name: /Mais ações/ })).toHaveCount(0);
  });

  test("abre e fecha pelo teclado, com o foco no lugar certo", async () => {
    await botao().focus();
    await page.keyboard.press("Enter");
    await expect(menu()).toBeVisible();
    await expect(botao()).toHaveAttribute("aria-expanded", "true");
    await expect(menu().getByRole("menuitem")).toHaveText(["Denunciar"]);
    await expect(menu().getByRole("menuitem", { name: "Denunciar" })).toBeFocused();

    // O menu cabe na tela do celular.
    const caixa = (await menu().boundingBox())!;
    const largura = page.viewportSize()!.width;
    expect(caixa.x).toBeGreaterThanOrEqual(0);
    expect(caixa.x + caixa.width).toBeLessThanOrEqual(largura);

    // Esc fecha e devolve o foco ao botão.
    await page.keyboard.press("Escape");
    await expect(menu()).toHaveCount(0);
    await expect(botao()).toBeFocused();
    await expect(botao()).toHaveAttribute("aria-expanded", "false");

    // Seta para baixo e Espaço também abrem.
    await page.keyboard.press("ArrowDown");
    await expect(menu().getByRole("menuitem", { name: "Denunciar" })).toBeFocused();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Space");
    await expect(menu().getByRole("menuitem", { name: "Denunciar" })).toBeFocused();

    // Tab fecha e segue adiante.
    await page.keyboard.press("Tab");
    await expect(menu()).toHaveCount(0);

    // Clicar fora fecha.
    await botao().click();
    await expect(menu()).toBeVisible();
    await page.locator("main h1").click();
    await expect(menu()).toHaveCount(0);
  });

  test("com o menu aberto, a tela passa no axe (claro e escuro)", async () => {
    const achados: AchadoAxe[] = [];
    for (const tema of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: tema });
      await botao().click();
      await expect(menu()).toBeVisible();
      await examinarAxe(page, `menu do post (${tema})`, achados);
      await page.keyboard.press("Escape");
      await expect(menu()).toHaveCount(0);
    }
    await page.emulateMedia({ colorScheme: "light" });
    expect(achados).toEqual([]);
  });

  test("Denunciar, só pelo teclado: abre o diálogo, envia e o foco volta ao botão", async () => {
    await botao().focus();
    await page.keyboard.press("Enter");
    await expect(menu().getByRole("menuitem", { name: "Denunciar" })).toBeFocused();
    await page.keyboard.press("Enter");

    const dialogo = page.getByRole("dialog", { name: "Denunciar este post" });
    await expect(dialogo).toBeVisible();
    await expect(menu()).toHaveCount(0);
    await dialogo.getByLabel("Motivo").selectOption("assedio");
    await dialogo.getByLabel(/Conte o que aconteceu/).fill("teste do menu de mais ações");
    await dialogo.getByRole("button", { name: "Enviar denúncia" }).click();
    await expect(dialogo.getByText("Denúncia enviada.")).toBeVisible();

    const { data } = await admin().from("reports").select("reason, post_id, reporter_id").eq("post_id", postId);
    expect(data).toEqual([{ reason: "assedio", post_id: postId, reporter_id: await idDe("lia") }]);

    await dialogo.getByRole("button", { name: "Fechar" }).click();
    await expect(dialogo).toBeHidden();
    await expect(botao()).toBeFocused();
  });

  test("Esc no diálogo cancela sem denunciar e devolve o foco", async () => {
    await botao().click();
    await menu().getByRole("menuitem", { name: "Denunciar" }).click();
    const dialogo = page.getByRole("dialog", { name: "Denunciar este post" });
    await expect(dialogo).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialogo).toBeHidden();
    await expect(botao()).toBeFocused();
    const { data } = await admin().from("reports").select("id").eq("post_id", postId);
    expect(data).toHaveLength(1);
  });

  test("no perfil do autor o post também pode ser denunciado", async () => {
    await page.goto("/u/caue");
    await expect(page.getByRole("heading", { level: 1, name: "Cauê" })).toBeVisible();
    const noPerfil = page.getByRole("region", { name: "Posts" }).getByRole("article").filter({ hasText: corpo });
    await expect(noPerfil).toBeVisible();
    const tresPontos = noPerfil.getByRole("button", { name: "Mais ações para o post de Cauê" });
    await tresPontos.focus();
    await page.keyboard.press("Enter");
    await expect(noPerfil.getByRole("menuitem")).toHaveText(["Denunciar"]);
    await page.keyboard.press("Enter");
    const dialogo = page.getByRole("dialog", { name: "Denunciar este post" });
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByLabel("Motivo")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialogo).toBeHidden();
    await expect(tresPontos).toBeFocused();

    const achados: AchadoAxe[] = [];
    await tresPontos.click();
    await examinarAxe(page, "menu do post no perfil", achados);
    expect(achados).toEqual([]);
    await page.keyboard.press("Escape");
  });

  test("no próprio perfil os posts não têm menu de denúncia", async () => {
    await page.goto("/u/lia");
    await expect(page.getByRole("heading", { level: 1, name: "Lia" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Posts" }).getByRole("article").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Mais ações para o post/ })).toHaveCount(0);
  });
});
