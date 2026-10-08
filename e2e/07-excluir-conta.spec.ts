import { expect, test } from "@playwright/test";
import { admin, concluirOnboarding, contextoDe, entrar, idDe, pessoaNova, usuarioDoAuth } from "./apoio";

test("excluir a conta apaga o login, o perfil, os posts e só as mensagens de quem saiu", async ({ browser, page }) => {
  const pessoa = pessoaNova("excluir");
  await entrar(page, pessoa.email);
  await concluirOnboarding(page, { nome: "Vai Embora", username: pessoa.username });

  const texto = `Último post antes de sair ${Date.now()}`;
  await page.getByLabel("O que você quer conversar?").fill(texto);
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByRole("article").filter({ hasText: texto })).toBeVisible();
  // Otimista: o post aparece antes de o servidor confirmar. "Apagar" é a confirmação.
  await expect(page.getByRole("article").filter({ hasText: texto }).getByRole("button", { name: "Apagar" })).toBeVisible();

  // Outra pessoa vê o perfil e o post enquanto a conta existe.
  const daLia = await contextoDe(browser, "lia");
  const lia = await daLia.newPage();
  await lia.goto(`/u/${pessoa.username}`);
  await expect(lia.getByRole("heading", { level: 1, name: "Vai Embora" })).toBeVisible();
  await expect(lia.getByText(texto)).toBeVisible();

  // As duas se seguem e conversam, antes de uma delas ir embora.
  const { data: perfil } = await admin().from("profiles").select("id").eq("username", pessoa.username).single();
  const idLia = await idDe("lia");
  for (const [de, para] of [
    [perfil!.id, idLia],
    [idLia, perfil!.id],
  ]) {
    expect((await admin().from("follows").insert({ follower_id: de, followee_id: para })).error).toBeNull();
  }
  await page.goto("/u/lia");
  await page.getByRole("button", { name: "Mensagem", exact: true }).click();
  await expect(page).toHaveURL(/\/mensagens\/[0-9a-f-]{36}$/);
  const conversa = new URL(page.url()).pathname;
  await page.getByLabel("Mensagem para Lia").fill("mensagem de quem vai embora");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByRole("list", { name: "Mensagens com Lia" }).getByText("mensagem de quem vai embora")).toBeVisible();

  await lia.goto(conversa);
  await expect(lia.getByRole("list", { name: "Mensagens com Vai Embora" }).getByText("mensagem de quem vai embora")).toBeVisible();
  await lia.getByLabel("Mensagem para Vai Embora").fill("resposta de quem fica");
  await lia.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(lia.getByRole("list", { name: "Mensagens com Vai Embora" }).getByText("resposta de quem fica")).toBeVisible();

  await page.goto("/config");
  const dialogo = page.getByRole("dialog", { name: "Excluir sua conta?" });
  // A tela chega em partes (esqueleto, depois o conteúdo): um clique dado no
  // instante em que o botão aparece pode vir antes de ele estar pronto.
  await expect(async () => {
    await page.getByRole("button", { name: "Excluir minha conta" }).click();
    await expect(dialogo).toBeVisible({ timeout: 2000 });
  }).toPass();
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

  // A conversa: as mensagens de quem saiu foram apagadas; as da Lia ficaram,
  // e para ela a conversa agora é com uma "Conta excluída".
  expect((await admin().from("messages").select("id").eq("body", "mensagem de quem vai embora")).data).toEqual([]);
  expect((await admin().from("messages").select("id").eq("body", "resposta de quem fica")).data).toHaveLength(1);

  await lia.goto("/mensagens");
  const item = lia.getByRole("list", { name: "Conversas" }).getByRole("link", { name: /Conta excluída/ });
  await expect(item).toContainText("Esta pessoa excluiu a conta");
  await expect(lia.getByRole("list", { name: "Conversas" }).getByText("Vai Embora")).toHaveCount(0);
  await item.click();
  await expect(lia.getByRole("heading", { level: 1, name: "Conta excluída" })).toBeVisible();
  const mensagens = lia.getByRole("list", { name: "Mensagens com Conta excluída" });
  await expect(mensagens.getByText("resposta de quem fica")).toBeVisible();
  await expect(lia.getByText("mensagem de quem vai embora")).toHaveCount(0);
  await expect(lia.getByText("Esta pessoa excluiu a conta. As mensagens que ela escreveu foram apagadas")).toBeVisible();
  // fechada: não há onde escrever, e nenhum link para um perfil que não existe
  await expect(lia.getByRole("button", { name: "Enviar", exact: true })).toHaveCount(0);
  await expect(lia.locator("main").getByRole("link", { name: /^@/ })).toHaveCount(0);

  await daLia.close();
});
