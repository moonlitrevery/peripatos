import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, clientePorApi, contextoDe, emailDe, examinarAxe, idDe, type AchadoAxe, type Alias } from "./apoio";

// Eventos, com três pessoas: a Lia organiza, o Cauê participa e o Beto fica de
// fora. O que cada um enxerga é decidido no banco (230_eventos.sql); aqui a
// prova é pela tela e, onde importa, também falando direto com a API.
test.describe.configure({ mode: "serial" });

const marca = Date.now();
const ABERTO = `Feira do livro ${marca}`;
const COM_APROVACAO = `Mesa de RPG ${marca}`;
const ONLINE = `Sessão online ${marca}`;
const LOCAL_EXATO = `Praça da Sé, banca ${marca}`;
const SALA = `Sala ${marca} do bloco C`;
const TIPOS_DE_EVENTO = ["evento_pedido", "evento_aceito", "evento_alterado", "evento_cancelado", "evento_lembrete"];
const LINK = `https://meet.example.com/sala-${marca}`;

/** Daqui a tantos dias, às 19:00, no formato do campo de data (horário de Brasília). */
function daquiA(dias: number, hora = "19:00"): string {
  const d = new Date(Date.now() + dias * 86_400_000 - 3 * 3_600_000);
  return `${d.toISOString().slice(0, 10)}T${hora}`;
}

async function participacao(eventoId: string, userId: string): Promise<string | undefined> {
  const { data, error } = await admin().from("event_participants").select("status").eq("event_id", eventoId).eq("user_id", userId);
  if (error) throw error;
  return data?.[0]?.status as string | undefined;
}

test.describe("Eventos", () => {
  let daLia: BrowserContext;
  let doCaue: BrowserContext;
  let doBeto: BrowserContext;
  let lia: Page;
  let caue: Page;
  let beto: Page;
  const id: Partial<Record<Alias, string>> = {};
  const evento = { aberto: "", aprovacao: "", online: "" };
  let cauePorApi: SupabaseClient;
  let betoPorApi: SupabaseClient;
  const achados: AchadoAxe[] = [];

  /** axe na tela atual, nos dois temas. */
  async function axe(page: Page, tela: string) {
    for (const tema of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: tema });
      await examinarAxe(page, `${tela} (${tema})`, achados);
    }
    await page.emulateMedia({ colorScheme: "light" });
  }

  async function criar(page: Page, campos: { titulo: string; preencher: () => Promise<void> }): Promise<string> {
    await page.goto("/eventos");
    await page.getByRole("link", { name: "Criar evento" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Criar evento" })).toBeVisible();
    // O que é digitado antes de a página hidratar se perde: repete até o campo segurar o valor.
    await expect(async () => {
      await page.getByLabel("Título").fill(campos.titulo);
      await page.getByLabel("Online").check({ timeout: 1000 });
      await expect(page.getByLabel("Link do evento")).toBeVisible({ timeout: 1000 });
    }).toPass();
    await page.getByLabel("Presencial").check();
    await page.getByLabel("Título").fill(campos.titulo);
    await campos.preencher();
    await page.getByRole("button", { name: "Criar evento" }).click();
    await expect(page).toHaveURL(/\/eventos\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: campos.titulo })).toBeVisible();
    return new URL(page.url()).pathname.split("/").pop()!;
  }

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    for (const a of ["lia", "caue", "beto"] as const) id[a] = await idDe(a);
    const db = admin();
    // Ponto de partida: sem bloqueio entre os três, e a Lia sem seguir o Cauê
    // (para o "seguir de volta" ter o que oferecer).
    for (const a of [id.lia!, id.caue!, id.beto!]) {
      for (const b of [id.lia!, id.caue!, id.beto!]) await db.from("blocks").delete().eq("blocker_id", a).eq("blocked_id", b);
    }
    await db.from("follows").delete().eq("follower_id", id.lia!).eq("followee_id", id.caue!);
    await db.from("notifications").delete().in("user_id", [id.lia!, id.caue!, id.beto!]).in("type", TIPOS_DE_EVENTO);

    daLia = await contextoDe(browser, "lia");
    doCaue = await contextoDe(browser, "caue");
    doBeto = await contextoDe(browser, "beto");
    lia = await daLia.newPage();
    caue = await doCaue.newPage();
    beto = await doBeto.newPage();
    await new Promise((r) => setTimeout(r, 1500)); // um código por segundo para o mesmo e-mail
    cauePorApi = await clientePorApi(emailDe("caue"));
    betoPorApi = await clientePorApi(emailDe("beto"));
  });

  test.afterAll(async () => {
    await daLia?.close();
    await doCaue?.close();
    await doBeto?.close();
  });

  test("no celular, Eventos mora dentro de Gente; a barra de baixo continua com cinco itens", async () => {
    await caue.goto("/gente");
    const barra = caue.getByRole("navigation", { name: "Principal" });
    await expect(barra.getByRole("link")).toHaveText([/Início/, /Gente/, /Mensagens/, /Notificações/, /Você/]);
    const abas = caue.getByRole("navigation", { name: "Pessoas e eventos" });
    await expect(abas.getByRole("link", { name: "Pessoas" })).toHaveAttribute("aria-current", "page");
    await abas.getByRole("link", { name: "Eventos" }).click();
    await expect(caue).toHaveURL(/\/eventos$/);
    await expect(caue.getByRole("heading", { level: 1, name: "Eventos" })).toBeVisible();
    await expect(caue.getByRole("navigation", { name: "Pessoas e eventos" }).getByRole("link", { name: "Eventos" })).toHaveAttribute("aria-current", "page");
    await expect(barra.getByRole("link")).toHaveCount(5);
  });

  test("no desktop, Eventos é um item da barra lateral", async ({ browser }: { browser: Browser }) => {
    const estado = await doCaue.storageState();
    const desktop = await browser.newContext({ storageState: estado, viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
    const p = await desktop.newPage();
    await p.goto("/");
    const lateral = p.getByRole("navigation", { name: "Principal" });
    await lateral.getByRole("link", { name: /^Eventos/ }).click();
    await expect(p).toHaveURL(/\/eventos$/);
    await expect(lateral.getByRole("link", { name: /^Eventos/ })).toHaveAttribute("aria-current", "page");
    await expect(lateral.getByRole("link", { name: /^Gente/ })).not.toHaveAttribute("aria-current", "page");
    await expect(p.getByRole("navigation", { name: "Pessoas e eventos" })).toBeHidden();
    await desktop.close();
  });

  test("criar um evento aberto, presencial, com vagas", async () => {
    await lia.goto("/eventos/novo");
    await expect(lia.getByRole("heading", { level: 1, name: "Criar evento" })).toBeVisible();
    await axe(lia, "/eventos/novo");

    evento.aberto = await criar(lia, {
      titulo: ABERTO,
      preencher: async () => {
        await lia.getByLabel(/^Descrição/).fill("Vamos juntos na feira, cada um paga o seu.");
        await lia.getByLabel("Começa em").fill(daquiA(7));
        await lia.getByLabel(/^Termina em/).fill(daquiA(7, "22:00"));
        await lia.getByLabel("Local geral").fill("no centro");
        await lia.getByLabel(/^Local exato/).fill(LOCAL_EXATO);
        await lia.getByLabel(/^Vagas/).fill("2");
      },
    });
    // Quem organiza vê tudo.
    await expect(lia.getByText("Organizado por você")).toBeVisible();
    await expect(lia.getByText(/das 19:00 às 22:00/)).toBeVisible();
    await expect(lia.getByTestId("local-exato")).toHaveText(LOCAL_EXATO);
    await expect(lia.getByTestId("vagas")).toHaveText("2 de 2 vagas");
    await expect(lia.getByRole("heading", { level: 2, name: "Quem vai (0)" })).toBeVisible();

    const { data } = await admin().from("events").select("organizer_id, kind, capacity, general_location").eq("id", evento.aberto).single();
    expect(data).toEqual({ organizer_id: id.lia, kind: "aberto", capacity: 2, general_location: "no centro" });
  });

  test("quem não confirmou vê o evento, o local geral e as vagas, e nada sobre quem vai nem o local exato", async () => {
    await caue.goto("/eventos");
    const cartao = caue.getByRole("list", { name: "Próximos eventos" }).getByRole("article", { name: ABERTO });
    await expect(cartao).toContainText("Presencial · no centro");
    await expect(cartao).toContainText("Aberto");
    await expect(cartao).toContainText("2 de 2 vagas");
    await expect(caue.locator("main")).not.toContainText(LOCAL_EXATO);
    await axe(caue, "/eventos");

    await cartao.getByRole("link", { name: ABERTO }).click();
    await expect(caue.getByRole("heading", { level: 1, name: ABERTO })).toBeVisible();
    await expect(caue.getByTestId("local-exato")).toHaveText("Aparece para quem confirmar presença.");
    await expect(caue.locator("main")).not.toContainText(LOCAL_EXATO);
    await expect(caue.getByRole("heading", { level: 2, name: /^Quem vai/ })).toHaveCount(0);
    await expect(caue.getByRole("heading", { level: 2, name: /^Pedidos/ })).toHaveCount(0);

    // Pela API também: nem local exato, nem a lista.
    const pelaRpc = await cauePorApi.rpc("evento", { p_evento: evento.aberto });
    expect(pelaRpc.data?.[0]?.local_exato).toBeNull();
    expect((await cauePorApi.from("event_details").select("exact_location").eq("event_id", evento.aberto)).data).toEqual([]);
    expect((await cauePorApi.from("event_participants").select("user_id").eq("event_id", evento.aberto)).data).toEqual([]);
  });

  test("confirmar presença num evento aberto: o local exato aparece e a vaga é contada", async () => {
    await caue.getByRole("button", { name: "Eu vou" }).click();
    await expect(caue.getByText("Você vai.")).toBeVisible();
    await expect(caue.getByTestId("local-exato")).toHaveText(LOCAL_EXATO);
    await expect(caue.getByTestId("vagas")).toHaveText("1 de 2 vagas");
    const quemVai = caue.getByRole("list", { name: "Quem vai" });
    await expect(quemVai.getByRole("listitem")).toHaveCount(1);
    await expect(quemVai).toContainText("Você");
    expect(await participacao(evento.aberto, id.caue!)).toBe("confirmado");
    await axe(caue, "evento, confirmado");

    // A Lia vê o Cauê na lista; o Beto, que não confirmou, não vê ninguém.
    await lia.reload();
    await expect(lia.getByRole("list", { name: "Quem vai" })).toContainText("Cauê");
    await beto.goto(`/eventos/${evento.aberto}`);
    await expect(beto.getByTestId("vagas")).toHaveText("1 de 2 vagas");
    await expect(beto.locator("main")).not.toContainText("Cauê");
    expect((await betoPorApi.from("event_participants").select("user_id").eq("event_id", evento.aberto)).data).toEqual([]);

    // Em "Meus eventos" de quem vai.
    await caue.goto("/eventos/meus");
    const meu = caue.getByRole("list", { name: "Meus próximos eventos" }).getByRole("article", { name: ABERTO });
    await expect(meu.getByTestId("status-do-evento")).toHaveText("Você vai");
    await axe(caue, "/eventos/meus");

    // Desistir devolve a vaga e esconde o local de novo.
    await caue.goto(`/eventos/${evento.aberto}`);
    await caue.getByRole("button", { name: "Desistir" }).click();
    await expect(caue.getByRole("button", { name: "Eu vou" })).toBeVisible();
    await expect(caue.getByTestId("local-exato")).toHaveText("Aparece para quem confirmar presença.");
    await expect(caue.getByTestId("vagas")).toHaveText("2 de 2 vagas");
    expect(await participacao(evento.aberto, id.caue!)).toBeUndefined();
  });

  test("evento com aprovação: pedir, aceitar, e o local exato aparece para quem foi aceito", async () => {
    evento.aprovacao = await criar(lia, {
      titulo: COM_APROVACAO,
      preencher: async () => {
        await lia.getByLabel("Começa em").fill(daquiA(5));
        await lia.getByLabel("Local geral").fill("no campus");
        await lia.getByLabel(/^Local exato/).fill(SALA);
        await lia.getByLabel(/Com aprovação/).check();
      },
    });
    await expect(lia.getByRole("heading", { level: 2, name: "Pedidos para participar (0)" })).toBeVisible();
    // Sem vagas, nenhum número de vagas aparece.
    await expect(lia.getByTestId("vagas")).toHaveCount(0);

    // O Cauê pede.
    await caue.goto(`/eventos/${evento.aprovacao}`);
    await expect(caue.getByTestId("vagas")).toHaveCount(0);
    await caue.getByRole("button", { name: "Pedir para participar" }).click();
    await expect(caue.getByText("Pedido enviado. Quem organiza ainda não respondeu.")).toBeVisible();
    await expect(caue.getByTestId("local-exato")).toHaveText("Aparece para quem confirmar presença.");
    await expect(caue.locator("main")).not.toContainText(SALA);
    expect(await participacao(evento.aprovacao, id.caue!)).toBe("pendente");
    expect((await cauePorApi.rpc("evento", { p_evento: evento.aprovacao })).data?.[0]?.local_exato).toBeNull();
    // Ninguém se aprova pela API.
    const forjado = await cauePorApi.from("event_participants").update({ status: "confirmado" }).eq("event_id", evento.aprovacao);
    expect(forjado.error?.code).toBe("42501");
    const seAceita = await cauePorApi.rpc("responder_pedido", { p_evento: evento.aprovacao, p_user_id: id.caue!, p_aceitar: true });
    expect(seAceita.error?.code).toBe("PT404");

    // A Lia é notificada e chega ao pedido pela notificação.
    await lia.goto("/notificacoes");
    const aviso = lia.getByRole("list", { name: "Suas notificações" }).locator('li[data-tipo="evento_pedido"]').filter({ hasText: COM_APROVACAO });
    await expect(aviso).toContainText(`Cauê pediu para participar de ${COM_APROVACAO}`);
    await aviso.getByRole("link", { name: COM_APROVACAO }).click();
    await expect(lia).toHaveURL(new RegExp(`/eventos/${evento.aprovacao}$`));

    // Na tela do pedido: o perfil e os gostos em comum.
    await expect(lia.getByRole("heading", { level: 2, name: "Pedidos para participar (1)" })).toBeVisible();
    const pedido = lia.getByRole("list", { name: "Pedidos para participar" }).getByRole("article", { name: "Cauê" });
    await expect(pedido.getByRole("link", { name: "Cauê" })).toHaveAttribute("href", "/u/caue");
    await expect(pedido).toContainText(/Vocês têm \d+ gostos? em comum/);
    await expect(pedido.getByRole("list", { name: "Gostos em comum com Cauê" }).getByRole("listitem").first()).toBeVisible();
    await axe(lia, "evento, com pedido para decidir");

    await pedido.getByRole("button", { name: "Aceitar Cauê" }).click();
    await expect(lia.getByRole("heading", { level: 2, name: "Pedidos para participar (0)" })).toBeVisible();
    const quemVai = lia.getByRole("list", { name: "Quem vai" });
    await expect(quemVai).toContainText("Cauê");
    expect(await participacao(evento.aprovacao, id.caue!)).toBe("confirmado");

    // Seguir de volta é oferecido, e não acontece sozinho.
    const seguir = quemVai.getByRole("button", { name: "Seguir Cauê" });
    await expect(seguir).toBeVisible();
    const antes = await admin().from("follows").select("follower_id").eq("follower_id", id.lia!).eq("followee_id", id.caue!);
    expect(antes.data).toEqual([]);
    await seguir.click();
    await expect(quemVai.getByRole("button", { name: "Deixar de seguir Cauê" })).toBeVisible();
    await expect
      .poll(async () => (await admin().from("follows").select("follower_id").eq("follower_id", id.lia!).eq("followee_id", id.caue!)).data?.length)
      .toBe(1);

    // O Cauê é avisado, e agora vê o local exato.
    await caue.goto("/notificacoes");
    const aceito = caue.getByRole("list", { name: "Suas notificações" }).locator('li[data-tipo="evento_aceito"]').filter({ hasText: COM_APROVACAO });
    await expect(aceito).toContainText(`Seu pedido para ${COM_APROVACAO} foi aceito`);
    await aceito.getByRole("link", { name: COM_APROVACAO }).click();
    await expect(caue.getByText("Você vai.")).toBeVisible();
    await expect(caue.getByTestId("local-exato")).toHaveText(SALA);
    expect((await cauePorApi.rpc("evento", { p_evento: evento.aprovacao })).data?.[0]?.local_exato).toBe(SALA);
  });

  test("recusa discreta: quem pediu vê só que não foi aceito, sem motivo e sem aviso", async () => {
    await beto.goto(`/eventos/${evento.aprovacao}`);
    await beto.getByRole("button", { name: "Pedir para participar" }).click();
    await expect(beto.getByText("Pedido enviado. Quem organiza ainda não respondeu.")).toBeVisible();

    await lia.goto(`/eventos/${evento.aprovacao}`);
    await lia.getByRole("list", { name: "Pedidos para participar" }).getByRole("button", { name: "Recusar Beto" }).click();
    await expect(lia.getByRole("heading", { level: 2, name: "Pedidos para participar (0)" })).toBeVisible();
    await expect(lia.getByRole("list", { name: "Quem vai" })).not.toContainText("Beto");

    await beto.reload();
    await expect(beto.getByText("Seu pedido não foi aceito.")).toBeVisible();
    await expect(beto.getByRole("button", { name: /Pedir para participar|Eu vou/ })).toHaveCount(0);
    await expect(beto.getByTestId("local-exato")).toHaveText("Aparece para quem confirmar presença.");
    await expect(beto.locator("main")).not.toContainText(SALA);
    const avisos = await admin().from("notifications").select("type").eq("user_id", id.beto!).in("type", TIPOS_DE_EVENTO);
    expect(avisos.error).toBeNull();
    expect(avisos.data).toEqual([]);
    await beto.goto("/notificacoes");
    await expect(beto.locator("main")).not.toContainText(COM_APROVACAO);
  });

  test("evento online: o link só aparece para quem confirmou", async () => {
    evento.online = await criar(lia, {
      titulo: ONLINE,
      preencher: async () => {
        await lia.getByLabel("Começa em").fill(daquiA(3));
        await lia.getByLabel("Online").check();
        await lia.getByLabel("Link do evento").fill(LINK);
      },
    });
    await expect(lia.getByTestId("link-do-evento").getByRole("link", { name: LINK })).toHaveAttribute("href", LINK);

    // Só online, no filtro.
    await caue.goto("/eventos");
    await caue.getByRole("navigation", { name: "Filtros" }).getByRole("link", { name: "Online" }).click();
    await expect(caue).toHaveURL(/modalidade=online/);
    const lista = caue.getByRole("list", { name: "Próximos eventos" });
    await expect(lista.getByRole("article", { name: ONLINE })).toContainText("Online");
    await expect(lista.getByRole("article", { name: ABERTO })).toHaveCount(0);
    await expect(caue.locator("main")).not.toContainText("meet.example.com");

    await lista.getByRole("link", { name: ONLINE }).click();
    await expect(caue.getByTestId("link-do-evento")).toHaveText("Aparece para quem confirmar presença.");
    await expect(caue.locator("main")).not.toContainText("meet.example.com");
    expect((await cauePorApi.rpc("evento", { p_evento: evento.online })).data?.[0]?.link).toBeNull();
    expect((await cauePorApi.from("event_details").select("link").eq("event_id", evento.online)).data).toEqual([]);

    await caue.getByRole("button", { name: "Eu vou" }).click();
    await expect(caue.getByText("Você vai.")).toBeVisible();
    const link = caue.getByTestId("link-do-evento").getByRole("link", { name: LINK });
    await expect(link).toHaveAttribute("href", LINK);
    await expect(link).toHaveAttribute("rel", /noopener/);
    expect((await cauePorApi.rpc("evento", { p_evento: evento.online })).data?.[0]?.link).toBe(LINK);

    // O Beto não confirmou: nem pela tela, nem pela API.
    await beto.goto(`/eventos/${evento.online}`);
    await expect(beto.locator("main")).not.toContainText("meet.example.com");
    expect((await betoPorApi.rpc("evento", { p_evento: evento.online })).data?.[0]?.link).toBeNull();
    expect((await betoPorApi.from("event_details").select("link")).data).toEqual([]);

    // Link que não é http(s) não entra, nem pela API.
    const ruim = await cauePorApi.rpc("criar_evento", {
      p_titulo: "Golpe",
      p_descricao: "",
      p_inicio: new Date(Date.now() + 86_400_000).toISOString(),
      p_fim: null,
      p_modalidade: "online",
      p_local_geral: null,
      p_local_exato: null,
      p_link: "javascript:alert(1)",
      p_tipo: "aberto",
      p_vagas: null,
    });
    expect(ruim.error?.code).toBe("PT400");
  });

  test("bloqueio esconde o evento, nas duas direções", async () => {
    await beto.goto("/eventos");
    const lista = beto.getByRole("list", { name: "Próximos eventos" });
    await expect(lista.getByRole("article", { name: ABERTO })).toBeVisible();
    await expect(lista.getByRole("article", { name: ONLINE })).toBeVisible();

    // A Lia bloqueia o Beto.
    const bloqueio = await admin().from("blocks").insert({ blocker_id: id.lia!, blocked_id: id.beto! });
    expect(bloqueio.error).toBeNull();
    await beto.goto("/eventos");
    await expect(beto.getByRole("heading", { level: 1, name: "Eventos" })).toBeVisible();
    await expect(beto.locator("main")).not.toContainText(String(marca));
    // Pelo endereço direto, a página de "não encontrado".
    const resposta = await beto.goto(`/eventos/${evento.aberto}`);
    expect(resposta?.status()).toBe(404);
    await expect(beto.locator("main")).not.toContainText(ABERTO);
    expect((await betoPorApi.rpc("evento", { p_evento: evento.aberto })).data).toEqual([]);
    expect((await betoPorApi.from("events").select("id").eq("organizer_id", id.lia!)).data).toEqual([]);
    const entrar = await betoPorApi.rpc("participar_evento", { p_evento: evento.aberto });
    expect(entrar.error?.code).toBe("PT404");

    // Na outra direção: é o Beto quem bloqueia a Lia.
    await admin().from("blocks").delete().eq("blocker_id", id.lia!).eq("blocked_id", id.beto!);
    await beto.goto("/eventos");
    await expect(beto.getByRole("list", { name: "Próximos eventos" }).getByRole("article", { name: ABERTO })).toBeVisible();
    const reverso = await admin().from("blocks").insert({ blocker_id: id.beto!, blocked_id: id.lia! });
    expect(reverso.error).toBeNull();
    await beto.goto("/eventos");
    await expect(beto.getByRole("heading", { level: 1, name: "Eventos" })).toBeVisible();
    await expect(beto.locator("main")).not.toContainText(String(marca));
    expect((await betoPorApi.rpc("evento", { p_evento: evento.online })).data).toEqual([]);
    await admin().from("blocks").delete().eq("blocker_id", id.beto!).eq("blocked_id", id.lia!);
  });

  test("editar a data avisa quem vai; cancelar avisa e tira o evento da lista", async () => {
    await lia.goto(`/eventos/${evento.online}`);
    await lia.getByRole("link", { name: "Editar" }).click();
    await expect(lia.getByRole("heading", { level: 1, name: "Editar evento" })).toBeVisible();
    await expect(async () => {
      await lia.getByLabel("Começa em").fill(daquiA(4, "20:30"));
      await expect(lia.getByLabel("Começa em")).toHaveValue(daquiA(4, "20:30"), { timeout: 1000 });
    }).toPass();
    await expect(lia.getByLabel("Título")).toHaveValue(ONLINE);
    await expect(lia.getByLabel("Link do evento")).toHaveValue(LINK);
    await lia.getByRole("button", { name: "Salvar" }).click();
    await expect(lia).toHaveURL(new RegExp(`/eventos/${evento.online}$`));
    await expect(lia.getByText(/às 20:30/)).toBeVisible();

    await caue.goto("/notificacoes");
    const mudou = caue.getByRole("list", { name: "Suas notificações" }).locator('li[data-tipo="evento_alterado"]').filter({ hasText: ONLINE });
    await expect(mudou).toContainText("mudou de data, local ou link");

    await lia.getByRole("button", { name: "Cancelar evento" }).click();
    const dialogo = lia.getByRole("dialog", { name: `Cancelar "${ONLINE}"?` });
    await dialogo.getByRole("button", { name: "Cancelar evento" }).click();
    await expect(lia.getByText("Este evento foi cancelado.")).toBeVisible();

    await caue.goto("/notificacoes");
    const cancelado = caue.getByRole("list", { name: "Suas notificações" }).locator('li[data-tipo="evento_cancelado"]').filter({ hasText: ONLINE });
    await expect(cancelado).toContainText(`O evento ${ONLINE} foi cancelado.`);
    await caue.goto("/eventos");
    await expect(caue.getByRole("heading", { level: 1, name: "Eventos" })).toBeVisible();
    await expect(caue.locator("main")).not.toContainText(ONLINE);
    // Para quem nunca esteve nele, o evento cancelado deixa de existir.
    expect((await betoPorApi.rpc("evento", { p_evento: evento.online })).data).toEqual([]);
  });

  test("as telas novas passam no axe, nos dois temas", async () => {
    await lia.goto("/eventos/meus");
    await expect(lia.getByRole("list", { name: "Meus próximos eventos" }).getByRole("article", { name: ABERTO })).toBeVisible();
    await axe(lia, "/eventos/meus de quem organiza");
    await lia.goto(`/eventos/${evento.aprovacao}`);
    await expect(lia.getByRole("list", { name: "Quem vai" })).toContainText("Cauê");
    await axe(lia, "evento, de quem organiza");
    await lia.goto(`/eventos/${evento.aprovacao}/editar`);
    await expect(lia.getByRole("heading", { level: 1, name: "Editar evento" })).toBeVisible();
    await axe(lia, "/eventos/[id]/editar");
    expect(achados).toEqual([]);
  });
});
