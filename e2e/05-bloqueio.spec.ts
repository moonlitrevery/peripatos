import { expect, test, type Page } from "@playwright/test";
import { contextoDe } from "./apoio";

const POST_DO_TOMAS = "Sessão de terror no cineclube sexta. Levo o café.";
const POST_DO_BETO = "Fechando time para o interclasses. Falta goleiro.";

async function carregarOFeedInteiro(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Início" })).toBeVisible();
  const fim = page.getByText("Você chegou ao fim. Volte mais tarde.");
  const mais = page.getByRole("button", { name: "Carregar mais" });
  for (let i = 0; i < 30 && !(await fim.isVisible()); i++) {
    if (await mais.isEnabled().catch(() => false)) await mais.click().catch(() => {});
    await page.waitForTimeout(300);
  }
  await expect(fim).toBeVisible();
}

test("bloquear faz a pessoa e os posts dela sumirem, nos dois sentidos", async ({ browser }) => {
  const doBeto = await contextoDe(browser, "beto");
  const doTomas = await contextoDe(browser, "tomas");
  const beto = await doBeto.newPage();
  const tomas = await doTomas.newPage();

  // Antes: Beto vê o Tomás e o post dele.
  await carregarOFeedInteiro(beto);
  await expect(beto.getByText(POST_DO_TOMAS)).toBeVisible();
  await beto.goto("/u/tomas");
  await expect(beto.getByRole("heading", { level: 1, name: "Tomás" })).toBeVisible();
  await expect(beto.getByText(POST_DO_TOMAS)).toBeVisible();

  // Bloquear pede confirmação.
  await beto.getByRole("button", { name: "Bloquear", exact: true }).click();
  const dialogo = beto.getByRole("dialog", { name: "Bloquear Tomás?" });
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole("button", { name: "Bloquear", exact: true }).click();
  await expect(beto).toHaveURL(/\/gente$/);

  // Depois, para o Beto: nem em Gente, nem no feed, nem pelo endereço direto.
  await expect(beto.getByRole("heading", { level: 1, name: "Gente" })).toBeVisible();
  await expect(beto.getByRole("article", { name: "Tomás", exact: true })).toHaveCount(0);
  await carregarOFeedInteiro(beto);
  await expect(beto.getByText(POST_DO_TOMAS)).toHaveCount(0);
  await beto.goto("/u/tomas");
  await expect(beto.getByRole("heading", { level: 1, name: "Não achamos este perfil" })).toBeVisible();

  // E para o Tomás, que não é avisado: o Beto simplesmente não existe mais.
  await carregarOFeedInteiro(tomas);
  await expect(tomas.getByText(POST_DO_BETO)).toHaveCount(0);
  await tomas.goto("/u/beto");
  await expect(tomas.getByRole("heading", { level: 1, name: "Não achamos este perfil" })).toBeVisible();

  // O bloqueio aparece em Configurações, com a opção de desfazer.
  await beto.goto("/config");
  await expect(beto.getByRole("button", { name: "Desbloquear Tomás" })).toBeVisible();

  await doBeto.close();
  await doTomas.close();
});
