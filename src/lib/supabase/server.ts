import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

// Cliente do servidor com a sessão do usuário (cookie). Toda consulta feita
// com ele passa pelo RLS como aquele usuário. Não existe cliente com service
// role neste app.
export async function createClient() {
  const store = await cookies();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(lista) {
        try {
          for (const { name, value, options } of lista) store.set(name, value, options);
        } catch {
          // Chamado de um Server Component: não dá para gravar cookie aqui.
          // O proxy renova a sessão a cada requisição, então é seguro ignorar.
        }
      },
    },
  });
}
