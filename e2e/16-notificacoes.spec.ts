import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { admin, clientePorApi, contextoDe, emailDe, examinarAxe, idDe, type AchadoAxe, type Alias } from "./apoio";

// A aba de notificações, do ponto de vista do Tomás. Os eventos são causados
// por fora do app (outras pessoas seguindo o Tomás): quem gera a notificação
// é sempre o banco, nunca a tela.
test.describe.configure({ mode: "serial" });

const SEGUIDORES: Alias[] = ["beto", "nina", "iris"];

test.describe("Aba de notificações", () => {
  let contexto: BrowserContext;
  let page: Page;
  let tomas = "";
  const ids = new Map<Alias, string>();

  const contador = () => page.getByTestId("notificacoes-nao-lidas");
  const lista = () => page.getByRole("list", { name: "Suas notificações" });

  test.beforeAll(async ({ browser }) => {
    tomas = await idDe("tomas");
    for (const a of SEGUIDORES) ids.set(a, await idDe(a));
    // Ponto de partida conhecido: o Tomás sem follows, sem bloqueios e sem
    // notificações, seja o que for que os testes anteriores deixaram.
    const db = admin();
    for (const coluna of ["blocker_id", "blocked_id"]) await db.from("blocks").delete().eq(coluna, tomas);
    for (const coluna of ["follower_id", "followee_id"]) await db.from("follows").delete().eq(coluna, tomas);
    await db.from("notifications").delete().eq("user_id", tomas);
    await db.from("notifications").delete().eq("actor_id", tomas);
    await db.from("push_preferences").delete().eq("user_id", tomas);

    contexto = await contextoDe(browser, "tomas");
    page = await contexto.newPage();
  });

  test.afterAll(async () => {
    await contexto?.close();
  });

  test("seguidores novos chegam em tempo real, agrupados, com contador", async () => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Notificações/ })).toBeVisible();
    await expect(contador()).toHaveCount(0);

    for (const a of SEGUIDORES) {
      const { error } = await admin().from("follows").insert({ follower_id: ids.get(a)!, followee_id: tomas });
      expect(error).toBeNull();
    }
    // Três seguidores são UM grupo: o contador mostra 1, sem recarregar.
    await expect(contador()).toHaveText("1");
    await expect(page.getByRole("link", { name: /Notificações\s*, 1 não lida/ })).toBeVisible();

    await page.getByRole("link", { name: /Notificações/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Notificações" })).toBeVisible();
    const grupo = lista().locator('li[data-tipo="novo_seguidor"]');
    await expect(grupo).toHaveCount(1);
    await expect(grupo).toContainText("3 pessoas te seguiram");
    for (const nome of ["Beto", "Nina", "Íris"]) await expect(grupo.getByRole("link", { name: nome })).toBeVisible();
    await expect(grupo.getByTestId("nova")).toBeVisible();

    // Abrir a aba marca como lido: o contador some.
    await expect(contador()).toHaveCount(0);
    await page.reload();
    await expect(lista().getByTestId("nova")).toHaveCount(0);
    // Nada de curtidas, em lugar nenhum.
    await expect(page.locator("main").getByText(/curti/i)).toHaveCount(0);
  });

  test("virar mútuo aparece com destaque, e não se mistura com os seguidores", async () => {
    await page.goto("/");
    // O Tomás segue o Beto de volta, pela interface.
    await page.goto("/u/beto");
    await page.getByRole("button", { name: /Seguir/ }).first().click();
    await expect(page.getByText("Vocês se seguem")).toBeVisible();

    // Chega sem recarregar. (O número pode passar de 1: virar mútuo também
    // pode render conquistas, e cada uma é uma notificação.)
    await expect(contador()).toBeVisible();
    await page.getByRole("link", { name: /Notificações/ }).click();
    const mutuo = lista().locator('li[data-tipo="mutuo"]');
    await expect(mutuo).toHaveCount(1);
    await expect(mutuo).toContainText("Vocês viraram mútuos");
    await expect(mutuo.getByRole("link", { name: "Beto" })).toHaveAttribute("href", "/u/beto");
    // Destaque: título próprio e borda que as outras notificações não têm.
    await expect(mutuo).toHaveClass(/border-petroleo/);
    await expect(lista().locator('li[data-tipo="novo_seguidor"]')).not.toHaveClass(/border-petroleo/);
    // O grupo de seguidores continua sendo um só.
    await expect(lista().locator('li[data-tipo="novo_seguidor"]')).toHaveCount(1);

    // O Beto também recebeu a dele.
    const { data } = await admin().from("notifications").select("type").eq("user_id", ids.get("beto")!).eq("actor_id", tomas);
    expect((data ?? []).map((n) => n.type)).toEqual(["mutuo"]);
  });

  test("só o dono lê, e ninguém cria notificação pela API", async () => {
    const beto = await clientePorApi(emailDe("beto"));
    const alheias = await beto.from("notifications").select("id").eq("user_id", tomas);
    expect(alheias.error).toBeNull();
    expect(alheias.data).toEqual([]);

    const forjada = await beto.from("notifications").insert({ user_id: tomas, type: "mutuo", actor_id: ids.get("beto")! });
    expect(forjada.error?.code).toBe("42501");
    const marcada = await beto.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", ids.get("beto")!);
    expect(marcada.error?.code).toBe("42501");
  });

  test("quem o Tomás bloqueia some das notificações dele", async () => {
    await page.goto("/notificacoes");
    await expect(lista().getByRole("link", { name: "Nina" })).toBeVisible();

    const { error } = await admin().from("blocks").insert({ blocker_id: tomas, blocked_id: ids.get("nina")! });
    expect(error).toBeNull();

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Notificações" })).toBeVisible();
    await expect(lista().getByRole("link", { name: "Nina" })).toHaveCount(0);
    await expect(lista().locator('li[data-tipo="novo_seguidor"]')).toContainText("2 pessoas te seguiram");

    // Foi apagada de verdade: desbloquear não a traz de volta.
    await admin().from("blocks").delete().eq("blocker_id", tomas).eq("blocked_id", ids.get("nina")!);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Notificações" })).toBeVisible();
    await expect(lista().getByRole("link", { name: "Nina" })).toHaveCount(0);
  });

  test("push por tipo: a escolha é salva na conta", async () => {
    await page.goto("/config");
    const secao = page.getByRole("region", { name: "Notificações" });
    const mensagens = secao.getByRole("checkbox", { name: "Mensagens novas" });
    const mutuos = secao.getByRole("checkbox", { name: "Quando você e alguém viram mútuos" });
    await expect(mensagens).toBeChecked();
    await expect(mutuos).not.toBeChecked();

    await mutuos.check();
    await expect(secao.getByTestId("push-por-tipo")).toHaveText("Escolha salva.");
    await expect
      .poll(async () => (await admin().from("push_preferences").select("mutuo, mensagem, conquista").eq("user_id", tomas).maybeSingle()).data)
      .toEqual({ mutuo: true, mensagem: true, conquista: false });

    await page.reload();
    await expect(page.getByRole("region", { name: "Notificações" }).getByRole("checkbox", { name: "Quando você e alguém viram mútuos" })).toBeChecked();
    // O texto deixa claro que o aviso não leva o nome de ninguém.
    await expect(page.getByRole("region", { name: "Notificações" })).toContainText("sem o nome de ninguém");
  });

  test("acessibilidade (axe) na aba de notificações e nas configurações, nos dois temas", async ({ browser }) => {
    const achados: AchadoAxe[] = [];
    for (const tema of ["light", "dark"] as const) {
      const c = await contextoDe(browser, "tomas", { colorScheme: tema });
      const p = await c.newPage();
      // Uma não lida, para o estado "nova" e o contador também serem examinados.
      await admin().from("follows").delete().eq("follower_id", ids.get("iris")!).eq("followee_id", tomas);
      await admin().from("notifications").delete().eq("user_id", tomas).eq("actor_id", ids.get("iris")!);
      await admin().from("follows").insert({ follower_id: ids.get("iris")!, followee_id: tomas });
      await p.goto("/notificacoes");
      await expect(p.getByRole("heading", { level: 1, name: "Notificações" })).toBeVisible();
      await expect(p.getByRole("list", { name: "Suas notificações" }).getByTestId("nova")).toBeVisible();
      await examinarAxe(p, `/notificacoes (${tema})`, achados);
      await p.goto("/config");
      await expect(p.getByRole("heading", { level: 1, name: "Configurações" })).toBeVisible();
      await examinarAxe(p, `/config (${tema})`, achados);
      await c.close();
    }
    expect(achados, "violações sérias ou críticas do axe").toEqual([]);
  });
});
