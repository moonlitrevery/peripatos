// Edge Function: notificar-mensagem
//
// Manda a notificação push de UMA mensagem para quem a recebeu.
//
// O que vai na notificação: "Nova mensagem de <nome de exibição>" e o
// endereço da conversa. O CONTEÚDO DA MENSAGEM NUNCA VAI: a notificação
// aparece na tela bloqueada, e passa pelos servidores de push do navegador.
// Esta função nem chega a ler o corpo da mensagem: o banco não o entrega.
//
// Quem chama: o BANCO, por um trigger em public.messages, a cada mensagem
// gravada (venha do app ou de uma chamada direta à API). O pedido traz só o
// id da mensagem e um segredo que prova que veio do banco. Não há usuário
// nesta chamada, por isso a função roda com verify_jwt = false e confere o
// segredo ela mesma. Sem o segredo certo, responde 401 e não faz nada.
//
// Quem decide se a notificação sai, e para quem, é o banco
// (public.preparar_notificacao): mensagem recente, ainda não notificada,
// conversa aberta. Ele marca a mensagem como notificada na mesma chamada.
//
// A MESMA função entrega os avisos da aba de notificações (novo seguidor,
// mútuo, conquista...), quando o pedido traz `notificacaoId` em vez de
// `mensagemId`. Aí o banco (public.preparar_push_de_notificacao) devolve só o
// destinatário e o tipo, e o texto é fixo por tipo: não cita ninguém, não diz
// qual conquista (ela pode ser secreta) nem se a foto foi aprovada ou recusada.
//
// Para onde ela faz requisição: só para endereços que o banco aceitou guardar
// em push_subscriptions, e ele só aceita os serviços de push dos navegadores.
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

function responder(status: number, corpo: Record<string, unknown>) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Comparação em tempo constante, para o segredo não vazar pelo tempo de resposta. */
function iguais(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diferenca = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diferenca |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diferenca === 0;
}

/** O texto da notificação. É tudo o que sai daqui. */
function conteudoDaNotificacao(nome: string, conversaId: string) {
  const limpo = nome.replace(/[\u0000-\u001F\u007F]+/g, " ").trim().slice(0, 50) || "alguém";
  return { titulo: `Nova mensagem de ${limpo}`, url: `/mensagens/${conversaId}`, tag: `conversa-${conversaId}` };
}

// Texto fixo de cada tipo de aviso. Um tipo que não esteja aqui não é enviado.
const AVISOS: Record<string, string> = {
  novo_seguidor: "Alguém começou a seguir você",
  mutuo: "Você tem um novo mútuo",
  avatar_aprovado: "Sua foto de perfil foi analisada",
  avatar_recusado: "Sua foto de perfil foi analisada",
  denuncia_analisada: "Sua denúncia foi analisada",
  termos_atualizados: "Os Termos do Peripatos mudaram",
  conquista: "Você ganhou uma conquista",
};

const UUID = /^[0-9a-f-]{36}$/i;

Deno.serve(async (req) => {
  // Não é chamada por navegadores: sem CORS, e só POST.
  if (req.method !== "POST") return responder(405, { erro: "Método não permitido." });

  const esperado = Deno.env.get("SEGREDO_DO_BANCO") ?? "";
  const recebido = req.headers.get("x-peripatos-segredo") ?? "";
  if (esperado.length < 16 || !iguais(recebido, esperado)) return responder(401, { erro: "Não autorizado." });

  const publica = Deno.env.get("VAPID_PUBLIC_KEY");
  const privada = Deno.env.get("VAPID_PRIVATE_KEY");
  const assunto = Deno.env.get("VAPID_SUBJECT") || "mailto:contato@peripatos.invalid";
  if (!publica || !privada) return responder(503, { erro: "Notificações não configuradas." });

  let mensagemId: unknown;
  let notificacaoId: unknown;
  try {
    const corpo = await req.json();
    mensagemId = corpo?.mensagemId;
    notificacaoId = corpo?.notificacaoId;
  } catch {
    return responder(400, { erro: "Corpo inválido." });
  }
  const ehAviso = notificacaoId !== undefined && mensagemId === undefined;
  if (ehAviso ? typeof notificacaoId !== "string" || !UUID.test(notificacaoId) : typeof mensagemId !== "string" || !UUID.test(mensagemId)) {
    return responder(400, { erro: ehAviso ? "Notificação inválida." : "Mensagem inválida." });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // O banco decide e marca. Vem uma linha (notificar) ou nenhuma (não notificar).
  let destinatario: string;
  let carga: string;
  if (ehAviso) {
    const { data: linhas, error } = await admin.rpc("preparar_push_de_notificacao", { p_notificacao: notificacaoId });
    if (error) return responder(500, { erro: "Não foi possível preparar a notificação." });
    const alvo = (linhas ?? [])[0] as { destinatario: string; tipo: string } | undefined;
    const titulo = alvo ? AVISOS[alvo.tipo] : undefined;
    if (!alvo || !titulo) return responder(200, { enviadas: 0, motivo: "nada a notificar" });
    destinatario = alvo.destinatario;
    carga = JSON.stringify({ titulo, url: "/notificacoes", tag: `aviso-${alvo.tipo}` });
  } else {
    const { data: linhas, error } = await admin.rpc("preparar_notificacao", { p_mensagem: mensagemId });
    if (error) return responder(500, { erro: "Não foi possível preparar a notificação." });
    const alvo = (linhas ?? [])[0] as { destinatario: string; remetente: string | null; conversa: string } | undefined;
    if (!alvo) return responder(200, { enviadas: 0, motivo: "nada a notificar" });
    destinatario = alvo.destinatario;
    carga = JSON.stringify(conteudoDaNotificacao(alvo.remetente ?? "", alvo.conversa));
  }

  const { data: inscricoes } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", destinatario);
  if (!inscricoes || inscricoes.length === 0) return responder(200, { enviadas: 0, motivo: "sem aparelhos" });

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
