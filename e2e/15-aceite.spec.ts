import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { clientePorApi, emailDe, entrar, examinarAxe, type AchadoAxe } from "./apoio";

// Quando a versão vigente dos Termos é diferente da última que a pessoa
// aceitou, ela vê o que mudou e precisa aceitar para continuar.

/** Faz a conta voltar a ter aceitado uma versão antiga (direto no banco). */
function deixarTermosDesatualizados(username: string) {
  const pasta = path.join(__dirname, "..", "test-results");
  mkdirSync(pasta, { recursive: true });
  const sql = path.join(pasta, "termos-antigos.sql");
  writeFileSync(
    sql,
    `update private.accounts set termos_versao = '2020-01-01-antiga', termos_aceitos_em = now() - interval '90 days'
     where user_id = (select id from public.profiles where username = '${username}');`,
  );
  execSync(`supabase db query --local -f "${sql}"`, { stdio: "ignore" });
}

test("termos desatualizados: vê o que mudou, e só continua depois de aceitar", async ({ page, browser }) => {
  test.setTimeout(120_000);
  deixarTermosDesatualizados("nina");

  // Pela API, sem a interface: o banco não deixa postar.
  const pelaApi = await clientePorApi(emailDe("nina"));
  const semAceite = await pelaApi.from("posts").insert({ body: "tentando postar sem aceitar" });
  expect(semAceite.error?.code).toBe("42501");
  // Ler continua funcionando: o bloqueio é só para publicar.
  expect((await pelaApi.from("profiles").select("id").limit(1)).error).toBeNull();
  await new Promise((r) => setTimeout(r, 1500)); // um código por segundo para o mesmo e-mail

  // Ao entrar, a tela de aceite, e o endereço certo.
  await entrar(page, emailDe("nina"));
  await expect(page).toHaveURL(/\/aceite$/);
  await expect(page.getByRole("heading", { level: 1, name: "Os termos do Peripatos mudaram" })).toBeVisible();
  const mudou = page.getByRole("region", { name: "O que mudou" });
  await expect(mudou.getByRole("listitem").first()).toContainText("aba de notificações");
  await expect(mudou.getByText("Uma conquista ganha não é retirada.")).toBeVisible();
  await expect(page.getByText("Você tinha aceitado a versão anterior em")).toBeVisible();

  // Nenhuma outra tela do app abre antes do aceite.
  for (const caminho of ["/", "/gente", "/mensagens", "/config", "/voce", "/u/lia"]) {
    await page.goto(caminho);
    await expect(page, caminho).toHaveURL(/\/aceite$/);
  }
  // Os textos completos continuam acessíveis.
  await page.goto("/termos");
  await expect(page.getByRole("heading", { level: 1, name: "Termos de uso" })).toBeVisible();
  await page.goto("/aceite");

  // Recusar: sair ou excluir a conta.
  const aceitar = page.getByRole("button", { name: "Aceitar e continuar" });
  await expect(aceitar).toBeDisabled();
  await page.getByRole("button", { name: "Não aceito" }).click();
  const recusa = page.getByRole("region", { name: "Se você não aceita" });
  await expect(recusa.getByRole("button", { name: "Sair", exact: true })).toBeVisible();
  await expect(recusa.getByRole("button", { name: "Excluir minha conta" })).toBeVisible();
  // Excluir abre a confirmação de sempre (e não apaga sem ela).
  await recusa.getByRole("button", { name: "Excluir minha conta" }).click();
  const dialogo = page.getByRole("dialog", { name: "Excluir sua conta?" });
  await expect(dialogo.getByRole("button", { name: "Excluir para sempre" })).toBeDisabled();
  await dialogo.getByRole("button", { name: "Cancelar" }).click();

  // Acessibilidade da tela, nos dois temas, com a seção de recusa aberta.
  const achados: AchadoAxe[] = [];
  await examinarAxe(page, "/aceite (claro)", achados);
  await page.emulateMedia({ colorScheme: "dark" });
  await examinarAxe(page, "/aceite (escuro)", achados);
  await page.emulateMedia({ colorScheme: "light" });
  expect(achados).toEqual([]);

  // Sair: a conta fica como está, e a tela volta no próximo login.
  await recusa.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  const outro = await browser.newContext();
  const page2 = await outro.newPage();
  await entrar(page2, emailDe("nina"));
  await expect(page2).toHaveURL(/\/aceite$/);

  // Aceitar: volta ao app e pode publicar.
  await page2.getByLabel(/Li e aceito a nova versão/).check();
  await page2.getByRole("button", { name: "Aceitar e continuar" }).click();
  await expect(page2).toHaveURL("/");
  await expect(page2.getByRole("heading", { level: 1, name: "Início" })).toBeVisible();
  const texto = `Post depois de aceitar os termos ${Date.now()}`;
  await page2.getByLabel("O que você quer conversar?").fill(texto);
  await page2.getByRole("button", { name: "Publicar" }).click();
  await expect(page2.getByRole("article").filter({ hasText: texto })).toBeVisible();
  // Com os termos em dia a tela de aceite não aparece mais.
  await page2.goto("/aceite");
  await expect(page2).toHaveURL("/");
  // E pela API também passou a valer.
  const depois = await clientePorApi(emailDe("nina"));
  expect((await depois.from("posts").insert({ body: "agora sim, pela API" })).error).toBeNull();
  await outro.close();
});
