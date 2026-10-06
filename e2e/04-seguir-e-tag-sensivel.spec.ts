import { expect, test } from "@playwright/test";
import { contextoDe } from "./apoio";

// No seed: Íris segue Cauê, Cauê não segue Íris. Cauê marcou "Bissexual"
// (sensível). Os dois têm exatamente um gosto em comum: Anime.
test("seguir de volta vira mútuo, e só então a tag sensível aparece", async ({ browser }) => {
  const daIris = await contextoDe(browser, "iris");
  const doCaue = await contextoDe(browser, "caue");
  const iris = await daIris.newPage();
  const caue = await doCaue.newPage();

  // Em Gente, a frase e os destaques em âmbar batem: 1 gosto, 1 chip.
  await iris.goto("/gente");
  const cartao = iris.getByRole("article", { name: "Cauê", exact: true });
  await expect(cartao.getByText("Vocês têm 1 gosto em comum")).toBeVisible();
  await expect(cartao.locator(".chip-comum")).toHaveCount(1);
  await expect(cartao.locator(".chip-comum")).toContainText("Anime");
  // As em comum vêm antes de todas as outras.
  await expect(cartao.locator(".chip").first()).toHaveClass(/chip-comum/);

  // Antes do mútuo: Íris segue, mas não vê a tag sensível nem o selo.
  await iris.goto("/u/caue");
  await expect(iris.getByRole("button", { name: "Deixar de seguir Cauê" })).toBeVisible();
  await expect(iris.getByText("Vocês se seguem", { exact: true })).toHaveCount(0);
  await expect(iris.getByText("Bissexual")).toHaveCount(0);

  // Cauê segue de volta.
  await caue.goto("/u/iris");
  await expect(caue.getByText("Segue você", { exact: true })).toBeVisible();
  await caue.getByRole("button", { name: "Seguir Íris", exact: true }).click();
  await expect(caue.getByRole("button", { name: "Deixar de seguir Íris" })).toBeEnabled();
  await caue.reload();
  await expect(caue.getByText("Vocês se seguem", { exact: true })).toBeVisible();

  // Agora é mútuo: o banco passa a devolver a tag sensível para a Íris.
  await iris.reload();
  await expect(iris.getByText("Vocês se seguem", { exact: true })).toBeVisible();
  await expect(iris.getByText("Bissexual")).toBeVisible();
  await expect(iris.getByText("As tags com cadeado aparecem porque vocês se seguem.")).toBeVisible();

  await daIris.close();
  await doCaue.close();
});
