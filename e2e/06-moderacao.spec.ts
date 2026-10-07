import { expect, test } from "@playwright/test";
import { contextoDe } from "./apoio";

test.describe("Moderação", () => {
  test("usuário comum é mandado embora de /moderacao", async ({ browser }) => {
    const contexto = await contextoDe(browser, "nina");
    const page = await contexto.newPage();

    await page.goto("/moderacao");
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1, name: "Início" })).toBeVisible();

    await page.goto("/voce");
    await expect(page.getByRole("link", { name: "Configurações" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Moderação" })).toHaveCount(0);

    await contexto.close();
  });

  // O caminho completo (cadastrar o autenticador e entrar) está em 11-mfa.
  test("quem é da moderação, sem o segundo fator, é mandado confirmar antes", async ({ browser }) => {
    const contexto = await contextoDe(browser, "admin");
    const page = await contexto.newPage();

    await page.goto("/voce");
    await page.getByRole("link", { name: "Moderação" }).click();
    await expect(page).toHaveURL(/\/moderacao\/verificacao$/);
    await expect(page.getByRole("heading", { level: 1, name: "Verificação em duas etapas" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: /^Denúncias em aberto/ })).toHaveCount(0);

    await contexto.close();
  });
});
