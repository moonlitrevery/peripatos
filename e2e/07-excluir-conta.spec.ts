import { expect, test } from "@playwright/test";
import { concluirOnboarding, contextoDe, entrar, pessoaNova, usuarioDoAuth } from "./apoio";

test("excluir a conta apaga o login, o perfil e os posts", async ({ browser, page }) => {
  const pessoa = pessoaNova("excluir");
  await entrar(page, pessoa.email);
  await concluirOnboarding(page, { nome: "Vai Embora", username: pessoa.username });

  const texto = `Último post antes de sair ${Date.now()}`;
  await page.getByLabel("O que você quer conversar?").fill(texto);
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByRole("article").filter({ hasText: texto })).toBeVisible();

  // Outra pessoa vê o perfil e o post enquanto a conta existe.
  const daLia = await contextoDe(browser, "lia");
  const lia = await daLia.newPage();
  await lia.goto(`/u/${pessoa.username}`);
  await expect(lia.getByRole("heading", { level: 1, name: "Vai Embora" })).toBeVisible();
  await expect(lia.getByText(texto)).toBeVisible();

  await page.goto("/config");
  await page.getByRole("button", { name: "Excluir minha conta" }).click();
  const dialogo = page.getByRole("dialog", { name: "Excluir sua conta?" });
  const confirmar = dialogo.getByRole("button", { name: "Excluir para sempre" });
  await expect(confirmar).toBeDisabled();
  await dialogo.getByLabel("Para confirmar, digite EXCLUIR").fill("EXCLUIR");
  await confirmar.click();

  await expect(page).toHaveURL(/\/entrar\?conta=excluida$/);
  await expect(page.getByText("Sua conta foi excluída. Seus dados foram apagados.")).toBeVisible();

  // O login não existe mais no Auth…
  expect(await usuarioDoAuth(pessoa.email)).toBeNull();
  // …a sessão antiga não abre nada…
  await page.goto("/");
  await expect(page).toHaveURL(/\/entrar$/);
  // …e para os outros o perfil e o post sumiram.
  await lia.goto(`/u/${pessoa.username}`);
  await expect(lia.getByRole("heading", { level: 1, name: "Não achamos este perfil" })).toBeVisible();

  await daLia.close();
});
