import type { Database } from "@/lib/database.types";
import type { Tag } from "@/lib/tags";

// Eventos. Quem vê o quê é decidido no banco: as RPCs devolvem cada evento já
// do ponto de vista de quem chama (local exato e link só vêm para quem vai).

type Linha = Database["public"]["CompositeTypes"]["evento_visto"];

export type MeuStatus = "organizo" | "confirmado" | "pendente" | "recusado" | null;

export type Evento = {
  id: string;
  titulo: string;
  descricao: string;
  inicio: string;
  fim: string | null;
  modalidade: "presencial" | "online";
  localGeral: string | null;
  tipo: "aberto" | "aprovacao";
  vagas: number | null;
  /** Só existe quando o evento tem vagas. */
  vagasRestantes: number | null;
  organizador: { id: string; username: string; nome: string; avatarPath: string | null; preset: number | null };
  tags: Tag[];
  tagsEmComum: number;
  meuStatus: MeuStatus;
  cancelado: boolean;
  oculto: boolean;
  acabou: boolean;
  /** Só vêm para quem organiza ou está confirmado. */
  localExato: string | null;
  link: string | null;
  /** Só para quem organiza. */
  pedidosPendentes: number | null;
};

export function deLinha(l: Linha): Evento {
  return {
    id: l.id ?? "",
    titulo: l.titulo ?? "",
    descricao: l.descricao ?? "",
    inicio: l.inicio ?? "",
    fim: l.fim,
    modalidade: l.modalidade === "online" ? "online" : "presencial",
    localGeral: l.local_geral,
    tipo: l.tipo === "aprovacao" ? "aprovacao" : "aberto",
    vagas: l.vagas,
    vagasRestantes: l.vagas_restantes,
    organizador: {
      id: l.organizador_id ?? "",
      username: l.organizador_username ?? "",
      nome: l.organizador_nome ?? "",
      avatarPath: l.organizador_avatar_path,
      preset: l.organizador_avatar_preset,
    },
    tags: Array.isArray(l.tags) ? (l.tags as unknown as Tag[]) : [],
    tagsEmComum: l.tags_em_comum ?? 0,
    meuStatus: (l.meu_status as MeuStatus) ?? null,
    cancelado: l.cancelado === true,
    oculto: l.oculto === true,
    acabou: l.acabou === true,
    localExato: l.local_exato,
    link: l.link,
    pedidosPendentes: l.pedidos_pendentes,
  };
}

// Tudo em horário de Brasília, onde quer que o servidor ou o aparelho esteja.
const FUSO = "America/Sao_Paulo";
const dia = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: FUSO });
const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: FUSO });
const chave = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: FUSO });

/** "sexta-feira, 16 de outubro, das 19:00 às 22:00" (horário de Brasília). */
export function quando(inicio: string, fim: string | null): string {
  const i = new Date(inicio);
  if (!fim) return `${dia.format(i)}, às ${hora.format(i)}`;
  const f = new Date(fim);
  return chave.format(i) === chave.format(f)
    ? `${dia.format(i)}, das ${hora.format(i)} às ${hora.format(f)}`
    : `${dia.format(i)}, às ${hora.format(i)}, até ${dia.format(f)}, às ${hora.format(f)}`;
}

// O campo <input type="datetime-local"> não tem fuso: o que a pessoa digita é
// lido como horário de Brasília. O Brasil não tem horário de verão desde 2019,
// então Brasília é sempre UTC-3.
const CAMPO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** "2026-10-16T19:00" (Brasília) -> instante ISO. Nulo se não tem a forma certa. */
export function deCampoDeData(valor: string): string | null {
  if (!CAMPO.test(valor)) return null;
  const d = new Date(`${valor}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Instante ISO -> "2026-10-16T19:00" em horário de Brasília, para preencher o campo. */
export function paraCampoDeData(iso: string | null): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() - 3 * 3_600_000).toISOString().slice(0, 16);
}

/** "3 de 5 vagas" quando há vagas; nada quando não há (ninguém vê número). */
export function textoDasVagas(e: Pick<Evento, "vagas" | "vagasRestantes">): string | null {
  if (e.vagas === null || e.vagasRestantes === null) return null;
  if (e.vagasRestantes === 0) return `Sem vagas (${e.vagas} de ${e.vagas} ocupadas)`;
  return `${e.vagasRestantes} de ${e.vagas} ${e.vagas === 1 ? "vaga" : "vagas"}`;
}
