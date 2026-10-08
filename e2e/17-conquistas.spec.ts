import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { admin, clientePorApi, contextoDe, emailDe, examinarAxe, idDe, type AchadoAxe } from "./apoio";

// Conquistas no perfil, na lista e na página de cada uma. O Tomás ganha, a
// Lia olha de fora. Quem concede é sempre o banco.
test.describe.configure({ mode: "serial" });

async function tem(userId: string, slug: string): Promise<boolean> {
  const { data } = await admin().from("user_achievements").select("user_id").eq("user_id", userId).eq("achievement_slug", slug);
  return (data ?? []).length > 0;
}

test.describe("Conquistas", () => {
  let doTomas: BrowserContext;
  let daLia: BrowserContext;
  let tomas: Page;
  let lia: Page;
  let idTomas = "";
  let idLia = "";
  let idIris = "";

  const selos = (page: Page, nome: string) => page.getByRole("list", { name: nome });

  test.beforeAll(async ({ browser }) => {
    [idTomas, idLia, idIris] = await Promise.all([idDe("tomas"), idDe("lia"), idDe("iris")]);
    const db = admin();
    for (const [a, b] of [
      [idTomas, idLia],
      [idLia, idTomas],
      [idIris, idLia],
      [idLia, idIris],
    ]) {
      await db.from("blocks").delete().eq("blocker_id", a).eq("blocked_id", b);
    }
    // Começa com tudo à mostra.
    await db.from("user_achievements").update({ hidden: false }).eq("user_id", idTomas).neq("achievement_slug", "coruja-de-atena");

    doTomas = await contextoDe(browser, "tomas");
    daLia = await contextoDe(browser, "lia");
    tomas = await doTomas.newPage();
    lia = await daLia.newPage();
  });

  test.afterAll(async () => {
    await doTomas?.close();
    await daLia?.close();
  });

  test("a lista mostra as ganhas e as que faltam, sem nenhuma secreta não ganha", async () => {
    await tomas.goto("/voce");
    await tomas.getByRole("link", { name: /Conquistas/ }).click();
    await expect(tomas.getByRole("heading", { level: 1, name: "Conquistas" })).toBeVisible();

    const suas = tomas.getByRole("region", { name: /Suas conquistas/ });
    const faltam = tomas.getByRole("region", { name: /Ainda por conquistar/ });
    await expect(suas.getByRole("heading", { level: 3, name: "Fundador" })).toBeVisible();
    await expect(suas.getByRole("heading", { level: 3, name: "Peripatético" })).toBeVisible();
    await expect(faltam.getByRole("heading", { level: 3, name: "Simpósio" })).toBeVisible();
    await expect(faltam.getByRole("heading", { level: 3, name: "Odisseia" })).toBeVisible();

    // Ninguém resolveu o enigma: o Minotauro não aparece em lugar nenhum.
    await expect(tomas.locator("main").getByText("Minotauro")).toHaveCount(0);
    // A Coruja só aparece para o Tomás se ele a tiver (depende da hora do seed).
    const temCoruja = await tem(idTomas, "coruja-de-atena");
    await expect(faltam.getByText("Coruja de Atena")).toHaveCount(0);
    await expect(suas.getByText("Coruja de Atena")).toHaveCount(temCoruja ? 1 : 0);

    // O emoji tem descrição para leitor de tela.
    await expect(suas.getByRole("img", { name: "templo" })).toBeVisible();
    await expect(faltam.getByRole("img", { name: "taça de vinho" })).toBeVisible();
  });

  test("ninguém se dá conquista pela API; ganhar de verdade gera notificação", async () => {
    const pelaApi = await clientePorApi(emailDe("tomas"));
    const forjada = await pelaApi.from("user_achievements").insert({ user_id: idTomas, achievement_slug: "simposio" });
    expect(forjada.error?.code).toBe("42501");
    const apagada = await pelaApi.from("user_achievements").delete().eq("user_id", idTomas);
    expect(apagada.error?.code).toBe("42501");
    const interna = await pelaApi.rpc("conceder_conquista", { p_user_id: idTomas, p_conquista: "heracles", p_motivo: "eu mereço" });
    expect(interna.error?.code).toBe("PT403");
    expect(await tem(idTomas, "simposio")).toBe(false);
    expect(await tem(idTomas, "heracles")).toBe(false);

    // Caminho de verdade: o Tomás já tem bio e gostos; ao escolher um avatar
    // pronto, o banco concede "Conhece-te a ti mesmo".
    await admin().from("notifications").delete().eq("user_id", idTomas);
    if (!(await tem(idTomas, "conhece-te-a-ti-mesmo"))) {
      const { error } = await pelaApi.from("profiles").update({ avatar_preset: 4 }).eq("id", idTomas);
      expect(error).toBeNull();
      expect(await tem(idTomas, "conhece-te-a-ti-mesmo")).toBe(true);

      await tomas.goto("/notificacoes");
      const aviso = tomas.getByRole("list", { name: "Suas notificações" }).locator('li[data-tipo="conquista"]');
      await expect(aviso).toContainText("Você ganhou a conquista Conhece-te a ti mesmo");
      await expect(aviso.getByRole("img", { name: "espelho" })).toBeVisible();
      await aviso.getByRole("link", { name: "Conhece-te a ti mesmo" }).click();
      await expect(tomas.getByRole("heading", { level: 1, name: "Conhece-te a ti mesmo" })).toBeVisible();
      await expect(tomas.getByTestId("voce-tem")).toHaveText("Você tem esta conquista.");
    }
  });

  test("perfil com conquistas: emoji, nome e cor, diferentes dos cargos", async () => {
    await lia.goto("/u/tomas");
    await expect(lia.getByRole("heading", { level: 1, name: "Tomás" })).toBeVisible();
    const lista = selos(lia, "Conquistas de Tomás");
    await expect(lista.getByRole("link", { name: /Fundador/ })).toBeVisible();
    await expect(lista.getByRole("link", { name: /Peripatético/ })).toBeVisible();
    await expect(lista.getByRole("img", { name: "templo" })).toBeVisible();
    // Cada conquista tem a cor dela.
    const cores = await lista.locator(".medalha").evaluateAll((ms) => ms.map((m) => getComputedStyle(m).borderTopColor));
    expect(new Set(cores).size).toBe(cores.length);
    // Secreta não ganha não aparece; a Coruja de outra pessoa também não, por padrão.
    await expect(lia.locator("main").getByText("Minotauro")).toHaveCount(0);
    await expect(lista.getByText("Coruja de Atena")).toHaveCount(0);

    // Cargos: os dois com o nome escrito; só a Administração tem brilho.
    await lia.goto("/u/admin");
    const administracao = lia.locator(".cargo");
    await expect(administracao).toHaveText("Administração");
    expect(await administracao.evaluate((e) => getComputedStyle(e).boxShadow)).not.toBe("none");
    await lia.goto("/u/moderadora");
    const moderacao = lia.locator(".cargo");
    await expect(moderacao).toHaveText("Moderação");
    expect(await moderacao.evaluate((e) => getComputedStyle(e).boxShadow)).toBe("none");
    // Um cargo não tem a forma de uma conquista.
    await expect(lia.locator(".cargo .medalha")).toHaveCount(0);
  });

  test("esconder uma conquista tira do perfil e da página dela, sem perder", async () => {
    await lia.goto("/conquistas/fundador");
    await expect(lia.getByRole("heading", { level: 1, name: "Fundador" })).toBeVisible();
    const quemTem = lia.getByRole("list", { name: "Quem tem Fundador" });
    await expect(quemTem.getByRole("link", { name: /Tomás/ })).toBeVisible();

    await tomas.goto("/conquistas");
    const fundador = tomas.locator('li[data-conquista="fundador"]');
    await fundador.getByRole("button", { name: "Esconder do perfil: Fundador" }).click();
    await expect(fundador.getByRole("status")).toHaveText("Só você vê.");
    await expect(fundador.getByRole("button", { name: "Mostrar no perfil: Fundador" })).toBeVisible();

    // Para a Lia, sumiu do perfil e da página da conquista.
    await lia.reload();
    await expect(lia.getByRole("heading", { level: 1, name: "Fundador" })).toBeVisible();
    await expect(lia.getByRole("list", { name: "Quem tem Fundador" }).getByRole("link", { name: /Tomás/ })).toHaveCount(0);
    await expect(lia.getByRole("list", { name: "Quem tem Fundador" }).getByRole("link").first()).toBeVisible();
    await lia.goto("/u/tomas");
    await expect(selos(lia, "Conquistas de Tomás").getByRole("link", { name: /Fundador/ })).toHaveCount(0);
    await expect(selos(lia, "Conquistas de Tomás").getByRole("link", { name: /Peripatético/ })).toBeVisible();

    // Para o Tomás, continua lá, marcada como oculta.
    await tomas.goto("/u/tomas");
    await expect(selos(tomas, "Suas conquistas").getByRole("link", { name: "Fundador (oculta)" })).toBeVisible();
    await tomas.goto("/conquistas/fundador");
    await expect(tomas.getByTestId("voce-tem")).toHaveText("Você tem esta conquista, escondida do seu perfil.");
    expect(await tem(idTomas, "fundador")).toBe(true);

    // E a Lia não consegue mexer na conquista do Tomás pela API.
    const daLiaPelaApi = await clientePorApi(emailDe("lia"));
    await daLiaPelaApi.from("user_achievements").update({ hidden: false }).eq("user_id", idTomas);
    const { data } = await admin().from("user_achievements").select("hidden").eq("user_id", idTomas).eq("achievement_slug", "fundador").single();
    expect(data?.hidden).toBe(true);
  });

  test("Coruja de Atena: secreta e escondida por padrão", async ({ browser }) => {
    // A Íris publica de madrugada (02:00 em Brasília). A hora vem de um post
    // de verdade; o teste só escolhe a data, direto no banco.
    const { data: perfil } = await admin().from("profiles").select("institution_id").eq("id", idIris).single();
    const { error } = await admin().from("posts").insert({
      author_id: idIris,
      institution_id: perfil!.institution_id,
      body: "Insônia e mangá.",
      created_at: "2026-03-10T05:00:00Z",
    });
    expect(error).toBeNull();
    expect(await tem(idIris, "coruja-de-atena")).toBe(true);

    // Para a Lia: não aparece no perfil da Íris.
    await lia.goto("/u/iris");
    await expect(lia.getByRole("heading", { level: 1, name: "Íris" })).toBeVisible();
    await expect(lia.locator("main").getByText("Coruja de Atena")).toHaveCount(0);
    // E, se a Lia não tem a Coruja, a conquista nem existe para ela.
    if (!(await tem(idLia, "coruja-de-atena"))) {
      await lia.goto("/conquistas/coruja-de-atena");
      await expect(lia.getByRole("heading", { level: 1, name: "Conquista não encontrada" })).toBeVisible();
      await lia.goto("/conquistas");
      await expect(lia.locator("main").getByText("Coruja de Atena")).toHaveCount(0);
    }
    await lia.goto("/conquistas/minotauro");
    await expect(lia.getByRole("heading", { level: 1, name: "Conquista não encontrada" })).toBeVisible();

    // Para a Íris: está na lista dela, secreta e só para ela.
    const daIris = await contextoDe(browser, "iris");
    const iris = await daIris.newPage();
    await iris.goto("/conquistas");
    const coruja = iris.locator('li[data-conquista="coruja-de-atena"]');
    await expect(coruja.getByRole("heading", { level: 3 })).toContainText("Coruja de Atena");
    await expect(coruja).toContainText("secreta");
    await expect(coruja.getByRole("status")).toHaveText("Só você vê.");
    await expect(coruja.getByRole("img", { name: "coruja" })).toBeVisible();
    await daIris.close();
  });

  test("acessibilidade (axe) nas telas de conquistas e no perfil, nos dois temas", async ({ browser }) => {
    const achados: AchadoAxe[] = [];
    for (const tema of ["light", "dark"] as const) {
      const c = await contextoDe(browser, "tomas", { colorScheme: tema });
      const p = await c.newPage();
      for (const caminho of ["/conquistas", "/conquistas/fundador", "/conquistas/peripatetico", "/conquistas/nao-existe", "/u/tomas", "/u/admin", "/u/moderadora", "/voce"]) {
        await p.goto(caminho);
        await expect(p.getByRole("heading", { level: 1 })).toBeVisible();
        await examinarAxe(p, `${caminho} (${tema})`, achados);
      }
      await c.close();
    }
    expect(achados, "violações sérias ou críticas do axe").toEqual([]);
  });
});
