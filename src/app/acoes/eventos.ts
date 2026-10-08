"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { falha, mensagemDeErro, ok, type Resultado } from "@/lib/erros";
import { deCampoDeData } from "@/lib/eventos";
import { createClient } from "@/lib/supabase/server";
import * as v from "@/lib/validacao";

// Eventos. Nada aqui decide quem pode: cada ação chama a RPC com a sessão de
// quem clicou, e é o banco que confere organizador, instituição, bloqueio,
// vagas (com a linha do evento travada), limites e Termos.

const SEM_SESSAO = "Sua sessão expirou. Entre de novo.";

async function sessao() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const texto = (max: number, msg: string) => z.string(msg).trim().max(max, msg);
// Só http e https. O banco repete a regra na RPC e num CHECK da coluna.
const link = z
  .string("Informe o link do evento.")
  .trim()
  .max(500, "O link pode ter até 500 caracteres.")
  .refine((s) => s === "" || /^https?:\/\/[^\s<>"']+$/i.test(s), "O link precisa começar com http:// ou https://.");

const Campos = z.object({
  titulo: z.string("Dê um título ao evento.").trim().min(3, "O título precisa ter de 3 a 80 caracteres.").max(80, "O título precisa ter de 3 a 80 caracteres."),
  descricao: texto(1000, "A descrição pode ter até 1000 caracteres."),
  inicio: z.string("Informe quando começa."),
  fim: z.string("Data de fim inválida."),
  modalidade: z.enum(["presencial", "online"], "Escolha se o evento é presencial ou online."),
  localGeral: texto(80, "O local geral pode ter até 80 caracteres."),
  localExato: texto(200, "O local exato pode ter até 200 caracteres."),
  link,
  vagas: z.union([z.literal(""), z.string().regex(/^\d{1,3}$/, "As vagas vão de 1 a 500.")], "As vagas vão de 1 a 500."),
  tags: z.array(z.number().int().positive().max(1_000_000), "Lista de tags inválida.").max(5, "Um evento pode ter até 5 tags."),
});
const Novo = Campos.extend({ tipo: z.enum(["aberto", "aprovacao"], "Escolha se o evento é aberto ou com aprovação.") });

export type CamposDoEvento = z.input<typeof Novo>;

function paraRpc(c: z.infer<typeof Campos>) {
  const inicio = deCampoDeData(c.inicio);
  if (!inicio) return { erro: "Informe a data e a hora de início." } as const;
  const fim = c.fim === "" ? null : deCampoDeData(c.fim);
  if (c.fim !== "" && !fim) return { erro: "A data de fim é inválida." } as const;
  return {
    args: {
      p_titulo: c.titulo,
      p_descricao: c.descricao,
      p_inicio: inicio,
      p_fim: fim,
      p_modalidade: c.modalidade,
      p_local_geral: c.localGeral || null,
      p_local_exato: c.localExato || null,
      p_link: c.link || null,
      p_vagas: c.vagas === "" ? null : Number(c.vagas),
      p_tags: c.tags,
    },
  } as const;
}

export async function criarEvento(bruto: unknown): Promise<Resultado> {
  const r = v.validar(Novo, bruto);
  if (!r.ok) return r.falha;
  const p = paraRpc(r.dado);
  if (p.erro !== undefined) return falha(p.erro);
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  // Os argumentos opcionais vão como null: os tipos gerados não sabem disso.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- nulos aceitos pela RPC
  const { data, error } = await supabase.rpc("criar_evento", { ...p.args, p_tipo: r.dado.tipo } as any);
  if (error || typeof data !== "string") return falha(mensagemDeErro(error, "Não foi possível criar o evento."));
  revalidatePath("/eventos", "layout");
  redirect(`/eventos/${data}`);
}

export async function editarEvento(idBruto: unknown, bruto: unknown): Promise<Resultado> {
  const id = v.validar(v.uuid, idBruto);
  if (!id.ok) return id.falha;
  const r = v.validar(Campos, bruto);
  if (!r.ok) return r.falha;
  const p = paraRpc(r.dado);
  if (p.erro !== undefined) return falha(p.erro);
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- nulos aceitos pela RPC
  const { error } = await supabase.rpc("editar_evento", { p_evento: id.dado, ...p.args } as any);
  if (error) return falha(mensagemDeErro(error, "Não foi possível salvar o evento."));
  revalidatePath("/eventos", "layout");
  redirect(`/eventos/${id.dado}`);
}

type RpcSimples = "cancelar_evento" | "participar_evento" | "sair_do_evento";

async function noEvento(fn: RpcSimples, idBruto: unknown): Promise<Resultado> {
  const id = v.validar(v.uuid, idBruto);
  if (!id.ok) return id.falha;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.rpc(fn, { p_evento: id.dado });
  if (error) return falha(mensagemDeErro(error));
  revalidatePath("/eventos", "layout");
  return ok(undefined);
}

export const cancelarEvento = async (id: unknown) => noEvento("cancelar_evento", id);
export const participarDoEvento = async (id: unknown) => noEvento("participar_evento", id);
export const sairDoEvento = async (id: unknown) => noEvento("sair_do_evento", id);

export async function responderPedido(eventoBruto: unknown, pessoaBruta: unknown, aceitarBruto: unknown): Promise<Resultado> {
  const r = v.validar(z.object({ evento: v.uuid, pessoa: v.uuid, aceitar: z.boolean() }), { evento: eventoBruto, pessoa: pessoaBruta, aceitar: aceitarBruto });
  if (!r.ok) return r.falha;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.rpc("responder_pedido", { p_evento: r.dado.evento, p_user_id: r.dado.pessoa, p_aceitar: r.dado.aceitar });
  if (error) return falha(mensagemDeErro(error));
  revalidatePath("/eventos", "layout");
  return ok(undefined);
}

export async function removerParticipante(eventoBruto: unknown, pessoaBruta: unknown): Promise<Resultado> {
  const r = v.validar(z.object({ evento: v.uuid, pessoa: v.uuid }), { evento: eventoBruto, pessoa: pessoaBruta });
  if (!r.ok) return r.falha;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.rpc("remover_participante", { p_evento: r.dado.evento, p_user_id: r.dado.pessoa });
  if (error) return falha(mensagemDeErro(error));
  revalidatePath("/eventos", "layout");
  return ok(undefined);
}

// A denúncia leva uma cópia do título, da descrição e do local geral, feita
// pelo banco: a moderação não ganha acesso ao local exato nem a quem vai.
export async function denunciarEvento(idBruto: unknown, motivoBruto: unknown, detalheBruto: unknown): Promise<Resultado> {
  const r = v.validar(z.object({ id: v.uuid, motivo: v.motivoDeDenuncia, detalhe: v.detalheDaDenuncia }), { id: idBruto, motivo: motivoBruto, detalhe: detalheBruto });
  if (!r.ok) return r.falha;
  const { supabase, user } = await sessao();
  if (!user) return falha(SEM_SESSAO);
  const { error } = await supabase.rpc("denunciar_evento", { p_evento: r.dado.id, p_motivo: r.dado.motivo, p_detalhe: r.dado.detalhe });
  if (error) return falha(mensagemDeErro(error, "Não foi possível enviar a denúncia."));
  return ok(undefined);
}
