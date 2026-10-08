import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, clientePorApi, contextoDe, emailDe, examinarAxe, idDe, type AchadoAxe } from "./apoio";

// Seguir a partir de um post: o Beto segue a Nina por um post dela, e só a
// Nina fica sabendo de qual. A Lia olha de fora.
test.describe.configure({ mode: "serial" });

const marca = Date.now();
const LONGO = `Alguém topa montar uma mesa de RPG na quinta ${marca}? Nunca joguei e queria muito aprender com gente paciente.`;
const TRECHO = `${LONGO.slice(0, 80).trimEnd()}…`;
const OUTRO = `Segundo post da Nina ${marca}`;

test.describe("Seguir pelo post", () => {
  let doBeto: BrowserContext;
  let daNina: BrowserContext;
  let beto: Page;
  let nina: Page;
  let idBeto = "";
  let idNina = "";
  let idIris = "";
  let postLongo = "";
  let postDaLia = "";
  let betoPorApi: SupabaseClient;

  const post = (page: Page, texto: string) => page.getByRole("list", { name: "Posts" }).getByRole("article").filter({ hasText: texto });
  const notificacoes = (page: Page) => page.getByRole("list", { name: "Suas notificações" }).locator('li[data-tipo="novo_seguidor"]');

  async function origem(de: string, para: string): Promise<string | null | undefined> {
    const { data, error } = await admin().from("follows").select("via_post_id").eq("follower_id", de).eq("followee_id", para);
    if (error) throw error;
    return data?.[0]?.via_post_id as string | null | undefined;
  }

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    [idBeto, idNina, idIris] = await Promise.all([idDe("beto"), idDe("nina"), idDe("iris")]);
    const idLia = await idDe("lia");
    const db = admin();
    // Ponto de partida conhecido entre o Beto e as duas.
    for (const outro of [idNina, idIris]) {
      for (const [a, b] of [
        [idBeto, outro],
        [outro, idBeto],
      ]) {
        await db.from("blocks").delete().eq("blocker_id", a).eq("blocked_id", b);
        await db.from("follows").delete().eq("follower_id", a).eq("followee_id", b);
        await db.from("notifications").delete().eq("user_id", a).eq("actor_id", b);
      }
    }
    const { data: perfil } = await db.from("profiles").select("institution_id").eq("id", idNina).single();
    const inst = perfil!.institution_id as string;
    const criar = async (autor: string, corpo: string, haMinutos: number) => {
      const r = await db
        .from("posts")
        .insert({ author_id: autor, institution_id: inst, body: corpo, created_at: new Date(Date.now() - haMinutos * 60_000).toISOString() })
        .select("id")
        .single();
      expect(r.error).toBeNull();
      return r.data!.id as string;
    };
    await criar(idNina, OUTRO, 2);
    postLongo = await criar(idNina, LONGO, 1);
    postDaLia = await criar(idLia, `Post da Lia ${marca}`, 3);

    doBeto = await contextoDe(browser, "beto");
    daNina = await contextoDe(browser, "nina");
    beto = await doBeto.newPage();
    nina = await daNina.newPage();
    await new Promise((r) => setTimeout(r, 1500)); // um código por segundo para o mesmo e-mail
    betoPorApi = await clientePorApi(emailDe("beto"));
  });

  test.afterAll(async () => {
    await doBeto?.close();
    await daNina?.close();
  });

  test("seguir pelo perfil não registra post nenhum", async () => {
    await beto.goto("/u/iris");
    await beto.getByRole("button", { name: "Seguir Íris" }).click();
    await expect(beto.getByRole("button", { name: "Deixar de seguir Íris" })).toBeVisible();
    await expect.poll(() => origem(idBeto, idIris)).toBeNull();
  });

  test("o post de quem a pessoa não segue tem Seguir, e seguir por ali guarda o post", async () => {
    await beto.goto("/");
    await beto.getByRole("tab", { name: "Para você" }).click();
    await expect(post(beto, LONGO)).toBeVisible();
    await expect(post(beto, OUTRO).getByRole("button", { name: "Seguir Nina" })).toBeVisible();

    await post(beto, LONGO).getByRole("button", { name: "Seguir Nina" }).click();
    await expect(post(beto, LONGO).getByRole("button", { name: "Deixar de seguir Nina" })).toBeVisible();
    await expect.poll(() => origem(idBeto, idNina)).toBe(postLongo);

    // No outro post da Nina o botão some: ela já é seguida.
    await expect(post(beto, OUTRO).getByRole("button", { name: /seguir Nina/i })).toHaveCount(0);
    // Nada na tela conta nem mostra de onde veio o follow.
    await expect(beto.getByText(/pelo (seu )?post/i)).toHaveCount(0);

    // Recarregando, os posts de quem já é seguido não oferecem Seguir.
    await beto.reload();
    await expect(post(beto, LONGO)).toBeVisible();
    await expect(post(beto, LONGO).getByRole("button", { name: /seguir Nina/i })).toHaveCount(0);
    await beto.getByRole("tab", { name: "Seguindo" }).click();
    await expect(post(beto, LONGO)).toBeVisible();
    await expect(beto.getByRole("list", { name: "Posts" }).getByRole("button", { name: /^Seguir / })).toHaveCount(0);
  });

  test("a Nina lê 'te seguiu pelo seu post', com o trecho", async () => {
    await nina.goto("/notificacoes");
    const linha = notificacoes(nina).filter({ hasText: "Beto" });
    await expect(linha).toHaveCount(1);
    await expect(linha).toContainText(`Beto te seguiu pelo seu post: ${TRECHO}`);
    await expect(linha).not.toContainText("aprender com gente paciente");
    await expect(linha.getByRole("link", { name: "Beto" })).toHaveAttribute("href", "/u/beto");

    const achados: AchadoAxe[] = [];
    for (const tema of ["light", "dark"] as const) {
      await nina.emulateMedia({ colorScheme: tema });
      await examinarAxe(nina, `notificação de seguir pelo post (${tema})`, achados);
    }
    await nina.emulateMedia({ colorScheme: "light" });
    expect(achados).toEqual([]);
  });

  test("só a Nina vê: nem o Beto, nem ela mesma, nem ninguém lê a origem pela API", async () => {
    await beto.goto("/notificacoes");
    await expect(beto.getByRole("heading", { level: 1, name: "Notificações" })).toBeVisible();
    await expect(beto.locator("main").getByText(/pelo seu post/)).toHaveCount(0);
    await beto.goto("/u/nina");
    await expect(beto.getByRole("heading", { level: 1, name: "Nina" })).toBeVisible();
    await expect(beto.locator("main").getByText(/seguiu pelo|pelo seu post|seguidores? por/i)).toHaveCount(0);

    const ninaPorApi = await clientePorApi(emailDe("nina"));
    const liaPorApi = await clientePorApi(emailDe("lia"));
    for (const api of [betoPorApi, ninaPorApi, liaPorApi]) {
      const coluna = await api.from("follows").select("via_post_id");
      expect(coluna.error?.code).toBe("42501");
      const tudo = await api.from("follows").select("*");
      expect(tudo.error?.code).toBe("42501");
      const contagem = await api.from("follows").select("follower_id", { count: "exact", head: true }).eq("via_post_id", postLongo);
      expect(contagem.error).not.toBeNull();
    }
    // A Lia não vê nem o follow nem a notificação.
    const follow = await liaPorApi.from("follows").select("follower_id").eq("follower_id", idBeto).eq("followee_id", idNina);
    expect(follow.data).toEqual([]);
    const aviso = await liaPorApi.from("notifications").select("id").eq("user_id", idNina);
    expect(aviso.data).toEqual([]);
    const { data: daLia } = await liaPorApi.rpc("minhas_notificacoes");
    expect(JSON.stringify(daLia ?? [])).not.toContain(String(marca));
  });

  test("a origem não se forja pela API", async () => {
    const deixar = await betoPorApi.from("follows").delete().eq("follower_id", idBeto).eq("followee_id", idNina);
    expect(deixar.error).toBeNull();

    // Seguir a Nina dizendo que veio de um post da Lia.
    const forjado = await betoPorApi.from("follows").insert({ followee_id: idNina, via_post_id: postDaLia });
    expect(forjado.error?.code).toBe("PT422");
    // Um post que não existe: a mesma recusa.
    const inexistente = await betoPorApi.from("follows").insert({ followee_id: idNina, via_post_id: crypto.randomUUID() });
    expect(inexistente.error?.code).toBe("PT422");
    expect(inexistente.error?.message).toBe(forjado.error?.message);
    // Em nome de outra pessoa.
    const emNomeDe = await betoPorApi.from("follows").insert({ follower_id: idIris, followee_id: idNina, via_post_id: postLongo });
    expect(emNomeDe.error?.code).toBe("42501");
    // Trocar a origem depois.
    expect(await origem(idBeto, idNina)).toBeUndefined();

    // O caminho honesto continua funcionando.
    const honesto = await betoPorApi.from("follows").insert({ followee_id: idNina, via_post_id: postLongo });
    expect(honesto.error).toBeNull();
    expect(await origem(idBeto, idNina)).toBe(postLongo);
    const trocar = await betoPorApi.from("follows").update({ via_post_id: null }).eq("follower_id", idBeto).eq("followee_id", idNina);
    expect(trocar.error?.code).toBe("42501");
  });

  test("post apagado: a notificação fica, sem o trecho", async () => {
    const apagado = await admin().from("posts").update({ deleted_at: new Date().toISOString() }).eq("id", postLongo);
    expect(apagado.error).toBeNull();
    await nina.goto("/notificacoes");
    const linha = notificacoes(nina).filter({ hasText: "Beto" });
    await expect(linha).toHaveCount(1);
    await expect(linha).not.toContainText("pelo seu post");
    await expect(linha).not.toContainText("mesa de RPG");
    await expect(nina.locator("main").getByText(String(marca))).toHaveCount(0);
  });

  test("bloqueio apaga a notificação", async () => {
    const restaurado = await admin().from("posts").update({ deleted_at: null }).eq("id", postLongo);
    expect(restaurado.error).toBeNull();
    await nina.goto("/notificacoes");
    await expect(notificacoes(nina).filter({ hasText: "Beto te seguiu pelo seu post" })).toHaveCount(1);

    const bloqueio = await admin().from("blocks").insert({ blocker_id: idNina, blocked_id: idBeto });
    expect(bloqueio.error).toBeNull();
    await nina.goto("/notificacoes");
    await expect(nina.getByRole("heading", { level: 1, name: "Notificações" })).toBeVisible();
    await expect(nina.locator("main").getByText("Beto")).toHaveCount(0);
    const { data } = await admin().from("notifications").select("id").eq("user_id", idNina).eq("actor_id", idBeto);
    expect(data).toEqual([]);
    await admin().from("blocks").delete().eq("blocker_id", idNina).eq("blocked_id", idBeto);
  });
});
