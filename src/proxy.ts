import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { montarCsp } from "@/lib/csp";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

// Roda antes de toda página (no Next 16, `proxy` é o novo nome do middleware):
//   1. renova a sessão e regrava os cookies;
//   2. sem login            -> /entrar
//   3. sem onboarding       -> /onboarding
//      termos desatualizados -> /aceite
//   4. gera o nonce e a Content-Security-Policy desta resposta.
// Isto é conforto de navegação. Quem protege os dados é o RLS: uma requisição
// que escape daqui continua sem conseguir ler nada.

const PUBLICAS = ["/entrar", "/termos", "/privacidade", "/offline", "/maiores-de-18"];

function ehPublica(caminho: string) {
  return PUBLICAS.some((p) => caminho === p || caminho.startsWith(p + "/"));
}

export async function proxy(request: NextRequest) {
  // Um nonce novo por resposta. O Next lê a CSP do cabeçalho da REQUISIÇÃO
  // para saber qual nonce pôr nos próprios scripts; o navegador lê a da
  // resposta. Por isso ela vai nos dois.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = montarCsp(nonce);
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);

  const comCsp = (r: NextResponse) => {
    r.headers.set("Content-Security-Policy", csp);
    return r;
  };

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(lista) {
        for (const { name, value } of lista) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of lista) response.cookies.set(name, value, options);
      },
    },
  });

  // getUser() valida o token no servidor de Auth. getSession() só leria o
  // cookie, que o próprio usuário controla.
  //
  // O estado da conta (onboarding, aceite dos Termos) é pedido AO MESMO TEMPO,
  // e não depois: são duas idas ao Supabase que não dependem uma da outra, e
  // em fila cada navegação esperava as duas. Não é um atalho na validação: a
  // RPC roda com o mesmo token, que o banco confere por conta própria, e o
  // resultado só é usado se o getUser() confirmar a sessão. Sem cookie de
  // sessão (visitante) nada é pedido.
  const temSessao = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  const paraPublica = ehPublica(request.nextUrl.pathname);
  const [
    {
      data: { user },
    },
    statusDaConta,
  ] = await Promise.all([
    supabase.auth.getUser(),
    temSessao && !paraPublica ? supabase.rpc("conta_status") : Promise.resolve({ data: null, error: null }),
  ]);

  const caminho = request.nextUrl.pathname;

  const redirecionar = (para: string) => {
    const url = request.nextUrl.clone();
    url.pathname = para;
    url.search = "";
    const r = NextResponse.redirect(url);
    // leva junto os cookies de sessão renovados
    for (const c of response.cookies.getAll()) r.cookies.set(c);
    return comCsp(r);
  };

  if (!user) {
    return ehPublica(caminho) ? comCsp(response) : redirecionar("/entrar");
  }

  if (caminho === "/entrar") return redirecionar("/");
  if (ehPublica(caminho)) return comCsp(response);

  // Uma chamada só diz se o onboarding terminou e se a pessoa aceitou a
  // versão vigente dos Termos. Se a que saiu junto com o getUser() falhou (o
  // token estava vencido e foi renovado no meio), pede de novo, já com o novo.
  const status = statusDaConta.error || statusDaConta.data === null ? (await supabase.rpc("conta_status")).data : statusDaConta.data;
  const conta = status as { onboarding_completo?: boolean; termos_em_dia?: boolean } | null;

  const completo = conta?.onboarding_completo === true;
  if (!completo && caminho !== "/onboarding") return redirecionar("/onboarding");
  if (completo && caminho === "/onboarding") return redirecionar("/");

  // Os Termos mudaram desde o último aceite: antes de qualquer outra tela, a
  // pessoa vê o que mudou e decide. Isto é navegação; quem impede de postar
  // ou mandar mensagem sem o aceite é o banco.
  const emDia = conta?.termos_em_dia === true;
  if (completo && !emDia && caminho !== "/aceite") return redirecionar("/aceite");
  if (completo && emDia && caminho === "/aceite") return redirecionar("/");

  return comCsp(response);
}

export const config = {
  // Tudo, menos arquivos estáticos, o service worker, o manifest e a API
  // (os route handlers conferem o usuário por conta própria).
  matcher: ["/((?!_next/static|_next/image|api/|sw\\.js|manifest\\.webmanifest|icones/|favicon\\.ico|.*\\.(?:png|svg|ico|webp)$).*)"],
};
