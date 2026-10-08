import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Quem está logado, para as páginas. Uma verificação por requisição.
//
// O proxy (src/proxy.ts) já validou a sessão desta mesma requisição com
// getUser(), no servidor de Auth. Aqui usamos getClaims(), que confere a
// ASSINATURA do token em vez de confiar no cookie: com chaves assimétricas
// (o padrão dos projetos novos do Supabase) isso é feito na hora, sem outra
// ida ao Auth; com o segredo simétrico antigo (o ambiente local), o próprio
// getClaims() cai no getUser(). Nos dois casos o token é verificado, nunca só
// lido. E nenhum dado sai sem o RLS conferir o mesmo token de novo.
//
// As server actions (src/app/acoes) continuam com getUser(): escrevem, e não
// passam por aqui.
export const sessaoAtual = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims.sub;
  return { supabase, user: typeof id === "string" && id ? { id } : null };
});

export async function exigirSessao() {
  const { supabase, user } = await sessaoAtual();
  if (!user) redirect("/entrar");
  return { supabase, user };
}

export const meuPerfil = cache(async () => {
  const { supabase, user } = await exigirSessao();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!data) redirect("/entrar");
  return data;
});

// O cargo vem da tabela staff_roles (via RLS), nunca do JWT nem de metadata.
export const meuCargo = cache(async () => {
  const { supabase, user } = await exigirSessao();
  const { data } = await supabase.from("staff_roles").select("role").eq("user_id", user.id).maybeSingle();
  return data?.role ?? null;
});

// Nível da sessão segundo o próprio token: "aal2" quando o segundo fator foi
// confirmado neste login. getClaims() confere a assinatura do token em vez de
// confiar no cookie. Serve só para a interface decidir que tela mostrar: quem
// exige aal2 de verdade é o banco.
export const nivelDaSessao = cache(async (): Promise<"aal1" | "aal2" | null> => {
  const { supabase } = await exigirSessao();
  const { data } = await supabase.auth.getClaims();
  const aal = data?.claims.aal;
  return aal === "aal2" ? "aal2" : aal === "aal1" ? "aal1" : null;
});
