// Edge Function: notificar-mensagem
//
// Manda a notificação push de UMA mensagem para quem a recebeu.
//
// O que vai na notificação: "Nova mensagem de <nome de exibição>" e o
// endereço da conversa. O CONTEÚDO DA MENSAGEM NUNCA VAI: a notificação
// aparece na tela bloqueada, e passa pelos servidores de push do navegador.
// Esta função nem chega a ler o corpo da mensagem do banco.
//
// Quem pode chamar: só quem enviou a mensagem, com o próprio token. A função
// não aceita destinatário, nome nem texto por parâmetro; tudo sai do banco a
// partir do id. Chamar duas vezes não manda duas notificações (notified_at).
//
// Para onde ela faz requisição: só para endereços que o banco aceitou guardar
// em push_subscriptions, e ele só aceita os serviços de push dos navegadores.
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const JANELA_MS = 5 * 60 * 1000; // mensagem mais velha que isto não gera notificação

function origemPermitida(): string {
  const bruto = (Deno.env.get("ORIGEM_DO_APP") ?? "").trim();
  if (!bruto) return "*";
  try {
    return new URL(/^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`).origin;
  } catch {
    return "*";
  }
}

const cors = {
  "Access-Control-Allow-Origin": origemPermitida(),
  "Vary": "Origin",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function responder(status: number, corpo: Record<string, unknown>) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** O texto da notificação. Fica numa função só para o teste poder conferi-lo. */
export function conteudoDaNotificacao(nome: string, conversaId: string) {
  const limpo = nome.replace(/[\u0000-\u001F\u007F]+/g, " ").trim().slice(0, 50) || "alguém";
  return { titulo: `Nova mensagem de ${limpo}`, url: `/mensagens/${conversaId}`, tag: `conversa-${conversaId}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return responder(405, { erro: "Método não permitido." });

  const publica = Deno.env.get("VAPID_PUBLIC_KEY");
  const privada = Deno.env.get("VAPID_PRIVATE_KEY");
  const assunto = Deno.env.get("VAPID_SUBJECT") || "mailto:contato@peripatos.invalid";
  if (!publica || !privada) return responder(503, { erro: "Notificações não configuradas." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const autorizacao = req.headers.get("Authorization") ?? "";
  const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
  } = await comoUsuario.auth.getUser();
  if (!user) return responder(401, { erro: "Login necessário." });

  let mensagemId: unknown;
  try {
    mensagemId = (await req.json())?.mensagemId;
  } catch {
    return responder(400, { erro: "Corpo inválido." });
  }
  if (typeof mensagemId !== "string" || !/^[0-9a-f-]{36}$/i.test(mensagemId)) {
    return responder(400, { erro: "Mensagem inválida." });
  }

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Sem a coluna body: o conteúdo não entra nesta função.
  const { data: msg } = await admin
    .from("messages")
    .select("id, conversation_id, sender_id, created_at, notified_at")
    .eq("id", mensagemId)
    .maybeSingle();
  // Mesma resposta para "não existe" e "não é sua".
  if (!msg || msg.sender_id !== user.id) return responder(404, { erro: "Mensagem não encontrada." });
  if (msg.notified_at) return responder(200, { enviadas: 0, motivo: "já notificada" });
  if (Date.now() - new Date(msg.created_at).getTime() > JANELA_MS) return responder(200, { enviadas: 0, motivo: "antiga" });

  // A conversa ainda está aberta PARA QUEM ENVIOU, segundo o banco e com o
  // token dele: se houve bloqueio ou deixaram de se seguir, ninguém é avisado.
  const { data: conversas } = await comoUsuario.rpc("minhas_conversas");
  const conversa = (conversas ?? []).find(
    (c: { conversa_id: string; aberta: boolean; outro_id: string }) => c.conversa_id === msg.conversation_id,
  );
  if (!conversa || !conversa.aberta) return responder(200, { enviadas: 0, motivo: "conversa fechada" });

  // Marca antes de enviar: duas chamadas ao mesmo tempo não mandam duas vezes.
  const { data: marcada } = await admin
    .from("messages")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", msg.id)
    .is("notified_at", null)
    .select("id");
  if (!marcada || marcada.length === 0) return responder(200, { enviadas: 0, motivo: "já notificada" });

  const [{ data: remetente }, { data: inscricoes }] = await Promise.all([
    admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", conversa.outro_id),
  ]);
  if (!inscricoes || inscricoes.length === 0) return responder(200, { enviadas: 0, motivo: "sem aparelhos" });

  const carga = JSON.stringify(conteudoDaNotificacao(remetente?.display_name ?? "", msg.conversation_id));
  webpush.setVapidDetails(assunto, publica, privada);

  let enviadas = 0;
  const mortas: string[] = [];
  await Promise.all(
    inscricoes.map(async (i) => {
      try {
        // A biblioteca cifra a carga para as chaves DESTE aparelho e monta
        // os cabeçalhos VAPID; o envio é um fetch comum.
        const pedido = webpush.generateRequestDetails({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, carga, {
          TTL: 60 * 60,
          urgency: "normal",
        });
        const r = await fetch(pedido.endpoint, {
          method: pedido.method,
          headers: pedido.headers as Record<string, string>,
          body: pedido.body,
          signal: AbortSignal.timeout(10_000),
          redirect: "error", // um serviço de push não redireciona; não seguimos para outro lugar
        });
        // 404/410: o navegador cancelou a inscrição. Não adianta tentar de novo.
        if (r.status === 404 || r.status === 410) mortas.push(i.id);
        else if (r.ok) enviadas++;
      } catch {
        // rede ou serviço fora do ar: esta notificação se perde, a mensagem não
      }
    }),
  );
  if (mortas.length > 0) await admin.from("push_subscriptions").delete().in("id", mortas);

  return responder(200, { enviadas });
});
