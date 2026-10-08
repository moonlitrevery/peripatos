import Link from "next/link";
import { TagChip } from "@/components/TagChip";
import { quando, textoDasVagas, type Evento } from "@/lib/eventos";

const STATUS: Record<string, string> = {
  organizo: "Você organiza",
  confirmado: "Você vai",
  pendente: "Pedido enviado",
};

/** "Presencial · no campus" ou "Online". O local exato e o link nunca aparecem no cartão. */
export function ondeEm(e: Pick<Evento, "modalidade" | "localGeral">): string {
  return e.modalidade === "online" ? "Online" : `Presencial · ${e.localGeral ?? ""}`;
}

// Um evento na lista. Nada aqui diz quem vai: só as vagas que sobram, e só
// quando o evento tem vagas.
export function CartaoDeEvento({ evento }: { evento: Evento }) {
  const vagas = textoDasVagas(evento);
  const status = evento.cancelado ? "Cancelado" : evento.meuStatus ? STATUS[evento.meuStatus] : undefined;
  return (
    <article className="cartao cartao-elo flex flex-col gap-2" aria-label={evento.titulo}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 text-xl leading-tight font-bold break-words">
          <Link href={`/eventos/${evento.id}`} className="elo-do-cartao">
            {evento.titulo}
          </Link>
        </h3>
        {status && (
          <span className={`chip ${evento.cancelado ? "" : "chip-comum"}`} data-testid="status-do-evento">
            {status}
          </span>
        )}
      </header>
      <p className="font-semibold">
        <time dateTime={evento.inicio}>{quando(evento.inicio, evento.fim)}</time>
      </p>
      <p className="text-tinta-2">
        {ondeEm(evento)} · {evento.tipo === "aprovacao" ? "Com aprovação" : "Aberto"}
        {vagas && ` · ${vagas}`}
      </p>
      <p className="fino">Organizado por {evento.organizador.nome}</p>
      {evento.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tags do evento">
          {evento.tags.map((t) => (
            <li key={t.id}>
              <TagChip tag={t} discreta />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
