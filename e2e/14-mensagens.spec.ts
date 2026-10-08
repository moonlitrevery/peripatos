import { createDecipheriv, createECDH, createHmac, randomBytes, type ECDH } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  admin,
  ARQUIVO_DA_STAFF_AAL2,
  clientePorApi,
  contextoDe,
  emailDe,
  examinarAxe,
  idDe,
  tornarMutuos,
  type AchadoAxe,
  type Alias,
} from "./apoio";

// Mensagens diretas, com dois navegadores: Íris e Cauê.
// Os testes deste arquivo rodam em ordem e um continua de onde o outro parou.
test.describe.configure({ mode: "serial" });

// Qualquer palavra que indique leitura ou digitação. Com \p{L} nas bordas,
// porque o \b do JavaScript trata letra acentuada como separador e
// "inválida" casaria com "lida".
const SINAL_DE_LEITURA = /(?<!\p{L})(visto|vista|lido|lida|digitando|escrevendo)(?!\p{L})/iu;

const lista = (page: Page, outro: string) => page.getByRole("list", { name: `Mensagens com ${outro}` });

async function enviar(page: Page, outro: string, texto: string) {
  await page.getByLabel(`Mensagem para ${outro}`).fill(texto);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(lista(page, outro).getByText(texto, { exact: false }).last()).toBeVisible();
}

test.describe("Mensagens entre dois navegadores", () => {
  let daIris: BrowserContext;
  let doCaue: BrowserContext;
  let iris: Page;
  let caue: Page;
  let conversa = "";

  test.beforeAll(async ({ browser }) => {
    await tornarMutuos("iris", "caue");
    daIris = await contextoDe(browser, "iris");
    doCaue = await contextoDe(browser, "caue");
    iris = await daIris.newPage();
    caue = await doCaue.newPage();
  });

  test.afterAll(async () => {
    await daIris?.close();
    await doCaue?.close();
  });

  test("mútuos conversam em tempo real, sem recarregar a página", async () => {
    // Íris abre a conversa pelo perfil do Cauê.
    await iris.goto("/u/caue");
    await iris.getByRole("button", { name: "Mensagem", exact: true }).click();
    await expect(iris).toHaveURL(/\/mensagens\/[0-9a-f-]{36}$/);
    conversa = new URL(iris.url()).pathname.split("/").pop()!;
    await expect(iris.getByRole("heading", { level: 1, name: "Cauê" })).toBeVisible();
    await expect(iris.getByText("Nenhuma mensagem ainda. Diga oi.")).toBeVisible();

    // Cauê já está com a conversa aberta quando a mensagem chega.
    await caue.goto(`/mensagens/${conversa}`);
    await expect(caue.getByRole("heading", { level: 1, name: "Íris" })).toBeVisible();

    await enviar(iris, "Cauê", "Oi Cauê, bora jogar RPG quinta?");
    await expect(lista(caue, "Íris").getByText("Oi Cauê, bora jogar RPG quinta?")).toBeVisible();

    await enviar(caue, "Íris", "Bora! Levo os dados.");
    await expect(lista(iris, "Cauê").getByText("Bora! Levo os dados.")).toBeVisible();

    // Sem confirmação de leitura e sem "digitando": nada na tela de quem
    // enviou diz se a outra pessoa leu ou está escrevendo.
    await caue.getByLabel("Mensagem para Íris").fill("escrevendo sem enviar...");
    await iris.waitForTimeout(1500);
    await expect(iris.locator("main").getByText(SINAL_DE_LEITURA)).toHaveCount(0);
    await caue.getByLabel("Mensagem para Íris").fill("");
  });

  test("link só http e https; javascript: fica como texto", async () => {
    await enviar(iris, "Cauê", "olha https://example.com/mesa?x=1. e isto não: javascript:alert(1) nem data:text/html,x");
    const doOutroLado = lista(caue, "Íris").getByRole("listitem").filter({ hasText: "olha https://example.com" });
    await expect(doOutroLado).toBeVisible();
    const links = doOutroLado.getByRole("link");
    await expect(links).toHaveCount(1);
    await expect(links).toHaveAttribute("href", "https://example.com/mesa?x=1");
    await expect(links).toHaveAttribute("rel", /noopener/);
    await expect(links).toHaveAttribute("target", "_blank");
    // Em nenhum lugar da página existe um link que não seja http(s) ou interno.
    const perigosos = await caue.locator("a[href]").evaluateAll((as) =>
      as.map((a) => a.getAttribute("href") ?? "").filter((h) => !/^(https?:\/\/|\/|#)/.test(h)),
    );
    expect(perigosos).toEqual([]);
  });

  test("contador de não lidas só para quem recebeu, e some ao abrir", async () => {
    await caue.goto("/");
    await expect(caue.getByTestId("nao-lidas")).toHaveCount(0);

    await enviar(iris, "Cauê", "Esqueci: pode ser às 19h?");
    // Chega pelo tempo real, com o Cauê em outra tela.
    await expect(caue.getByTestId("nao-lidas")).toHaveText("1");
    // Para quem enviou não há contador nem aviso de leitura.
    await expect(iris.getByTestId("nao-lidas")).toHaveCount(0);

    await caue.getByRole("link", { name: /Mensagens/ }).first().click();
    await expect(caue.getByRole("heading", { level: 1, name: "Mensagens" })).toBeVisible();
    const item = caue.getByRole("list", { name: "Conversas" }).getByRole("link", { name: /Íris/ });
    await expect(item).toContainText("Esqueci: pode ser às 19h?");
    await expect(item).toContainText("1 mensagem não lida");
    await item.click();
    await expect(lista(caue, "Íris").getByText("Esqueci: pode ser às 19h?")).toBeVisible();
    await expect(caue.getByTestId("nao-lidas")).toHaveCount(0);

    // Abrir a conversa não mudou nada na tela da Íris.
    await expect(iris.locator("main").getByText(SINAL_DE_LEITURA)).toHaveCount(0);
  });

  test("apagar a própria mensagem some para os dois; não dá para apagar a do outro", async () => {
    await enviar(iris, "Cauê", "mensagem que vou apagar");
    const doCaueLado = lista(caue, "Íris").getByRole("listitem").filter({ hasText: "mensagem que vou apagar" });
    await expect(doCaueLado).toBeVisible();
    // Na mensagem recebida o Cauê tem Denunciar, e não Apagar.
    await expect(doCaueLado.getByRole("button", { name: "Apagar" })).toHaveCount(0);

    const minha = lista(iris, "Cauê").getByRole("listitem").filter({ hasText: "mensagem que vou apagar" });
    await minha.getByRole("button", { name: "Apagar" }).click();
    await minha.getByRole("button", { name: "Apagar" }).last().click();
    await expect(minha).toHaveCount(0);
    // Some do outro lado pelo tempo real...
    await expect(doCaueLado).toHaveCount(0);
    // ...e do banco.
    const { data } = await admin().from("messages").select("id").eq("body", "mensagem que vou apagar");
    expect(data).toEqual([]);
  });

  test("denúncia leva só uma cópia para a moderação, que não acessa a conversa", async ({ browser }) => {
    const alvo = lista(caue, "Íris").getByRole("listitem").filter({ hasText: "Oi Cauê, bora jogar RPG quinta?" });
    await alvo.getByRole("button", { name: "Denunciar" }).click();
    const dialogo = caue.getByRole("dialog", { name: "Denunciar esta mensagem" });
    await expect(dialogo.getByText("A moderação recebe uma cópia desta mensagem, e só dela.")).toBeVisible();
    await dialogo.getByLabel("Motivo").selectOption("spam");
    await dialogo.getByLabel(/Conte o que aconteceu/).fill("teste de denúncia de mensagem");
    await dialogo.getByRole("button", { name: "Enviar denúncia" }).click();
    await expect(dialogo.getByText("Denúncia enviada.")).toBeVisible();

    // A staff, com o segundo fator, vê a cópia na fila...
    const staff = await browser.newContext({ storageState: ARQUIVO_DA_STAFF_AAL2 });
    const s = await staff.newPage();
    await s.goto("/moderacao");
    const denuncia = s.getByRole("article").filter({ hasText: "teste de denúncia de mensagem" });
    await expect(denuncia).toBeVisible();
    await expect(denuncia.getByText("Mensagem de")).toBeVisible();
    await expect(denuncia.getByText("Oi Cauê, bora jogar RPG quinta?")).toBeVisible();
    await expect(denuncia.getByText("Você não tem acesso ao resto da conversa.")).toBeVisible();
    // ...e só a cópia: as outras mensagens da conversa não aparecem em lugar nenhum.
    await expect(s.getByText("Bora! Levo os dados.")).toHaveCount(0);

    // A conversa em si não existe para ela, nem a lista.
    const resposta = await s.goto(`/mensagens/${conversa}`);
    expect(resposta?.status()).toBe(404);
    await expect(s.getByRole("heading", { level: 1, name: "Não achamos esta conversa" })).toBeVisible();
    await expect(s.getByText("Bora! Levo os dados.")).toHaveCount(0);
    await s.goto("/mensagens");
    await expect(s.getByRole("list", { name: "Conversas" })).toHaveCount(0);
    await staff.close();

    // Um terceiro comum também não.
    const terceiro = await contextoDe(browser, "tomas");
    const t = await terceiro.newPage();
    expect((await t.goto(`/mensagens/${conversa}`))?.status()).toBe(404);
    await terceiro.close();
  });

  test("acessibilidade (axe) nas telas de mensagens, nos dois temas", async ({ browser }) => {
    const achados: AchadoAxe[] = [];
    for (const tema of ["light", "dark"] as const) {
      const contexto = await contextoDe(browser, "iris", { colorScheme: tema });
      const page = await contexto.newPage();
      await page.goto("/mensagens");
      await expect(page.getByRole("list", { name: "Conversas" })).toBeVisible();
      await examinarAxe(page, `/mensagens (${tema})`, achados);
      await page.goto(`/mensagens/${conversa}`);
      await expect(lista(page, "Cauê")).toBeVisible();
      await examinarAxe(page, `/mensagens/[id] aberta (${tema})`, achados);
      // com o diálogo de denúncia e a confirmação de apagar à mostra
      await lista(page, "Cauê").getByRole("button", { name: "Apagar" }).first().click();
      await examinarAxe(page, `/mensagens/[id] confirmando apagar (${tema})`, achados);
      await contexto.close();
    }
    expect(achados).toEqual([]);
  });

  test("deixar de seguir fecha a conversa (continua legível); voltar a seguir reabre", async () => {
    await caue.goto("/u/iris");
    await caue.getByRole("button", { name: "Deixar de seguir Íris" }).click();
    await expect(caue.getByRole("button", { name: "Seguir Íris", exact: true })).toBeVisible();
    // O botão muda na hora (otimista); espera o banco registrar.
    const [idCaue, idIris] = [await idDe("caue"), await idDe("iris")];
    await expect
      .poll(async () => (await admin().from("follows").select("follower_id").eq("follower_id", idCaue).eq("followee_id", idIris)).data?.length)
      .toBe(0);

    for (const [page, outro] of [
      [iris, "Cauê"],
      [caue, "Íris"],
    ] as const) {
      await page.goto(`/mensagens/${conversa}`);
      await expect(page.getByRole("heading", { level: 2, name: "Conversa fechada" })).toBeVisible();
      await expect(page.getByText("Vocês não se seguem mais, então não dá para enviar mensagens novas.")).toBeVisible();
      // legível...
      await expect(lista(page, outro).getByText("Bora! Levo os dados.")).toBeVisible();
      // ...mas sem onde escrever.
      await expect(page.getByLabel(`Mensagem para ${outro}`)).toHaveCount(0);
    }
    await iris.goto("/mensagens");
    await expect(iris.getByRole("list", { name: "Conversas" }).getByText("Conversa fechada: vocês não se seguem mais")).toBeVisible();

    // Pela API, sem a interface no caminho, o banco também recusa.
    const pelaApi = await clientePorApi(emailDe("iris"));
    const tentativa = await pelaApi.from("messages").insert({ conversation_id: conversa, body: "ainda aí?" });
    expect(tentativa.error?.code).toBe("42501");
    expect((await pelaApi.from("messages").select("id").eq("conversation_id", conversa)).data?.length).toBeGreaterThan(0);

    // Uma aba que ficou aberta antes de fechar: o envio não passa.
    await tornarMutuos("iris", "caue");
    await iris.goto(`/mensagens/${conversa}`);
    await expect(iris.getByLabel("Mensagem para Cauê")).toBeVisible();
    await admin().from("follows").delete().eq("follower_id", await idDe("caue")).eq("followee_id", await idDe("iris"));
    await iris.getByLabel("Mensagem para Cauê").fill("mandando com a aba velha");
    await iris.getByRole("button", { name: "Enviar", exact: true }).click();
    // O banco recusa, e a tela passa a mostrar a conversa como fechada.
    await expect(iris.getByRole("heading", { level: 2, name: "Conversa fechada" })).toBeVisible();
    expect((await admin().from("messages").select("id").eq("body", "mandando com a aba velha")).data).toEqual([]);

    // Voltam a se seguir: reabre.
    await tornarMutuos("iris", "caue");
    await iris.goto(`/mensagens/${conversa}`);
    await enviar(iris, "Cauê", "voltamos!");
    await caue.goto(`/mensagens/${conversa}`);
    await expect(lista(caue, "Íris").getByText("voltamos!")).toBeVisible();
  });

  test("bloqueio esconde a conversa dos dois lados", async () => {
    await caue.goto("/u/iris");
    await caue.getByRole("button", { name: "Bloquear", exact: true }).click();
    await caue.getByRole("dialog", { name: "Bloquear Íris?" }).getByRole("button", { name: "Bloquear", exact: true }).click();
    await expect(caue).not.toHaveURL(/\/u\/iris$/);

    for (const page of [iris, caue]) {
      expect((await page.goto(`/mensagens/${conversa}`))?.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1, name: "Não achamos esta conversa" })).toBeVisible();
      await expect(page.getByText("voltamos!")).toHaveCount(0);
      await page.goto("/mensagens");
      await expect(page.getByRole("heading", { level: 1, name: "Mensagens" })).toBeVisible();
      await expect(page.getByRole("link", { name: /Íris|Cauê/ })).toHaveCount(0);
      await expect(page.getByTestId("nao-lidas")).toHaveCount(0);
    }
    // As mensagens continuam no banco (o bloqueio esconde, não apaga)...
    expect((await admin().from("messages").select("id").eq("conversation_id", conversa)).data?.length).toBeGreaterThan(0);
    // ...mas nenhum dos dois as lê, nem pela API.
    const pelaApi = await clientePorApi(emailDe("iris"));
    expect((await pelaApi.from("messages").select("id").eq("conversation_id", conversa)).data).toEqual([]);
    expect((await pelaApi.from("conversations").select("id")).data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tempo real: quem recebe evento
// ---------------------------------------------------------------------------
// Clientes falando direto com o Realtime, sem o app: é o que faria alguém
// tentando escutar a conversa dos outros.

type Escuta = { estado: string; eventos: unknown[]; fechar: () => Promise<unknown> };

async function escutar(cliente: SupabaseClient, topico: string, privado: boolean): Promise<Escuta> {
  await cliente.realtime.setAuth();
  const eventos: unknown[] = [];
  const escuta: Escuta = { estado: "aguardando", eventos, fechar: async () => undefined };
  const canal = cliente
    .channel(topico, { config: { private: privado } })
    .on("broadcast", { event: "*" }, (m) => eventos.push(m))
    .subscribe((estado) => {
      escuta.estado = estado;
    });
  escuta.fechar = () => cliente.removeChannel(canal);
  await expect.poll(() => escuta.estado, { timeout: 15_000 }).not.toBe("aguardando");
  return escuta;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("tempo real: só os participantes recebem; terceiro, bloqueado e não mútuo não recebem nada", async () => {
  test.setTimeout(180_000);
  const ids = Object.fromEntries(
    await Promise.all((["lia", "caue", "tomas", "nina", "beto"] as Alias[]).map(async (a) => [a, await idDe(a)] as const)),
  ) as Record<"lia" | "caue" | "tomas" | "nina" | "beto", string>;

  await tornarMutuos("lia", "caue");
  await tornarMutuos("lia", "nina");
  // Beto só segue a Lia: não é mútuo.
  await admin().from("follows").delete().eq("follower_id", ids.lia).eq("followee_id", ids.beto);
  const segue = await admin().from("follows").insert({ follower_id: ids.beto, followee_id: ids.lia });
  expect(segue.error === null || segue.error.code === "23505").toBe(true);

  const lia = await clientePorApi(emailDe("lia"));
  const caue = await clientePorApi(emailDe("caue"));
  const tomas = await clientePorApi(emailDe("tomas"));
  const nina = await clientePorApi(emailDe("nina"));
  const beto = await clientePorApi(emailDe("beto"));

  const comCaue = (await lia.rpc("abrir_conversa", { p_outro: ids.caue })).data as string;
  const comNina = (await lia.rpc("abrir_conversa", { p_outro: ids.nina })).data as string;
  expect(comCaue).toMatch(/^[0-9a-f-]{36}$/);
  expect(comNina).toMatch(/^[0-9a-f-]{36}$/);
  // A Nina e a Lia conversaram; depois a Lia bloqueia a Nina.
  expect((await lia.from("messages").insert({ conversation_id: comNina, body: "e2e: antes de a Lia bloquear a Nina" })).error).toBeNull();
  expect((await lia.from("blocks").insert({ blocked_id: ids.nina })).error).toBeNull();
  // Não mútuo não abre conversa.
  expect((await beto.rpc("abrir_conversa", { p_outro: ids.lia })).error?.message).toContain("quem você segue e que te segue de volta");

  // --- Quem consegue entrar em qual canal
  const doCaue = await escutar(caue, `usuario:${ids.caue}`, true);
  const daLia = await escutar(lia, `usuario:${ids.lia}`, true);
  expect(doCaue.estado).toBe("SUBSCRIBED");
  expect(daLia.estado).toBe("SUBSCRIBED");

  const intrusos: { quem: string; escuta: Escuta }[] = [];
  for (const [quem, cliente] of [
    ["terceiro (Tomás)", tomas],
    ["bloqueada (Nina)", nina],
    ["não mútuo (Beto)", beto],
  ] as const) {
    // O cliente do Supabase reaproveita o canal quando o nome se repete, então
    // cada tentativa privada é encerrada antes da pública com o mesmo nome.
    for (const topico of [`usuario:${ids.lia}`, `usuario:${ids.caue}`, `conversa:${comCaue}`]) {
      // Canal privado de outra pessoa (ou com o id da conversa): o Realtime recusa a entrada.
      const privado = await escutar(cliente, topico, true);
      expect(privado.estado, `${quem} em ${topico}, privado`).not.toBe("SUBSCRIBED");
      expect(privado.eventos).toEqual([]);
      await privado.fechar();
      // O mesmo nome como canal público: entra, mas nada é publicado ali.
      const publico = await escutar(cliente, topico, false);
      intrusos.push({ quem: `${quem}, canal público "${topico.split(":")[0]}:…"`, escuta: publico });
    }
    // E o próprio canal, onde ele é autorizado.
    const proprio = await escutar(cliente, `usuario:${ids[quem.includes("Tomás") ? "tomas" : quem.includes("Nina") ? "nina" : "beto"]}`, true);
    expect(proprio.estado, `${quem} no próprio canal`).toBe("SUBSCRIBED");
    intrusos.push({ quem: `${quem}, o próprio canal`, escuta: proprio });
  }

  // --- A Lia manda uma mensagem para o Cauê
  const TEXTO = "segredo entre lia e caue";
  const envio = await lia.from("messages").insert({ conversation_id: comCaue, body: TEXTO }).select("id").single();
  expect(envio.error).toBeNull();

  // Controle: os dois participantes RECEBEM. Sem isto, "ninguém recebeu"
  // poderia ser só o tempo real desligado.
  await expect.poll(() => doCaue.eventos.length, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect.poll(() => daLia.eventos.length, { timeout: 15_000 }).toBeGreaterThan(0);
  const recebido = JSON.stringify(doCaue.eventos);
  expect(recebido).toContain(envio.data!.id);
  expect(recebido).toContain('"tipo":"nova"');
  // O evento leva identificadores, nunca o texto.
  expect(recebido).not.toContain(TEXTO);

  // A bloqueada tenta escrever e apagar; nada disso gera evento para ninguém.
  expect((await nina.from("messages").insert({ conversation_id: comNina, body: "me desbloqueia" })).error?.code).toBe("42501");
  expect((await nina.from("messages").insert({ conversation_id: comCaue, body: "intrusa" })).error?.code).toBe("42501");
  // E a Lia apaga a mensagem que mandou para o Cauê.
  const antesDeApagar = doCaue.eventos.length;
  expect((await lia.from("messages").delete().eq("id", envio.data!.id)).error).toBeNull();
  await expect.poll(() => doCaue.eventos.length, { timeout: 15_000 }).toBeGreaterThan(antesDeApagar);

  // Tempo para qualquer evento indevido chegar.
  await esperar(4000);
  for (const { quem, escuta } of intrusos) {
    expect(escuta.eventos, `${quem} não pode receber nenhum evento`).toEqual([]);
  }
  // E nenhum deles lê a mensagem pela API.
  for (const cliente of [tomas, nina, beto]) {
    expect((await cliente.from("messages").select("id").eq("conversation_id", comCaue)).data).toEqual([]);
  }

  // --- Ex-mútuo: a conversa continua legível, mas não chega mais evento
  const segunda = await lia.from("messages").insert({ conversation_id: comCaue, body: "última antes de deixar de seguir" }).select("id").single();
  expect(segunda.error).toBeNull();
  await expect.poll(() => JSON.stringify(doCaue.eventos).includes(segunda.data!.id), { timeout: 15_000 }).toBe(true);
  expect((await caue.from("follows").delete().eq("follower_id", ids.caue).eq("followee_id", ids.lia)).error).toBeNull();
  const antes = doCaue.eventos.length;
  expect((await lia.from("messages").delete().eq("id", segunda.data!.id)).error).toBeNull();
  await esperar(4000);
  expect(doCaue.eventos.length, "ex-mútuo não recebe nem o evento de apagar").toBe(antes);
  expect((await lia.from("messages").insert({ conversation_id: comCaue, body: "ainda aí?" })).error?.code).toBe("42501");

  for (const e of [doCaue, daLia, ...intrusos.map((i) => i.escuta)]) await e.fechar();
  // Desfaz o que mudou no seed, para quem rodar de novo sem reset.
  await admin().from("blocks").delete().eq("blocker_id", ids.lia).eq("blocked_id", ids.nina);
  await tornarMutuos("lia", "caue");
});

// ---------------------------------------------------------------------------
// Notificação push: nunca leva o conteúdo
// ---------------------------------------------------------------------------

const hmac = (chave: Buffer, dado: Buffer) => createHmac("sha256", chave).update(dado).digest();

/** Decifra uma carga Web Push (RFC 8291, aes128gcm) com as chaves do "aparelho". */
function decifrar(corpo: Buffer, aparelho: ECDH, auth: Buffer): string {
  const salt = corpo.subarray(0, 16);
  const tamanhoDaChave = corpo[20]!;
  const doServidor = corpo.subarray(21, 21 + tamanhoDaChave);
  const cifrado = corpo.subarray(21 + tamanhoDaChave);
  const segredo = aparelho.computeSecret(doServidor);
  const ikm = hmac(hmac(auth, segredo), Buffer.concat([Buffer.from("WebPush: info\0"), aparelho.getPublicKey(), doServidor, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const chave = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0"), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce\0"), Buffer.from([1])])).subarray(0, 12);
  const d = createDecipheriv("aes-128-gcm", chave, nonce);
  d.setAuthTag(cifrado.subarray(-16));
  const claro = Buffer.concat([d.update(cifrado.subarray(0, -16)), d.final()]);
  let fim = claro.length - 1;
  while (fim >= 0 && claro[fim] === 0) fim--;
  return claro.subarray(0, fim).toString("utf8"); // tira o delimitador 0x02
}

test("notificação push diz só de quem é a mensagem, nunca o conteúdo", async ({ browser }) => {
  test.setTimeout(120_000);
  await tornarMutuos("lia", "caue");
  const caueId = await idDe("caue");

  // Um "serviço de push" de mentira, para onde a Edge Function vai entregar.
  // Roda como contêiner na rede do Supabase local: a função (que também é um
  // contêiner) o alcança pelo nome, sem depender do firewall da máquina.
  const pasta = path.join(__dirname, "..", "test-results");
  mkdirSync(pasta, { recursive: true });
  const script = path.join(pasta, "push-falso.js");
  writeFileSync(
    script,
    `const recebidos = [];
require("http").createServer((req, res) => {
  if (req.method === "GET") return res.end(JSON.stringify(recebidos));
  const partes = [];
  req.on("data", (p) => partes.push(p));
  req.on("end", () => {
    recebidos.push({ cabecalhos: req.headers, corpo: Buffer.concat(partes).toString("base64") });
    res.writeHead(201).end();
  });
}).listen(8080, "0.0.0.0");`,
  );
  const nome = `push-falso-${randomBytes(4).toString("hex")}`;
  const sh = (cmd: string) => execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const rede = sh(`docker inspect supabase_edge_runtime_peripatos --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}'`);
  sh(`docker run -d --name ${nome} --network ${rede} -p 127.0.0.1::8080 -v "${script}:/push-falso.js:ro" node:22-alpine node /push-falso.js`);
  const portaLocal = sh(`docker port ${nome} 8080`).split(":").pop()!;
  const lerRecebidos = async (): Promise<{ cabecalhos: Record<string, unknown>; corpo: Buffer }[]> => {
    try {
      const r = await fetch(`http://127.0.0.1:${portaLocal}/`);
      return ((await r.json()) as { cabecalhos: Record<string, unknown>; corpo: string }[]).map((x) => ({
        cabecalhos: x.cabecalhos,
        corpo: Buffer.from(x.corpo, "base64"),
      }));
    } catch {
      return []; // o contêiner ainda está subindo
    }
  };

  try {
    // O banco só guarda endereço de serviço de push conhecido. Para o teste,
    // este endereço local entra na lista (direto no banco, fora da API).
    const sql = path.join(pasta, "push-host-de-teste.sql");
    writeFileSync(sql, `insert into private.push_hosts (padrao, nota) values ('^http://${nome}:8080/push/', 'teste e2e') on conflict do nothing;`);
    execSync(`supabase db query --local -f "${sql}"`, { stdio: "ignore" });

    // As chaves do "aparelho" do Cauê.
    const aparelho = createECDH("prime256v1");
    aparelho.generateKeys();
    const auth = randomBytes(16);
    const inscricao = await admin().from("push_subscriptions").insert({
      user_id: caueId,
      endpoint: `http://${nome}:8080/push/${randomBytes(12).toString("hex")}`,
      p256dh: aparelho.getPublicKey().toString("base64url"),
      auth: auth.toString("base64url"),
    });
    expect(inscricao.error).toBeNull();
    // Fora da lista o banco recusa, mesmo com a service role.
    const fora = await admin().from("push_subscriptions").insert({
      user_id: caueId,
      endpoint: `http://169.254.169.254/latest/meta-data/${randomBytes(8).toString("hex")}`,
      p256dh: aparelho.getPublicKey().toString("base64url"),
      auth: auth.toString("base64url"),
    });
    expect(fora.error?.message).toBe("Endereço de notificação não reconhecido.");

    // A Lia manda uma mensagem pelo app.
    const SEGREDO = "isto é particular: senha 4815162342";
    const daLia = await contextoDe(browser, "lia");
    const page = await daLia.newPage();
    await page.goto("/u/caue");
    await page.getByRole("button", { name: "Mensagem", exact: true }).click();
    await expect(page).toHaveURL(/\/mensagens\/[0-9a-f-]{36}$/);
    const conversa = new URL(page.url()).pathname.split("/").pop()!;
    await enviar(page, "Cauê", SEGREDO);

    await expect
      .poll(async () => (await lerRecebidos()).length, { timeout: 30_000, message: "a Edge Function não entregou a notificação" })
      .toBe(1);
    const { cabecalhos, corpo } = (await lerRecebidos())[0]!;
    expect(cabecalhos["content-encoding"]).toBe("aes128gcm");
    expect(String(cabecalhos.authorization)).toMatch(/^vapid t=.+, k=.+/);
    // Cifrado em trânsito...
    expect(corpo.includes(Buffer.from("Lia"))).toBe(false);
    // ...e, decifrado com as chaves do aparelho, é só isto:
    const carga = JSON.parse(decifrar(corpo, aparelho, auth));
    expect(carga).toEqual({ titulo: "Nova mensagem de Lia", url: `/mensagens/${conversa}`, tag: `conversa-${conversa}` });
    expect(JSON.stringify(carga)).not.toContain("particular");
    expect(JSON.stringify(carga)).not.toContain("4815162342");

    // Chamar a função de novo não manda outra; e quem não enviou não dispara nada.
    const { data: msg } = await admin().from("messages").select("id").eq("body", SEGREDO).single();
    const lia = await clientePorApi(emailDe("lia"));
    const repetida = await lia.functions.invoke("notificar-mensagem", { body: { mensagemId: msg!.id } });
    expect(repetida.data).toEqual({ enviadas: 0, motivo: "já notificada" });
    const tomas = await clientePorApi(emailDe("tomas"));
    const alheia = await tomas.functions.invoke("notificar-mensagem", { body: { mensagemId: msg!.id } });
    expect(alheia.error).not.toBeNull();
    await esperar(1500);
    expect((await lerRecebidos()).length).toBe(1);

    await daLia.close();
  } finally {
    await admin().from("push_subscriptions").delete().eq("user_id", caueId);
    execSync(`docker rm -f ${nome}`, { stdio: "ignore" });
  }
});
