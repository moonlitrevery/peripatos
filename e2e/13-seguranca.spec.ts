import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { contextoDe, emailDe, entrar } from "./apoio";

function arquivosDe(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = path.join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivosDe(caminho);
    return /\.(ts|tsx)$/.test(nome) ? [caminho] : [];
  });
}

test.describe("Segurança", () => {
  test("nenhum filtro do PostgREST é montado com texto, e nada injeta HTML", () => {
    const src = path.join(__dirname, "..", "src");
    const achados: string[] = [];
    for (const arquivo of arquivosDe(src)) {
      if (arquivo.endsWith("database.types.ts")) continue;
      const linhas = readFileSync(arquivo, "utf8").split("\n");
      linhas.forEach((linha, i) => {
        const onde = `${path.relative(src, arquivo)}:${i + 1}`;
        // .or() e .filter() recebem a expressão como TEXTO: qualquer valor
        // concatenado ali pode reescrever o filtro. O app não usa nenhum dos
        // dois; usa .eq(), .in() e afins, que recebem o valor separado.
        if (/\.(or|filter|not|textSearch)\(\s*[`"']/.test(linha) || /\.(or|filter)\(\s*\w+\s*[,)]/.test(linha)) {
          if (!/\.filter\(\(/.test(linha)) achados.push(`${onde} filtro em texto: ${linha.trim()}`);
        }
        if (/dangerouslySetInnerHTML|\.innerHTML\s*=|document\.write\(/.test(linha)) achados.push(`${onde} HTML cru: ${linha.trim()}`);
        // Link só para caminho interno literal. Um href vindo de dado do
        // usuário poderia ser "javascript:".
        // Os únicos permitidos: /u/<username> (o username é [a-z0-9_] por
        // constraint do banco), /eventos/<id> (um uuid gerado pelo banco),
        // /conquistas/<slug> (o slug é [a-z0-9-] por
        // constraint do banco, e o catálogo não é gravável pela API) e as
        // abas fixas da navegação.
        // TextoComLinks é o único lugar que cria link a partir de texto do
        // usuário, e só aceita http e https (conferido em 14-mensagens).
        const permitido = /href=\{(`\/(u|mensagens|conquistas|eventos)\/\$\{[\w.]+\}(\/editar)?`|aba\.href)\}/.test(linha) || arquivo.endsWith("TextoComLinks.tsx");
        if (/href=\{/.test(linha) && !permitido) {
          achados.push(`${onde} href dinâmico: ${linha.trim()}`);
        }
      });
    }
    expect(achados).toEqual([]);
  });

  test("um username que tenta reescrever o filtro não encontra ninguém", async ({ browser }) => {
    const contexto = await contextoDe(browser, "lia");
    for (const tentativa of ["caue,id.not.is.null", "*", "caue)", "or=(id.not.is.null)", "%", "caue&select=*"]) {
      const r = await contexto.request.get(`/u/${encodeURIComponent(tentativa)}`);
      expect(r.status(), tentativa).toBe(404);
      const html = await r.text();
      expect(html, tentativa).toContain("Não achamos este perfil");
      expect(html, tentativa).not.toContain("Cauê");
    }
    await contexto.close();
  });

  test("a busca de GIFs tem limite por pessoa e valida a entrada", async ({ browser }) => {
    const contexto = await contextoDe(browser, "tomas");

    // Entrada grande demais é recusada antes de gastar cota.
    const grande = await contexto.request.get(`/api/giphy?q=${"a".repeat(300)}`);
    expect(grande.status()).toBe(400);

    // 30 buscas passam do limite para dentro (sem chave do Giphy a rota
    // responde 503, com chave 200; o que importa é não ser 429).
    for (let i = 0; i < 30; i++) {
      const r = await contexto.request.get(`/api/giphy?q=gato${i}`);
      expect(r.status(), `busca ${i + 1}`).not.toBe(429);
    }
    const alem = await contexto.request.get("/api/giphy?q=gato");
    expect(alem.status()).toBe(429);
    expect(alem.headers()["retry-after"]).toBe("60");
    expect((await alem.json()).erro).toBe("Muitas buscas de GIF em pouco tempo. Espere um minuto.");

    // O limite é de cada pessoa: outra conta continua buscando.
    const outra = await contextoDe(browser, "iris");
    expect((await outra.request.get("/api/giphy?q=gato")).status()).not.toBe(429);
    await outra.close();
    await contexto.close();
  });

  test("sair de todos os dispositivos derruba a sessão do outro aparelho", async ({ browser }) => {
    // Dois logins separados da mesma conta: dois aparelhos.
    const aparelhoA = await browser.newContext();
    const a = await aparelhoA.newPage();
    await entrar(a, emailDe("beto"));
    const aparelhoB = await browser.newContext();
    const b = await aparelhoB.newPage();
    await entrar(b, emailDe("beto"));
    await a.goto("/voce");
    await expect(a.getByRole("heading", { level: 1, name: "Beto" })).toBeVisible();

    await b.goto("/config");
    await b.getByRole("button", { name: "Sair de todos os dispositivos" }).click();
    await expect(b).toHaveURL(/\/entrar\?conta=saiu-de-tudo$/);
    await expect(b.getByText("Você saiu de todos os dispositivos.")).toBeVisible();

    // No outro aparelho a sessão não vale mais: a próxima página pede login.
    await a.goto("/voce");
    await expect(a).toHaveURL(/\/entrar$/);

    await aparelhoA.close();
    await aparelhoB.close();
    // A sessão guardada do Beto, de testes anteriores, também foi encerrada.
    rmSync(path.join(__dirname, ".auth", "beto.json"), { force: true });
  });
});

// Uma aba aberta antes de um deploy manda o formulário antigo. O servidor
// recusa, e a mensagem precisa dizer o que fazer, em português, e não o texto
// padrão da biblioteca de validação.
test("nenhuma regra de validação deixa vazar a mensagem padrão em inglês", async () => {
  const v = await import("../src/lib/validacao");
  const { z } = await import("zod");
  const formularioAntigo = { username: "abc", displayName: "Abc", nascimento: "2000-01-01", bio: "" };
  const Dados = z.object({ username: v.username, bio: v.bio, termosAceitos: z.string().nullable(), consentiu: z.boolean() });
  const r = v.validar(Dados, formularioAntigo);
  expect(r.ok).toBe(false);
  if (!r.ok && !r.falha.ok) {
    expect(r.falha.erro).toBe("O Peripatos foi atualizado. Recarregue a página e tente de novo.");
    expect(r.falha.erro).not.toMatch(/invalid|expected|received|undefined/i);
  }
  // As regras com mensagem própria continuam com a delas.
  const curto = v.validar(v.username, "a");
  expect(!curto.ok && !curto.falha.ok && curto.falha.erro).toContain("3 a 20 caracteres");
  // E nenhum tipo errado, em nenhuma regra, produz texto em inglês.
  for (const [nome, regra] of Object.entries(v)) {
    if (typeof regra !== "object" || regra === null || !("safeParse" in regra)) continue;
    for (const lixo of [undefined, null, 42, {}, []]) {
      const t = v.validar(regra as never, lixo);
      if (!t.ok && !t.falha.ok) expect(t.falha.erro, `${nome} com ${JSON.stringify(lixo)}`).not.toMatch(/invalid input|expected|received/i);
    }
  }
});
