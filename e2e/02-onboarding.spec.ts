import { expect, test } from "@playwright/test";
import { alerta, clientePorApi, entrar, marcarTag, pessoaNova, usuarioDoAuth } from "./apoio";

function anosAtras(anos: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - anos);
  return d.toISOString().slice(0, 10);
}

test.describe("Onboarding", () => {
  test("menor de idade é barrado e a conta é apagada na hora", async ({ page }) => {
    const pessoa = pessoaNova("menor");
    await entrar(page, pessoa.email);
    await expect(page).toHaveURL(/\/onboarding$/);
    expect(await usuarioDoAuth(pessoa.email)).not.toBeNull();

    await page.getByLabel("Como você quer ser chamado").fill("Menor de Teste");
    await page.getByLabel("Username").fill(pessoa.username);
    await page.getByLabel("Data de nascimento").fill(anosAtras(17));
    await page.getByRole("button", { name: "Continuar" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "O Peripatos é para maiores de 18" })).toBeVisible();
    await expect(page.getByText("Volte quando fizer aniversário.")).toBeVisible();

    // Nada ficou guardado: o usuário não existe mais no Auth (e, com ele,
    // conta, RA e data de nascimento, que caem em cascata).
    expect(await usuarioDoAuth(pessoa.email)).toBeNull();

    // E a sessão acabou.
    await page.goto("/");
    await expect(page).toHaveURL(/\/entrar$/);
  });

  test("adulto completa o onboarding com gostos e tag sensível", async ({ page }) => {
    const pessoa = pessoaNova("nova");
    await entrar(page, pessoa.email);
    await expect(page).toHaveURL(/\/onboarding$/);

    await expect(page.getByText("Não precisa ser o nome que está no seu e-mail.")).toBeVisible();
    await page.getByLabel("Como você quer ser chamado").fill("Pessoa Nova");
    await page.getByLabel("Username").fill(pessoa.username);
    await page.getByLabel("Data de nascimento").fill("2000-05-20");

    // Sem aceitar os termos não passa do primeiro passo.
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(alerta(page)).toContainText("é preciso aceitar os Termos de uso e a Política de privacidade");
    await page.getByLabel(/Li e aceito os Termos de uso/).check();
    await page.getByRole("button", { name: "Continuar" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Do que você gosta" })).toBeVisible();
    await marcarTag(page, "Rock");
    await marcarTag(page, "Café");
    await expect(page.getByText("2 de 20 escolhidas")).toBeVisible();

    // As sensíveis ficam numa seção à parte, fechada até a pessoa abrir.
    const sensiveis = page.locator("details").filter({ hasText: "Identidade e crenças (opcional)" });
    await expect(sensiveis).not.toHaveAttribute("open");
    await sensiveis.locator("summary").click();

    // Consentimento específico (LGPD, art. 11): sem ele as tags nem aparecem.
    await expect(sensiveis.getByRole("heading", { name: "Consentimento para dados sensíveis" })).toBeVisible();
    await expect(sensiveis.getByText("mostrá-las a quem você segue e que te segue de volta")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Bissexual", exact: true })).toHaveCount(0);
    await sensiveis.getByLabel(/Autorizo o Peripatos a tratar as tags de identidade e crenças/).check();
    await marcarTag(page, "Bissexual");
    await page.getByRole("button", { name: "Continuar" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Seu avatar" })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(12);
    await page.getByRole("button", { name: "Concluir" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1, name: "Início" })).toBeVisible();

    await page.goto(`/u/${pessoa.username}`);
    await expect(page.getByRole("heading", { level: 1, name: "Pessoa Nova" })).toBeVisible();
    const gostos = page.getByRole("region", { name: "Gostos" });
    await expect(gostos.getByText("Rock", { exact: true })).toBeVisible();
    await expect(gostos.getByText("Café", { exact: true })).toBeVisible();
    // A tag sensível não é um gosto: fica na seção "Sobre".
    await expect(gostos.getByText("Bissexual")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Sobre" }).getByText("Bissexual")).toBeVisible();

    // Revogar o consentimento apaga as tags sensíveis na hora.
    await page.goto("/config");
    const cfg = page.locator("details").filter({ hasText: "Identidade e crenças (opcional)" });
    await expect(cfg.getByText("Você deu este consentimento em")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Bissexual", exact: true })).toBeChecked();
    await cfg.getByRole("button", { name: "Retirar consentimento e apagar estas tags" }).click();
    await page.getByRole("dialog", { name: "Retirar o consentimento?" }).getByRole("button", { name: "Retirar e apagar" }).click();
    // O consentimento sumiu: a caixa de autorização volta e as tags somem.
    await expect(cfg.getByText("Você deu este consentimento em")).toHaveCount(0);
    if ((await cfg.getAttribute("open")) === null) await cfg.locator("summary").click();
    await expect(cfg.getByLabel(/Autorizo o Peripatos a tratar as tags de identidade e crenças/)).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Bissexual", exact: true })).toHaveCount(0);

    await page.goto(`/u/${pessoa.username}`);
    await expect(page.getByRole("region", { name: "Gostos" }).getByText("Rock", { exact: true })).toBeVisible();
    await expect(page.getByText("Bissexual")).toHaveCount(0);

    // E o banco recusa uma tag sensível enviada direto pela API, sem consentimento.
    const direto = await clientePorApi(pessoa.email);
    const { data: tag } = await direto.from("tags").select("id").eq("name", "Bissexual").single();
    const tentativa = await direto.from("profile_sensitive_tags").insert({ tag_id: tag!.id });
    expect(tentativa.error?.message).toContain("consentimento específico");
  });
});
