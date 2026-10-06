import { expect, test } from "@playwright/test";
import { contextoDe } from "./apoio";

// Um GIF de 1x1 para responder no lugar do Giphy.
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const GIF_ID = "e2eGifDeTeste123";

test.describe("Início", () => {
  test("a busca de GIFs exige login", async ({ request }) => {
    const r = await request.get("/api/giphy?q=gato");
    expect(r.status()).toBe(401);
  });

  test("postar com GIF grava o post e mostra o GIF", async ({ browser }) => {
    const contexto = await contextoDe(browser, "lia");
    const page = await contexto.newPage();

    // O teste não depende do Giphy nem de uma chave: a resposta da rota do
    // app e as imagens são simuladas. O que se confere é o caminho do app:
    // escolher, publicar, guardar só o ID e exibir.
    await page.route(/\/api\/giphy/, (rota) =>
      rota.fulfill({
        json: {
          gifs: [{ id: GIF_ID, titulo: "Gato de teste", previa: "https://media.giphy.com/e2e/previa.webp", largura: 200, altura: 200 }],
        },
      }),
    );
    await page.route(/giphy\.com\//, (rota) => rota.fulfill({ contentType: "image/gif", body: GIF }));

    const texto = `Post de teste com GIF ${Date.now()}`;
    await page.goto("/");
    await page.getByLabel("O que você quer conversar?").fill(texto);
    await expect(page.getByText(`${texto.length} / 500`)).toBeVisible();

    await page.getByRole("button", { name: "GIF", exact: true }).click();
    const dialogo = page.getByRole("dialog", { name: "Escolher um GIF" });
    await expect(dialogo.getByText("Powered by GIPHY")).toBeVisible();
    await dialogo.getByRole("button", { name: "Gato de teste" }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.getByAltText("GIF escolhido")).toBeVisible();

    await page.getByRole("button", { name: "Publicar" }).click();
    const noInicio = page.getByRole("article").filter({ hasText: texto });
    await expect(noInicio).toBeVisible();
    await expect(noInicio.getByAltText("GIF", { exact: true })).toHaveAttribute("src", `https://i.giphy.com/${GIF_ID}.webp`);
    await expect(page.getByLabel("O que você quer conversar?")).toHaveValue("");

    // Recarregando do banco: o post existe e a URL do GIF foi remontada a
    // partir do ID guardado.
    await page.goto("/u/lia");
    const noPerfil = page.getByRole("article").filter({ hasText: texto });
    await expect(noPerfil).toBeVisible();
    await expect(noPerfil.getByAltText("GIF", { exact: true })).toHaveAttribute("src", `https://i.giphy.com/${GIF_ID}.webp`);

    await contexto.close();
  });
});
