"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { falha, mensagemDeErro, ok, type Resultado } from "@/lib/erros";
import { ultimasMensagens, type Mensagem } from "@/lib/mensagens";
import { createClient } from "@/lib/supabase/server";
import * as v from "@/lib/validacao";

// Todas as ações rodam com a sessão de quem clicou. Quem pode conversar com
// quem, quem lê o quê e quantas mensagens por minuto são regras do banco;
// aqui só se confere a forma do que chega e se traduz o erro.

const SEM_SESSAO = "Sua sessão expirou. Entre de novo.";

async function sessao() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Abre (ou reabre) a conversa com um mútuo e vai para ela. */
export async function abrirConversa(alvoBruto: unknown): Promise<Resultado> {
  const alvo = v.validar(v.uuid, alvoBruto);
  if (!alvo.ok) return alvo.falha;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { data, error } = await supabase.rpc("abrir_conversa", { p_outro: alvo.dado });
  if (error || !data) return falha(mensagemDeErro(error, "Não foi possível abrir a conversa."));
  redirect(`/mensagens/${data}`);
}

const Envio = z.object({
  conversaId: v.uuid,
  corpo: v.corpoDaMensagem,
  gif: z.object({ id: v.gifId, alt: v.gifAlt }).nullable(),
});

export async function enviarMensagem(conversaBruta: unknown, corpoBruto: unknown, gifBruto: unknown): Promise<Resultado<Mensagem>> {
  const r = v.validar(Envio, { conversaId: conversaBruta, corpo: corpoBruto, gif: gifBruto });
  if (!r.ok) return r.falha;
  const { conversaId, corpo, gif } = r.dado;
  if (corpo === "" && !gif) return falha("Escreva algo ou escolha um GIF.");

  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);

  // Só o conteúdo. Quem envia, quando e para quem são do banco.
  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversaId, body: corpo, gif_id: gif?.id ?? null, gif_alt: gif?.alt ?? null })
    .select("id, sender_id, body, gif_id, gif_alt, created_at")
    .single();
  if (error) {
    // 42501 aqui é a política recusando: deixaram de se seguir, ou houve bloqueio.
    if (error.code === "42501") return falha("Esta conversa está fechada: vocês não se seguem mais.");
    return falha(mensagemDeErro(error, "Não foi possível enviar."));
  }

  // A notificação push não é disparada daqui: o banco a pede sozinho a cada
  // mensagem gravada (trigger), venha ela do app ou de uma chamada à API.

  return ok({
    id: data.id,
    minha: true,
    corpo: data.body,
    gifId: data.gif_id,
    gifAlt: data.gif_alt,
    criadaEm: data.created_at,
  });
}

export async function apagarMensagem(idBruto: unknown): Promise<Resultado> {
  const id = v.validar(v.uuid, idBruto);
  if (!id.ok) return id.falha;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  // .eq("sender_id") é redundante com a política (só o autor apaga), e fica
  // para a intenção estar escrita aqui também.
  const { data, error } = await supabase.from("messages").delete().eq("id", id.dado).eq("sender_id", user.id).select("id");
  if (error) return falha(mensagemDeErro(error));
  if ((data ?? []).length === 0) return falha("Não foi possível apagar esta mensagem.");
  return ok(undefined);
}

/** Marca a conversa como lida. Só quem chama enxerga esse marcador. */
export async function marcarLida(conversaBruta: unknown): Promise<Resultado> {
  const id = v.validar(v.uuid, conversaBruta);
  if (!id.ok) return id.falha;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.rpc("marcar_conversa_lida", { p_conversa: id.dado });
  if (error) return falha(mensagemDeErro(error));
  return ok(undefined);
}

/**
 * Uma mensagem pelo id, quando o tempo real avisa que ela chegou numa conversa
 * que está aberta na tela. Se for da outra pessoa, já marca a conversa como
 * lida na mesma chamada: quem sai da tela logo em seguida não fica com uma
 * "não lida" que acabou de ver.
 */
export async function receberMensagem(idBruto: unknown): Promise<Resultado<Mensagem | null>> {
  const id = v.validar(v.uuid, idBruto);
  if (!id.ok) return id.falha;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { data } = await supabase.from("messages").select("id, sender_id, body, gif_id, gif_alt, created_at, conversation_id").eq("id", id.dado).maybeSingle();
  if (!data) return ok(null);
  if (data.sender_id !== user.id) await supabase.rpc("marcar_conversa_lida", { p_conversa: data.conversation_id });
  return ok({ id: data.id, minha: data.sender_id === user.id, corpo: data.body, gifId: data.gif_id, gifAlt: data.gif_alt, criadaEm: data.created_at });
}

const Anteriores = z.object({ conversaId: v.uuid, antesDe: z.iso.datetime({ offset: true }) });

export async function mensagensAnteriores(
  conversaBruta: unknown,
  antesBruto: unknown,
): Promise<Resultado<{ mensagens: Mensagem[]; haMais: boolean }>> {
  const r = v.validar(Anteriores, { conversaId: conversaBruta, antesDe: antesBruto });
  if (!r.ok) return r.falha;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const pagina = await ultimasMensagens(supabase, r.dado.conversaId, user.id, r.dado.antesDe);
  if (pagina.erro) return falha(mensagemDeErro(pagina.erro));
  return ok({ mensagens: pagina.mensagens, haMais: pagina.haMais });
}

/** Total de não lidas de quem chama, para o contador da aba Mensagens. */
export async function contarNaoLidas(): Promise<number> {
  const { supabase, user } = await sessao();
  if (!user) return 0;
  const { data } = await supabase.rpc("total_nao_lidas");
  return typeof data === "number" ? data : 0;
}

const DenunciaDeMensagem = z.object({ id: v.uuid, motivo: v.motivoDeDenuncia, detalhe: v.detalheDaDenuncia });

// A denúncia leva uma cópia da mensagem, feita pelo banco. É só essa cópia
// que a moderação vê: ela não tem acesso à conversa.
export async function denunciarMensagem(idBruto: unknown, motivoBruto: unknown, detalheBruto: unknown): Promise<Resultado> {
  const r = v.validar(DenunciaDeMensagem, { id: idBruto, motivo: motivoBruto, detalhe: detalheBruto });
  if (!r.ok) return r.falha;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.rpc("denunciar_mensagem", {
    p_mensagem: r.dado.id,
    p_motivo: r.dado.motivo,
    p_detalhe: r.dado.detalhe || undefined,
  });
  if (error) return falha(mensagemDeErro(error, "Não foi possível enviar a denúncia."));
  revalidatePath("/moderacao");
  return ok(undefined);
}
