import { existsSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  admin,
  alerta,
  ARQUIVO_DA_STAFF_AAL2,
  clientePorApi,
  codigoTotp,
  contextoDe,
  emailDe,
  entrar,
  examinarAxe,
  idDe,
  type AchadoAxe,
} from "./apoio";

// A seção Equipe de /moderacao: só a administração vê, nomeia e remove, com
// motivo obrigatório. Quem decide de verdade é o banco (220_cargos.sql).
test.describe.configure({ mode: "serial" });

test.describe("Equipe", () => {
  let daAdmin: BrowserContext;
  let page: Page;
  let idAdmin = "";
  let idTomas = "";

  const secao = () => page.getByRole("region", { name: /^Equipe/ });
  const equipe = () => secao().getByRole("list", { name: "Equipe atual" });
  const resultado = () => secao().getByRole("list", { name: "Resultado da busca" });

  async function buscar(texto: string) {
    await secao().getByLabel("Buscar pessoa da sua instituição").fill(texto);
    await secao().getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]equipe=${encodeURIComponent(texto).replace(/%/g, "%")}`));
    await expect(secao().getByRole("status")).toContainText(`para "${texto}"`);
  }

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    [idAdmin, idTomas] = await Promise.all([idDe("admin"), idDe("tomas")]);
    // Ponto de partida: o Tomás sem cargo e sem aviso de cargo.
    await admin().from("staff_roles").delete().eq("user_id", idTomas);
    await admin().from("notifications").delete().eq("user_id", idTomas).eq("type", "cargo_concedido");

    // A admin entra e cadastra o autenticador: sem o segundo fator, nada de equipe.
    daAdmin = await browser.newContext();
    page = await daAdmin.newPage();
    await entrar(page, emailDe("admin"));
    await page.goto("/moderacao");
    await expect(page).toHaveURL(/\/moderacao\/verificacao$/);
    await page.getByRole("button", { name: "Começar" }).click();
    const segredo = (await page.getByTestId("segredo-totp").innerText()).trim();
    await page.getByLabel("Código do autenticador").fill(codigoTotp(segredo));
    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page).toHaveURL(/\/moderacao$/);
  });

  test.afterAll(async () => {
    await daAdmin?.close();
  });

  test("a admin vê a equipe atual, com cargo e desde quando", async () => {
    await expect(secao().getByRole("heading", { level: 2, name: /^Equipe \(\d+\)$/ })).toBeVisible();
    const eu = equipe().getByRole("article", { name: "Admin do beta" });
    await expect(eu).toContainText("(você)");
    await expect(eu).toContainText("Administração");
    await expect(eu).toContainText(/desde \d{1,2} de \p{L}+ de \d{4}/u);
    // Ninguém mexe no próprio cargo, e a administração não sai por um botão.
    await expect(eu.getByRole("button")).toHaveCount(0);

    const helena = equipe().getByRole("article", { name: "Helena" });
    await expect(helena).toContainText("Moderação");
    await expect(helena).toContainText(/desde \d{1,2} de \p{L}+ de \d{4}/u);
    await expect(helena.getByRole("button", { name: "Remover" })).toBeVisible();
    await expect(equipe().getByRole("article", { name: "Tomás" })).toHaveCount(0);
  });

  test("buscar pessoa: por nome ou username, só da instituição, sem curinga", async () => {
    await buscar("tom");
    await expect(resultado().getByRole("article", { name: "Tomás" }).getByRole("button", { name: "Nomear como moderação" })).toBeVisible();

    // Quem já é da equipe aparece com o cargo, sem botão de nomear.
    await buscar("helena");
    const helena = resultado().getByRole("article", { name: "Helena" });
    await expect(helena).toContainText("Moderação");
    await expect(helena.getByRole("button")).toHaveCount(0);

    await buscar("zzzzzz");
    await expect(secao().getByRole("status")).toHaveText('Ninguém encontrado para "zzzzzz".');
    // % e _ são texto, não curinga: não devolvem a instituição inteira.
    await buscar("%%");
    await expect(secao().getByRole("status")).toHaveText('Ninguém encontrado para "%%".');
    await buscar("__");
    await expect(resultado().getByRole("article")).toHaveCount(0);
  });

  test("nomear pede motivo, registra, e a pessoa aparece na equipe", async () => {
    await buscar("tomas");
    await resultado().getByRole("article", { name: "Tomás" }).getByRole("button", { name: "Nomear como moderação" }).click();
    const dialogo = page.getByRole("dialog", { name: "Nomear Tomás como moderação" });
    await expect(dialogo).toBeVisible();
    const confirmar = dialogo.getByRole("button", { name: "Nomear como moderação" });
    // Sem motivo (ou com menos de 3 letras) não há como confirmar.
    await expect(confirmar).toBeDisabled();
    await dialogo.getByLabel("Motivo").fill("ok");
    await expect(confirmar).toBeDisabled();
    await dialogo.getByLabel("Motivo").fill("Ajuda muito quem chega, e topou.");
    await confirmar.click();
    await expect(dialogo).toBeHidden();

    const tomas = equipe().getByRole("article", { name: "Tomás" });
    await expect(tomas).toContainText("Moderação");
    await expect(tomas.getByRole("button", { name: "Remover" })).toBeVisible();
    // Na busca ele passa a aparecer com o cargo.
    await expect(resultado().getByRole("article", { name: "Tomás" }).getByRole("button")).toHaveCount(0);

    const cargo = await admin().from("staff_roles").select("role, granted_by").eq("user_id", idTomas);
    expect(cargo.data).toEqual([{ role: "moderador", granted_by: idAdmin }]);
    const registro = await admin()
      .from("moderation_actions")
      .select("actor_id, reason, metadata")
      .eq("action", "conceder_cargo")
      .eq("target_user_id", idTomas);
    expect(registro.data).toEqual([
      { actor_id: idAdmin, reason: "Ajuda muito quem chega, e topou.", metadata: { papel: "moderador", papel_anterior: null } },
    ]);
  });

  test("a seção, com a busca aberta, passa no axe (claro e escuro)", async () => {
    const achados: AchadoAxe[] = [];
    for (const tema of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: tema });
      await expect(resultado().getByRole("article", { name: "Tomás" })).toBeVisible();
      await examinarAxe(page, `/moderacao com Equipe (${tema})`, achados);
    }
    await page.emulateMedia({ colorScheme: "light" });
    expect(achados).toEqual([]);
  });

  test("o nomeado é avisado e não age antes de ativar a verificação em duas etapas", async ({ browser }) => {
    const doTomas = await contextoDe(browser, "tomas");
    const tomas = await doTomas.newPage();
    await tomas.goto("/notificacoes");
    const aviso = tomas.getByRole("list", { name: "Suas notificações" }).locator('li[data-tipo="cargo_concedido"]');
    await expect(aviso).toHaveCount(1);
    await expect(aviso).toContainText("Você entrou para a equipe do Peripatos");
    await expect(aviso).toContainText("ative a verificação em duas etapas");
    // O aviso não diz quem nomeou.
    await expect(aviso).not.toContainText("Admin");

    // O link leva à moderação, que manda cadastrar o segundo fator antes.
    await aviso.getByRole("link", { name: "Moderação" }).click();
    await expect(tomas).toHaveURL(/\/moderacao\/verificacao$/);
    await expect(tomas.getByRole("heading", { level: 2, name: /^Denúncias em aberto/ })).toHaveCount(0);
    await doTomas.close();

    // Pela API, com o cargo e sem o segundo fator: o banco recusa e não mostra a fila.
    await new Promise((r) => setTimeout(r, 1500)); // um código por segundo para o mesmo e-mail
    const pelaApi = await clientePorApi(emailDe("tomas"));
    const { data: post } = await admin().from("posts").select("id").is("deleted_at", null).is("hidden_at", null).limit(1).single();
    const tentativa = await pelaApi.rpc("ocultar_post", { p_post_id: post!.id, p_motivo: "primeiro dia" });
    expect(tentativa.error?.message).toBe("Confirme a verificação em duas etapas para agir como moderação.");
    expect((await pelaApi.from("moderation_actions").select("id")).data).toEqual([]);
    // E o que é da administração continua fora do alcance dele.
    const nomear = await pelaApi.rpc("definir_cargo", { p_user_id: await idDe("nina"), p_papel: "moderador", p_motivo: "quero ajudar" });
    expect(nomear.error?.code).toBe("PT403");
    const config = await pelaApi.rpc("definir_configuracao", { p_chave: "fundador_ate", p_valor: new Date().toISOString(), p_motivo: "quero" });
    expect(config.error?.code).toBe("PT403");
    const direto = await pelaApi.from("staff_roles").update({ role: "admin" }).eq("user_id", idTomas);
    expect(direto.error?.code).toBe("42501");
    expect((await admin().from("staff_roles").select("role").eq("user_id", idTomas)).data).toEqual([{ role: "moderador" }]);
  });

  test("para a moderação, a seção Equipe não existe", async ({ browser }) => {
    test.skip(!existsSync(ARQUIVO_DA_STAFF_AAL2), "depende da sessão com segundo fator criada em 11-mfa");
    const daModeradora = await browser.newContext({ storageState: ARQUIVO_DA_STAFF_AAL2 });
    const p = await daModeradora.newPage();
    await p.goto("/moderacao?equipe=tomas");
    await expect(p.getByRole("heading", { level: 2, name: /^Denúncias em aberto/ })).toBeVisible();
    await expect(p.getByRole("heading", { level: 2, name: /^Equipe/ })).toHaveCount(0);
    await expect(p.getByLabel("Buscar pessoa da sua instituição")).toHaveCount(0);
    await expect(p.getByRole("button", { name: /Nomear|Remover/ })).toHaveCount(0);
    await daModeradora.close();
  });

  test("remover pede motivo, registra, e a pessoa sai da equipe", async () => {
    await page.goto("/moderacao");
    await equipe().getByRole("article", { name: "Tomás" }).getByRole("button", { name: "Remover" }).click();
    const dialogo = page.getByRole("dialog", { name: "Remover Tomás da moderação" });
    await expect(dialogo.getByRole("button", { name: "Remover" })).toBeDisabled();
    await dialogo.getByLabel("Motivo").fill("Pediu para sair da moderação.");
    await dialogo.getByRole("button", { name: "Remover" }).click();
    await expect(dialogo).toBeHidden();
    await expect(equipe().getByRole("article", { name: "Tomás" })).toHaveCount(0);
    await expect(alerta(page)).toHaveCount(0);

    expect((await admin().from("staff_roles").select("role").eq("user_id", idTomas)).data).toEqual([]);
    const registro = await admin()
      .from("moderation_actions")
      .select("actor_id, reason, metadata")
      .eq("action", "remover_cargo")
      .eq("target_user_id", idTomas);
    expect(registro.data).toEqual([{ actor_id: idAdmin, reason: "Pediu para sair da moderação.", metadata: { papel: "moderador" } }]);
  });
});
