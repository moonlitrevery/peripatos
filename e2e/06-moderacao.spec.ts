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

  test("quem é da moderação entra", async ({ browser }) => {
    const contexto = await contextoDe(browser, "moderadora");
    const page = await contexto.newPage();

    await page.goto("/voce");
    await page.getByRole("link", { name: "Moderação" }).click();
    await expect(page).toHaveURL(/\/moderacao$/);
    await expect(page.getByRole("heading", { level: 1, name: "Moderação" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: /^Denúncias em aberto/ })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: /^Fotos aguardando aprovação/ })).toBeVisible();

    await contexto.close();
  });
});
