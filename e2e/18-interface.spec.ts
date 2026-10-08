import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { admin, alerta, contextoDe, examinarAxe, idDe, tornarMutuos, type AchadoAxe } from "./apoio";

// Ajustes de interface: abas do Início, interface otimista, menu de mais
// ações do perfil, selo de status, avatar em arco, card de Gente, altura do
// GIF e o layout em 375, 768 e 1440 px.

const VISUAL = path.join(__dirname, "..", "test-results", "visual");

/** Roda SQL direto no banco local: só para preparar o que a API não alcança (private). */
function sql(comando: string) {
  const pasta = path.join(__dirname, "..", "test-results");
  mkdirSync(pasta, { recursive: true });
  const arquivo = path.join(pasta, `interface-${Date.now()}.sql`);
  writeFileSync(arquivo, comando);
  execSync(`supabase db query --local -f "${arquivo}"`, { stdio: "ignore" });
}

/** Um contexto de desktop (com ponteiro de verdade, para o hover existir) logado como a Lia. */
async function desktopDaLia(browser: Browser, largura: number, tema: "light" | "dark" = "light") {
  const celular = await contextoDe(browser, "lia");
  const estado = await celular.storageState();
  await celular.close();
  return browser.newContext({
    storageState: estado,
    viewport: { width: largura, height: 900 },
    // O projeto "celular" emula toque em todo contexto; aqui é um computador.
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    colorScheme: tema,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    serviceWorkers: "block",
  });
}

const posts = (page: Page) => page.getByRole("list", { name: "Posts" }).getByRole("article");

test.describe("Início: Para você e Seguindo", () => {
  test("trocar de aba, ordem pela hora, e a escolha é lembrada", async ({ browser }) => {
    await tornarMutuos("lia", "caue");
    const idLia = await idDe("lia");
    // A Lia segue o Cauê e a Nina; não segue o Beto nem o Tomás.
    for (const a of ["beto", "tomas"] as const) await admin().from("follows").delete().eq("follower_id", idLia).eq("followee_id", await idDe(a));
    await admin().from("follows").insert({ follower_id: idLia, followee_id: await idDe("nina") });
    const { data: sigo } = await admin().from("follows").select("profiles!follows_followee_id_fkey(username)").eq("follower_id", idLia);
    const seguidos = new Set((sigo ?? []).map((f) => (f.profiles as unknown as { username: string }).username));
    expect(seguidos.has("caue") && seguidos.has("nina") && !seguidos.has("beto")).toBe(true);

    const contexto = await contextoDe(browser, "lia");
    await contexto.clearCookies({ name: "aba_do_inicio" });
    const page = await contexto.newPage();
    await page.goto("/");

    const abas = page.getByRole("tablist", { name: "O que mostrar no Início" });
    const paraVoce = abas.getByRole("tab", { name: "Para você" });
    const seguindo = abas.getByRole("tab", { name: "Seguindo" });
    await expect(paraVoce).toHaveAttribute("aria-selected", "true");
    await expect(seguindo).toHaveAttribute("aria-selected", "false");

    // Para você: tem gente que a Lia não segue, e a hora decide a ordem
    // dentro do círculo (os "Fora do seu círculo" entram intercalados).
    await expect(posts(page).first()).toBeVisible();
    const autores = async () =>
      posts(page).evaluateAll((as) => as.map((a) => (a.querySelector("header p")?.textContent ?? "").match(/@(\w+)/)?.[1] ?? ""));
    expect((await autores()).some((u) => !seguidos.has(u) && u !== "lia")).toBe(true);
    const horasDoCirculo = await posts(page).evaluateAll((as) =>
      as.filter((a) => !a.textContent?.includes("Fora do seu círculo")).map((a) => a.querySelector("time")?.getAttribute("datetime") ?? ""),
    );
    expect(horasDoCirculo.length).toBeGreaterThan(1);
    expect(horasDoCirculo).toEqual([...horasDoCirculo].sort().reverse());

    // Seguindo: só quem a Lia segue, do mais recente para o mais antigo, sem nada intercalado.
    await seguindo.click();
    await expect(seguindo).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-busy", "false");
    await expect(posts(page).first()).toBeVisible();
    const naAbaSeguindo = await autores();
    expect(naAbaSeguindo.length).toBeGreaterThan(0);
    expect(naAbaSeguindo.filter((u) => !seguidos.has(u))).toEqual([]);
    await expect(page.getByText("Fora do seu círculo")).toHaveCount(0);
    const horas = await posts(page).evaluateAll((as) => as.map((a) => a.querySelector("time")?.getAttribute("datetime") ?? ""));
    expect(horas).toEqual([...horas].sort().reverse());

    // Lembrada entre visitas: recarregar já abre em Seguindo, sem piscar a outra.
    await page.reload();
    await expect(page.getByRole("tab", { name: "Seguindo" })).toHaveAttribute("aria-selected", "true");
    expect((await autores()).filter((u) => !seguidos.has(u))).toEqual([]);
    const outraVisita = await contexto.newPage();
    await outraVisita.goto("/");
    await expect(outraVisita.getByRole("tab", { name: "Seguindo" })).toHaveAttribute("aria-selected", "true");
    await outraVisita.close();

    // Pelo teclado: a seta volta para "Para você".
    await page.getByRole("tab", { name: "Seguindo" }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("tab", { name: "Para você" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: "Para você" })).toBeFocused();
    await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-busy", "false");
    expect((await autores()).some((u) => !seguidos.has(u) && u !== "lia")).toBe(true);
    await contexto.close();
  });

  test("postar é otimista, e volta atrás se o servidor recusar", async ({ browser }) => {
    const contexto = await contextoDe(browser, "lia");
    const page = await contexto.newPage();
    await page.goto("/");
    const campo = page.getByLabel("O que você quer conversar?");

    // Aceito: aparece na hora e o formulário esvazia.
    const bom = `Otimista ${Date.now()}`;
    await campo.fill(bom);
    await page.getByRole("button", { name: "Publicar" }).click();
    await expect(posts(page).first()).toContainText(bom);
    await expect(campo).toHaveValue("");
    await expect(posts(page).first().getByRole("button", { name: "Apagar" })).toBeVisible();

    // Recusado: a cota de posts da hora acabou (15). O post some da lista, o
    // texto volta para o formulário e o motivo aparece.
    const idLia = await idDe("lia");
    sql(`insert into private.rate_limit_events (user_id, action) select '${idLia}', 'post' from generate_series(1, 15);`);
    const ruim = `Não vai passar ${Date.now()}`;
    await campo.fill(ruim);
    await page.getByRole("button", { name: "Publicar" }).click();
    await expect(alerta(page)).toContainText("Limite de 15 posts por hora");
    await expect(campo).toHaveValue(ruim);
    await expect(posts(page).filter({ hasText: ruim })).toHaveCount(0);
    await expect(posts(page).first()).toContainText(bom);
    sql(`delete from private.rate_limit_events where user_id = '${idLia}' and action = 'post';`);
    const { data } = await admin().from("posts").select("id").eq("body", ruim);
    expect(data).toEqual([]);
    await contexto.close();
  });

  test("seguir é otimista, e volta atrás se o servidor recusar", async ({ browser }) => {
    const idLia = await idDe("lia");
    const idBeto = await idDe("beto");
    await admin().from("follows").delete().eq("follower_id", idLia).eq("followee_id", idBeto);
    const contexto = await contextoDe(browser, "lia");
    const page = await contexto.newPage();
    await page.goto("/u/beto");

    // Recusado: a cota de follows do dia acabou (200).
    sql(`insert into private.rate_limit_events (user_id, action) select '${idLia}', 'follow' from generate_series(1, 200);`);
    await page.getByRole("button", { name: "Seguir Beto", exact: true }).click();
    await expect(alerta(page)).toContainText("Limite de 200 follows por dia");
    await expect(page.getByRole("button", { name: "Seguir Beto", exact: true })).toHaveAttribute("aria-pressed", "false");
    expect((await admin().from("follows").select("follower_id").eq("follower_id", idLia).eq("followee_id", idBeto)).data).toEqual([]);
    sql(`delete from private.rate_limit_events where user_id = '${idLia}' and action = 'follow';`);

    // Aceito: muda na hora, e fica.
    await page.getByRole("button", { name: "Seguir Beto", exact: true }).click();
    await expect(page.getByRole("button", { name: "Deixar de seguir Beto" })).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () => (await admin().from("follows").select("follower_id").eq("follower_id", idLia).eq("followee_id", idBeto)).data?.length)
      .toBe(1);
    // Deixar de seguir, também.
    await page.getByRole("button", { name: "Deixar de seguir Beto" }).click();
    await expect(page.getByRole("button", { name: "Seguir Beto", exact: true })).toBeVisible();
    await expect
      .poll(async () => (await admin().from("follows").select("follower_id").eq("follower_id", idLia).eq("followee_id", idBeto)).data?.length)
      .toBe(0);
    await contexto.close();
  });
});

test.describe("Perfil e Gente", () => {
  test("ações principais à vista; o resto num menu acessível por teclado", async ({ browser }) => {
    await tornarMutuos("lia", "caue");
    const contexto = await contextoDe(browser, "lia");
    const page = await contexto.newPage();
    await page.goto("/u/caue");

    // Seguindo e Mensagem são botões; as outras três ações não estão soltas na tela.
    await expect(page.getByRole("button", { name: "Deixar de seguir Cauê" })).toHaveText("Seguindo");
    await expect(page.getByRole("button", { name: "Mensagem", exact: true })).toBeVisible();
    for (const nome of ["Remover dos seus seguidores", "Denunciar", "Bloquear"]) {
      await expect(page.getByRole("banner").getByRole("button", { name: nome, exact: true })).toHaveCount(0);
    }

    // "Vocês se seguem" é um selo de status: não é botão nem tem cara de botão.
    const selo = page.locator(".selo").filter({ hasText: "Vocês se seguem" });
    await expect(selo).toBeVisible();
    const estilo = await selo.evaluate((e) => {
      const c = getComputedStyle(e);
      return { tag: e.tagName, borda: c.borderTopWidth, fundo: c.backgroundColor, cursor: c.cursor, papel: e.getAttribute("role") };
    });
    expect(estilo).toEqual({ tag: "SPAN", borda: "0px", fundo: "rgba(0, 0, 0, 0)", cursor: "auto", papel: null });
    await expect(page.getByRole("button", { name: /Vocês se seguem/ })).toHaveCount(0);

    // O menu, só com o teclado.
    const tresPontos = page.getByRole("button", { name: "Mais ações para Cauê" });
    await expect(tresPontos).toHaveAttribute("aria-haspopup", "menu");
    await expect(tresPontos).toHaveAttribute("aria-expanded", "false");
    await tresPontos.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "Mais ações para Cauê" });
    await expect(menu).toBeVisible();
    await expect(tresPontos).toHaveAttribute("aria-expanded", "true");
    await expect(menu.getByRole("menuitem")).toHaveText(["Remover dos seus seguidores", "Denunciar", "Bloquear"]);
    await expect(menu.getByRole("menuitem", { name: "Remover dos seus seguidores" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "Denunciar" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(menu.getByRole("menuitem", { name: "Bloquear" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "Remover dos seus seguidores" })).toBeFocused();
    // Esc fecha e devolve o foco aos três pontos.
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(tresPontos).toBeFocused();

    // Denunciar abre o diálogo de denúncia.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    const denuncia = page.getByRole("dialog", { name: "Denunciar este perfil" });
    await expect(denuncia).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(denuncia).toBeHidden();

    // Bloquear continua pedindo confirmação.
    await tresPontos.click();
    await menu.getByRole("menuitem", { name: "Bloquear" }).click();
    const confirmar = page.getByRole("dialog", { name: "Bloquear Cauê?" });
    await expect(confirmar).toBeVisible();
    await confirmar.getByRole("button", { name: "Cancelar" }).click();
    await expect(confirmar).toBeHidden();
    await expect(page.getByRole("heading", { level: 1, name: "Cauê" })).toBeVisible();

    // Clicar fora fecha.
    await tresPontos.click();
    await expect(menu).toBeVisible();
    await page.getByRole("heading", { level: 1, name: "Cauê" }).click();
    await expect(menu).toBeHidden();
    await contexto.close();
  });

  test("tag sensível não é gosto: fora do 'em comum', mesmo entre mútuos", async ({ browser }) => {
    // Lia e Cauê são mútuos e os dois marcaram "Bissexual" (seed).
    await tornarMutuos("lia", "caue");
    const contexto = await contextoDe(browser, "lia");
    const page = await contexto.newPage();

    await page.goto("/u/caue");
    const gostos = page.getByRole("region", { name: "Gostos" });
    const sobre = page.getByRole("region", { name: "Sobre" });
    await expect(sobre.getByText("Bissexual")).toBeVisible();
    await expect(sobre.locator(".chip-comum")).toHaveCount(0);
    await expect(sobre.getByText(/em comum/)).toHaveCount(0);
    await expect(gostos.getByText("Bissexual")).toHaveCount(0);
    // A frase conta exatamente os chips em âmbar, e nenhum deles é a tag sensível.
    const n = await gostos.locator(".chip-comum").count();
    expect(n).toBeGreaterThan(0);
    await expect(gostos.getByText(n === 1 ? "Vocês têm 1 gosto em comum" : `Vocês têm ${n} gostos em comum`)).toBeVisible();
    // Cor neutra: a mesma de um gosto qualquer que não é em comum com destaque.
    const cores = await sobre.locator(".chip").first().evaluate((e) => getComputedStyle(e).backgroundColor);
    const ambar = await gostos.locator(".chip-comum").first().evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(cores).not.toBe(ambar);

    // No card de Gente a tag sensível nem aparece.
    await page.goto("/gente");
    const cartao = page.getByRole("article", { name: "Cauê", exact: true });
    await expect(cartao).toBeVisible();
    await expect(cartao.getByText("Bissexual")).toHaveCount(0);
    await expect(cartao.locator(".chip")).toHaveCount(await cartao.locator(".chip-comum").count());
    await expect(page.locator("main").getByText(/Bissexual|Católic|Heterossexual/)).toHaveCount(0);
    await contexto.close();
  });

  test("card de Gente: só o que é em comum, até cinco, e o card inteiro leva ao perfil", async ({ browser }) => {
    const [idLia, idBeto] = [await idDe("lia"), await idDe("beto")];
    await admin().from("follows").delete().eq("follower_id", idLia).eq("followee_id", idBeto);
    // Sete gostos em comum entre a Lia e o Beto (que não tinham nenhum).
    const slugs = ["fps", "moba", "minecraft", "nintendo", "cinema", "series", "poesia"];
    const { data: tags } = await admin().from("tags").select("id").in("slug", slugs);
    const linhas = (tags ?? []).flatMap((t) => [idLia, idBeto].map((user_id) => ({ user_id, tag_id: t.id })));
    await admin().from("profile_tags").upsert(linhas, { onConflict: "user_id,tag_id", ignoreDuplicates: true });

    const contexto = await contextoDe(browser, "lia");
    const page = await contexto.newPage();
    await page.goto("/gente");
    const cartao = page.getByRole("article", { name: "Beto", exact: true });
    await expect(cartao.getByText("Vocês têm 7 gostos em comum")).toBeVisible();
    await expect(cartao.locator(".chip-comum")).toHaveCount(5);
    await expect(cartao.locator(".chip")).toHaveCount(5); // nenhuma tag que não seja em comum
    await expect(cartao.getByTestId("mais-em-comum")).toHaveText("+2 em comum");
    // Os gostos do Beto que a Lia não tem não aparecem no card.
    await expect(cartao.locator(".chip").filter({ hasText: /Futebol|Musculação|Sertanejo|Educação Física/ })).toHaveCount(0);
    await expect(cartao.getByRole("link", { name: "Ver perfil" })).toHaveCount(0);

    // Seguir, dentro do card, não leva a lugar nenhum.
    await cartao.getByRole("button", { name: "Seguir Beto", exact: true }).click();
    await expect(cartao.getByRole("button", { name: "Deixar de seguir Beto" })).toBeVisible();
    await expect(page).toHaveURL(/\/gente$/);
    await cartao.getByRole("button", { name: "Deixar de seguir Beto" }).click();
    await expect(cartao.getByRole("button", { name: "Seguir Beto", exact: true })).toBeVisible();

    // Tocar em qualquer outro ponto do card (aqui, na bio) abre o perfil.
    // (force: o link do card cobre a bio de propósito; o clique cai nele.)
    await cartao.getByText("Futebol no fim de semana").click({ force: true });
    await expect(page).toHaveURL(/\/u\/beto$/);
    await expect(page.getByRole("heading", { level: 1, name: "Beto" })).toBeVisible();

    for (const id of [idLia, idBeto]) await admin().from("profile_tags").delete().eq("user_id", id).in("tag_id", (tags ?? []).map((t) => t.id));
    await contexto.close();
  });

  test("avatar em arco também com foto, em todas as telas", async ({ browser }) => {
    // A Nina ganha uma foto aprovada (o arquivo entra pelo Storage; a
    // aprovação, direto no banco, como a moderação faria).
    const idNina = await idDe("nina");
    const idLia = await idDe("lia");
    const webp = Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA", "base64");
    const caminho = `${idNina}/foto.webp`;
    const envio = await admin().storage.from("avatars").upload(caminho, webp, { contentType: "image/webp", upsert: true });
    expect(envio.error).toBeNull();
    const aprovada = await admin().from("profiles").update({ avatar_path: caminho, avatar_status: "aprovado" }).eq("id", idNina);
    expect(aprovada.error).toBeNull();
    await tornarMutuos("lia", "nina");
    const { data: perfil } = await admin().from("profiles").select("institution_id").eq("id", idNina).single();
    await admin().from("posts").insert({ author_id: idNina, institution_id: perfil!.institution_id, body: "Post da Nina com foto" });
    const { data: conversa } = await admin()
      .from("conversations")
      .upsert(
        { institution_id: perfil!.institution_id, user_a: idLia < idNina ? idLia : idNina, user_b: idLia < idNina ? idNina : idLia },
        { onConflict: "user_a,user_b" },
      )
      .select("id")
      .single();

    const contexto = await contextoDe(browser, "lia");
    const page = await contexto.newPage();
    const telas = ["/u/nina", "/gente", "/", "/mensagens", `/mensagens/${conversa!.id}`];
    for (const tela of telas) {
      await page.goto(tela);
      const foto = page.getByAltText("Foto de Nina").first();
      await expect(foto, tela).toBeVisible();
      const forma = await foto.evaluate((img) => {
        const c = getComputedStyle(img);
        const r = img.getBoundingClientRect();
        return { cima: c.borderTopLeftRadius, baixo: c.borderBottomLeftRadius, proporcao: Math.round((r.height / r.width) * 100) / 100 };
      });
      // Meia-volta em cima, base reta, e mais alta do que larga: o arco.
      expect(forma, tela).toEqual({ cima: "50% 40%", baixo: "0px", proporcao: 1.25 });
    }
    // A foto e o avatar pronto têm a mesma forma: o topo do arco fica fora da imagem.
    await page.goto("/u/nina");
    const canto = await page.getByAltText("Foto de Nina").first().evaluate((img) => {
      const r = img.getBoundingClientRect();
      return document.elementFromPoint(r.left + 1, r.top + 1) !== img;
    });
    expect(canto, "o canto de cima da foto é recortado").toBe(true);

    await admin().storage.from("avatars").remove([caminho]);
    await contexto.close();
  });

  test("GIF tem altura máxima no celular", async ({ browser }) => {
    const idCaue = await idDe("caue");
    const { data: perfil } = await admin().from("profiles").select("institution_id").eq("id", idCaue).single();
    await admin().from("posts").insert({ author_id: idCaue, institution_id: perfil!.institution_id, body: "GIF em pé", gif_id: "e2eGifEmPe", gif_alt: "GIF muito alto" });
    const contexto = await contextoDe(browser, "lia");
    const page = await contexto.newPage();
    // Um GIF em pé, 300 x 1600: sem limite, ocuparia mais do que a tela.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="1600"><rect width="300" height="1600" fill="#1e5a66"/></svg>`;
    // A imagem demora a chegar: dá para medir a moldura ANTES e DEPOIS do GIF.
    let liberar = () => {};
    const chegou = new Promise<void>((r) => (liberar = r));
    await page.route(/giphy\.com\//, async (rota) => {
      await chegou;
      await rota.fulfill({ contentType: "image/svg+xml", body: svg });
    });
    await page.goto("/u/caue");
    const gif = page.getByAltText("GIF: GIF muito alto");
    await gif.scrollIntoViewIfNeeded();
    const medir = () =>
      gif.evaluate((img: HTMLImageElement) => {
        const r = img.getBoundingClientRect();
        return { altura: Math.round(r.height), largura: Math.round(r.width), topo: Math.round(r.top + window.scrollY), tela: window.innerHeight };
      });
    const antes = await medir();
    liberar();
    await expect.poll(async () => gif.evaluate((img: HTMLImageElement) => img.naturalHeight)).toBe(1600);
    const depois = await medir();
    expect(depois.altura).toBeLessThanOrEqual(depois.tela * 0.45 + 1);
    expect(depois.altura).toBeLessThanOrEqual(320);
    // A moldura já tinha esse tamanho antes de o GIF chegar: nada abaixo pula.
    expect(depois).toEqual(antes);
    // Sem distorcer nem cortar: o GIF se encaixa inteiro na moldura.
    expect(await gif.evaluate((img) => getComputedStyle(img).objectFit)).toBe("contain");
    await contexto.close();
  });
});

test.describe("Layout responsivo", () => {
  const TELAS = ["/", "/gente", "/u/caue", "/mensagens", "/notificacoes", "/voce", "/conquistas", "/config"];

  for (const largura of [375, 768, 1440]) {
    test(`${largura}px: navegação, coluna de leitura e nada cortado`, async ({ browser }) => {
      mkdirSync(VISUAL, { recursive: true });
      const contexto =
        largura === 375
          ? await contextoDe(browser, "lia")
          : await desktopDaLia(browser, largura);
      const page = await contexto.newPage();
      if (largura === 375) await page.setViewportSize({ width: 375, height: 812 });

      for (const tela of TELAS) {
        await page.goto(tela);
        await expect(page.locator("main h1").first()).toBeVisible();
        const nav = page.getByRole("navigation", { name: "Principal" });
        const m = await page.evaluate(() => {
          const caixa = (s: string) => document.querySelector(s)?.getBoundingClientRect();
          const n = caixa('nav[aria-label="Principal"]')!;
          const c = caixa("main")!;
          return {
            nav: { x: n.x, y: n.y, w: n.width, h: n.height },
            main: { x: c.x, w: c.width },
            rolagemLateral: document.documentElement.scrollWidth > window.innerWidth,
            alto: window.innerHeight,
            largo: window.innerWidth,
          };
        });
        expect(m.rolagemLateral, `${tela}: sem rolagem lateral`).toBe(false);
        // Coluna central com largura de leitura confortável, em qualquer tela.
        expect(m.main.w, `${tela}: largura da coluna`).toBeLessThanOrEqual(576);

        if (largura === 375) {
          // Celular: abas embaixo, de ponta a ponta, como sempre.
          expect(m.nav.w).toBe(375);
          expect(m.nav.y + m.nav.h).toBeCloseTo(m.alto, 0);
          expect(m.nav.h).toBeLessThan(100);
          await expect(page.getByRole("complementary", { name: "Sugestões" })).toBeHidden();
        } else {
          // Tablet e desktop: barra lateral, da altura da tela, e o conteúdo ao lado dela.
          expect(m.nav.x).toBe(0);
          expect(m.nav.y).toBe(0);
          expect(m.nav.h).toBe(m.alto);
          expect(m.nav.w).toBeLessThan(largura / 3);
          expect(m.main.x).toBeGreaterThanOrEqual(m.nav.w);
          for (const aba of ["Início", "Gente", "Mensagens", "Notificações", "Você"]) await expect(nav.getByRole("link", { name: new RegExp(`^${aba}`) })).toBeVisible();
        }

        const sugestoes = page.getByRole("complementary", { name: "Sugestões" });
        if (largura === 1440) {
          // Desktop largo: coluna da direita com gente parecida (menos em Gente, que já é a lista).
          await expect(sugestoes).toBeVisible();
          if (tela !== "/gente") {
            // "Recém-chegados" quando a Lia já segue todo mundo parecido (e2e/19).
            await expect(sugestoes.getByRole("heading", { name: /^(Gente parecida com você|Recém-chegados)$/ })).toBeVisible();
            const s = (await sugestoes.boundingBox())!;
            expect(s.x).toBeGreaterThanOrEqual(m.main.x + m.main.w);
          }
        } else {
          await expect(sugestoes).toBeHidden();
        }
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(VISUAL, `${largura}-${tela === "/" ? "inicio" : tela.replace(/\//g, "_").slice(1)}.png`) });
      }
      await contexto.close();
    });
  }

  // Um controle que muda de lugar depois de aparecer é um toque que cai no
  // lugar errado (e foi a causa de testes instáveis: o clique mirava onde o
  // botão ESTAVA). Com o processador lento, para o que carrega depois ter
  // tempo de aparecer, nenhum botão, link ou campo pode sair de onde surgiu.
  test("nada clicável muda de lugar depois de aparecer", async ({ browser }) => {
    test.setTimeout(180_000);
    const contexto = await contextoDe(browser, "lia");
    const andaram: string[] = [];
    for (const tela of TELAS) {
      const page = await contexto.newPage();
      const cdp = await contexto.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await page.addInitScript(() => {
        const primeira = new WeakMap<Element, number>();
        const movidos = new Map<Element, { de: number; para: number }>();
        (window as unknown as { __movidos: typeof movidos }).__movidos = movidos;
        const olhar = () => {
          // Só o conteúdo de verdade: o esqueleto é trocado inteiro, de propósito.
          if (!document.querySelector("[data-esqueleto]")) {
            for (const e of document.querySelectorAll("main button, main a, main input, main textarea, main select, main summary")) {
              const q = e.getBoundingClientRect();
              if (q.width === 0 && q.height === 0) continue;
              const y = Math.round(q.top + window.scrollY);
              const antes = primeira.get(e);
              if (antes === undefined) primeira.set(e, y);
              else if (Math.abs(antes - y) > 1) movidos.set(e, { de: antes, para: y });
            }
          }
          requestAnimationFrame(olhar);
        };
        requestAnimationFrame(olhar);
      });
      await page.goto(tela);
      await expect(page.locator("main h1").first()).toBeVisible();
      await expect(page.locator("[data-esqueleto]")).toHaveCount(0);
      await page.waitForTimeout(3500);
      const lista = await page.evaluate(() =>
        [...(window as unknown as { __movidos: Map<Element, { de: number; para: number }> }).__movidos].map(
          ([e, m]) => `${e.tagName.toLowerCase()} "${(e.getAttribute("aria-label") ?? e.textContent ?? "").trim().slice(0, 40)}" ${m.de} → ${m.para}`,
        ),
      );
      andaram.push(...lista.map((l) => `${tela}: ${l}`));
      await page.close();
    }
    expect(andaram, "controles que mudaram de lugar depois de aparecer").toEqual([]);
    await contexto.close();
  });

  test("as sugestões só são pedidas ao servidor quando a coluna existe", async ({ browser }) => {
    const pedidas = (page: Page) => {
      const corpos: string[] = [];
      page.on("request", (r) => {
        if (r.method() === "POST" && r.headers()["next-action"]) corpos.push(r.url());
      });
      return corpos;
    };
    const celular = await contextoDe(browser, "lia");
    const p1 = await celular.newPage();
    const noCelular = pedidas(p1);
    await p1.goto("/voce");
    await expect(p1.locator("main h1")).toBeVisible();
    await p1.waitForTimeout(1200);
    await celular.close();

    const desktop = await desktopDaLia(browser, 1440);
    const p2 = await desktop.newPage();
    const noDesktop = pedidas(p2);
    await p2.goto("/voce");
    await expect(p2.getByRole("complementary", { name: "Sugestões" }).getByRole("link", { name: "Ver todo mundo" })).toBeVisible();
    await p2.waitForTimeout(1200);
    await desktop.close();
    // No desktop há uma ação a mais (a das sugestões); no celular, não.
    expect(noDesktop.length).toBeGreaterThan(noCelular.length);
  });

  test("hover em tudo que é clicável (com ponteiro de verdade)", async ({ browser }) => {
    const contexto = await desktopDaLia(browser, 1440);
    const page = await contexto.newPage();
    await page.goto("/u/caue");
    await expect(page.getByRole("heading", { level: 1, name: "Cauê" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Sugestões" }).getByRole("link", { name: "Ver todo mundo" })).toBeVisible();

    /** Passa o ponteiro por cima e diz se alguma coisa mudou no desenho do elemento. */
    async function mudaNoHover(alvo: ReturnType<Page["locator"]>, oQue: string) {
      const ler = () =>
        alvo.evaluate((e) => {
          const c = getComputedStyle(e);
          return [c.backgroundColor, c.color, c.borderTopColor, c.textDecorationLine].join("|");
        });
      await page.mouse.move(0, 0);
      await page.waitForTimeout(250);
      const antes = await ler();
      await alvo.hover();
      await page.waitForTimeout(250);
      expect(await ler(), `${oQue} muda no hover`).not.toBe(antes);
    }

    const nav = page.getByRole("navigation", { name: "Principal" });
    await mudaNoHover(nav.getByRole("link", { name: /^Mensagens/ }), "aba da navegação");
    await mudaNoHover(page.getByRole("button", { name: "Deixar de seguir Cauê" }), "botão secundário (Seguindo)");
    await mudaNoHover(page.getByRole("button", { name: "Mais ações para Cauê" }), "botão do menu");
    await page.getByRole("button", { name: "Mais ações para Cauê" }).click();
    await mudaNoHover(page.getByRole("menuitem", { name: "Denunciar" }), "item do menu");
    await page.keyboard.press("Escape");
    await mudaNoHover(page.getByRole("complementary", { name: "Sugestões" }).getByRole("link", { name: "Ver todo mundo" }), "link das sugestões");

    await page.goto("/");
    await mudaNoHover(page.getByRole("tab", { name: "Seguindo" }), "aba do feed");
    await page.getByLabel("O que você quer conversar?").fill("x");
    await mudaNoHover(page.getByRole("button", { name: "Publicar" }), "botão principal");
    await mudaNoHover(page.getByRole("button", { name: "GIF", exact: true }), "botão discreto");
    await mudaNoHover(posts(page).first().getByRole("link").first(), "nome do autor no post");

    await page.goto("/gente");
    await mudaNoHover(page.getByRole("article").first(), "card de Gente");
    await page.goto("/voce");
    await mudaNoHover(page.getByRole("link", { name: /Configurações/ }), "item da lista em Você");
    await contexto.close();
  });

  test("acessibilidade (axe) nas telas mexidas, nos dois temas, no celular e no desktop", async ({ browser }) => {
    test.setTimeout(240_000);
    const achados: AchadoAxe[] = [];
    for (const tema of ["light", "dark"] as const) {
      for (const onde of ["celular", "desktop"] as const) {
        const contexto = onde === "celular" ? await contextoDe(browser, "lia", { colorScheme: tema }) : await desktopDaLia(browser, 1440, tema);
        const page = await contexto.newPage();
        for (const tela of ["/", "/gente", "/u/caue", "/mensagens", "/notificacoes", "/conquistas", "/voce"]) {
          await page.goto(tela);
          await expect(page.locator("main h1").first()).toBeVisible();
          if (onde === "desktop" && tela !== "/gente") {
            await expect(page.getByRole("complementary", { name: "Sugestões" }).getByRole("link", { name: "Ver todo mundo" })).toBeVisible();
            await expect(page.getByRole("complementary", { name: "Sugestões" }).locator(".osso")).toHaveCount(0);
          }
          await examinarAxe(page, `${tela} (${onde}, ${tema})`, achados);
        }
        // A aba Seguindo e o menu de mais ações abertos.
        await page.goto("/");
        await page.getByRole("tab", { name: "Seguindo" }).click();
        await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-busy", "false");
        await examinarAxe(page, `/ aba Seguindo (${onde}, ${tema})`, achados);
        await page.getByRole("tab", { name: "Para você" }).click();
        await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-busy", "false");
        await page.goto("/u/caue");
        await page.getByRole("button", { name: "Mais ações para Cauê" }).click();
        await expect(page.getByRole("menu")).toBeVisible();
        await examinarAxe(page, `/u/caue com o menu aberto (${onde}, ${tema})`, achados);
        await contexto.close();
      }
    }
    expect(achados, "violações sérias ou críticas do axe").toEqual([]);
  });
});
