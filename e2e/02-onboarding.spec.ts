import { expect, test } from "@playwright/test";
import { entrar, marcarTag, pessoaNova, usuarioDoAuth } from "./apoio";

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
    await page.getByRole("button", { name: "Continuar" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Do que você gosta" })).toBeVisible();
    await marcarTag(page, "Rock");
    await marcarTag(page, "Café");
    await expect(page.getByText("2 de 20 escolhidas")).toBeVisible();

    // As sensíveis ficam numa seção à parte, fechada até a pessoa abrir.
    const sensiveis = page.locator("details").filter({ hasText: "Identidade e crenças (opcional)" });
    await expect(sensiveis).not.toHaveAttribute("open");
    await sensiveis.locator("summary").click();
    await expect(sensiveis.getByText("Só aparecem para quem você segue e que te segue de volta")).toBeVisible();
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
    await expect(gostos.getByText("Bissexual")).toBeVisible();
  });
});
