import { expect, test } from "@playwright/test";
import { alerta, emailDe, pedirCodigo } from "./apoio";

test.describe("Entrar com código", () => {
  test("e-mail de fora da lista é recusado com a mensagem do banco", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("E-mail institucional").fill("fulano.123456@gmail.com");
    await page.getByRole("button", { name: "Receber código" }).click();

    await expect(alerta(page)).toContainText("Cadastro restrito a e-mails institucionais");
    await expect(page.getByLabel("Código de 6 dígitos")).toHaveCount(0);
  });

  test("e-mail institucional sem RA é recusado", async ({ page }) => {
    await page.goto("/entrar");
    await page.getByLabel("E-mail institucional").fill("fulano@alunos.unisagrado.edu.br");
    await page.getByRole("button", { name: "Receber código" }).click();

    await expect(alerta(page)).toContainText("fora do formato esperado");
  });

  test("código errado avisa; o código do e-mail entra", async ({ page }) => {
    const codigo = await pedirCodigo(page, emailDe("lia"));

    // O reenvio fica travado com a contagem regressiva.
    const reenviar = page.getByRole("button", { name: /^Reenviar em \d:\d\d$/ });
    await expect(reenviar).toBeDisabled();

    const errado = codigo === "000000" ? "111111" : "000000";
    await page.getByLabel("Código de 6 dígitos").fill(errado);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(alerta(page)).toContainText("Código inválido ou expirado");

    await page.getByLabel("Código de 6 dígitos").fill(codigo);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1, name: "Início" })).toBeVisible();
  });

  test("sem login, qualquer página manda para /entrar", async ({ page }) => {
    await page.goto("/gente");
    await expect(page).toHaveURL(/\/entrar$/);
  });
});
