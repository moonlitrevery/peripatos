import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

// Roda antes de toda página (no Next 16, `proxy` é o novo nome do middleware):
//   1. renova a sessão e regrava os cookies;
//   2. sem login            -> /entrar
//   3. sem onboarding       -> /onboarding
// Isto é conforto de navegação. Quem protege os dados é o RLS: uma requisição
// que escape daqui continua sem conseguir ler nada.

const PUBLICAS = ["/entrar", "/termos", "/privacidade", "/offline"];

function ehPublica(caminho: string) {
  return PUBLICAS.some((p) => caminho === p || caminho.startsWith(p + "/"));
}

export async function proxy(request: NextRequest) {
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const caminho = request.nextUrl.pathname;

  const redirecionar = (para: string) => {
    const url = request.nextUrl.clone();
    url.pathname = para;
    url.search = "";
    const r = NextResponse.redirect(url);
    // leva junto os cookies de sessão renovados
    for (const c of response.cookies.getAll()) r.cookies.set(c);
    return r;
  };

  if (!user) {
    return ehPublica(caminho) ? response : redirecionar("/entrar");
  }

  if (caminho === "/entrar") return redirecionar("/");
  if (ehPublica(caminho)) return response;

  const { data: perfil } = await supabase
    .from("profiles")
    .select("onboarding_completo")
    .eq("id", user.id)
    .maybeSingle();

  const completo = perfil?.onboarding_completo === true;
  if (!completo && caminho !== "/onboarding") return redirecionar("/onboarding");
  if (completo && caminho === "/onboarding") return redirecionar("/");

  return response;
}

export const config = {
  // Tudo, menos arquivos estáticos, o service worker, o manifest e a API
  // (os route handlers conferem o usuário por conta própria).
  matcher: ["/((?!_next/static|_next/image|api/|sw\\.js|manifest\\.webmanifest|icones/|favicon\\.ico|.*\\.(?:png|svg|ico|webp)$).*)"],
};
