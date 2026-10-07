import { expect, test } from "@playwright/test";
import {
  admin,
  alerta,
  ARQUIVO_DA_STAFF_AAL2,
  clientePorApi,
  codigoTotp,
  contextoDe,
  emailDe,
  entrar,
  proximaJanelaTotp,
} from "./apoio";

// A staff só modera com o segundo fator confirmado NAQUELE login. O cargo
// sozinho não basta, nem pela interface nem falando direto com a API.
test("moderadora cadastra o autenticador, confirma e só então modera", async ({ browser }) => {
  test.setTimeout(180_000);

  // Uma denúncia na fila, feita por uma usuária comum.
  const { data: post } = await admin().from("posts").select("id, author_id").is("deleted_at", null).limit(1).single();
  const autor = await admin().from("profiles").select("username").eq("id", post!.author_id).single();
  const denunciante = autor.data!.username === "nina" ? "tomas" : "nina";
  const quemDenuncia = await clientePorApi(emailDe(denunciante));
  const denuncia = await quemDenuncia.from("reports").insert({ post_id: post!.id, reason: "spam" });
  expect(denuncia.error).toBeNull();

  // O Auth só aceita um pedido de código por segundo para o mesmo e-mail:
  // o login da interface vem antes, e o da API espera um pouco.
  const contexto = await contextoDe(browser, "moderadora");
  await new Promise((r) => setTimeout(r, 1500));

  // Pela API, com o cargo mas sem o segundo fator (sessão aal1): nada.
  const semFator = await clientePorApi(emailDe("moderadora"));
  expect((await semFator.from("reports").select("id")).data).toEqual([]);
  expect((await semFator.from("moderation_actions").select("id")).data).toEqual([]);
  const tentativa = await semFator.rpc("ocultar_post", { p_post_id: post!.id, p_motivo: "tentativa sem segundo fator" });
  expect(tentativa.error?.message).toBe("Confirme a verificação em duas etapas para agir como moderação.");
  const banimento = await semFator.rpc("banir_usuario", { p_user_id: post!.author_id, p_motivo: "tentativa sem segundo fator" });
  expect(banimento.error?.message).toBe("Confirme a verificação em duas etapas para agir como moderação.");
  const intacto = await admin().from("posts").select("hidden_at").eq("id", post!.id).single();
  expect(intacto.data!.hidden_at).toBeNull();

  // Pela interface: /moderacao manda confirmar antes.
  const page = await contexto.newPage();
  await page.goto("/moderacao");
  await expect(page).toHaveURL(/\/moderacao\/verificacao$/);

  await page.getByRole("button", { name: "Começar" }).click();
  await expect(page.getByAltText("QR code para o aplicativo autenticador")).toBeVisible();
  const segredo = (await page.getByTestId("segredo-totp").innerText()).trim();
  expect(segredo).toMatch(/^[A-Z2-7]{16,}$/);

  // Código errado não passa.
  const certo = codigoTotp(segredo);
  await page.getByLabel("Código do autenticador").fill(certo === "000000" ? "111111" : "000000");
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(alerta(page)).toContainText("Código incorreto ou vencido");
  await expect(page).toHaveURL(/\/moderacao\/verificacao$/);

  // Código certo: a sessão vira aal2 e a moderação abre, com a denúncia na fila.
  await page.getByLabel("Código do autenticador").fill(codigoTotp(segredo));
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page).toHaveURL(/\/moderacao$/);
  await expect(page.getByRole("heading", { level: 1, name: "Moderação" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /^Denúncias em aberto/ })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /^Fotos aguardando aprovação/ })).toBeVisible();
  await expect(page.getByText("Spam").first()).toBeVisible();
  await contexto.storageState({ path: ARQUIVO_DA_STAFF_AAL2 });
  await contexto.close();

  // Login novo, em outro aparelho: o autenticador já existe, então a tela
  // pede só o código. E o segundo fator é exigido de novo, a cada login.
  const outro = await browser.newContext();
  const page2 = await outro.newPage();
  await entrar(page2, emailDe("moderadora"));
  await page2.goto("/moderacao");
  await expect(page2).toHaveURL(/\/moderacao\/verificacao$/);
  await expect(page2.getByRole("heading", { level: 2, name: "Confirme com o autenticador" })).toBeVisible();
  await expect(page2.getByAltText("QR code para o aplicativo autenticador")).toHaveCount(0);
  await proximaJanelaTotp();
  await page2.getByLabel("Código do autenticador").fill(codigoTotp(segredo));
  await page2.getByRole("button", { name: "Confirmar" }).click();
  await expect(page2).toHaveURL(/\/moderacao$/);
  await expect(page2.getByRole("heading", { level: 2, name: /^Denúncias em aberto/ })).toBeVisible();
  await outro.close();
});
