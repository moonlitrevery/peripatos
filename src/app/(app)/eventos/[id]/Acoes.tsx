"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelarEvento, participarDoEvento, removerParticipante, responderPedido, sairDoEvento } from "@/app/acoes/eventos";
import { Dialogo } from "@/components/Dialogo";
import type { Resultado } from "@/lib/erros";

function useAcao() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const rodar = (acao: () => Promise<Resultado>, depois?: () => void) => {
    setErro(null);
    iniciar(async () => {
      const r = await acao();
      if (!r.ok) setErro(r.erro);
      else depois?.();
      // o que a pessoa passa a ver (local exato, link, lista) vem do servidor
      router.refresh();
    });
  };
  return { pendente, erro, rodar };
}

function Erro({ texto }: { texto: string | null }) {
  return texto ? (
    <p role="alert" className="erro">
      {texto}
    </p>
  ) : null;
}

/** "Eu vou" (evento aberto) ou "Pedir para participar" (com aprovação). */
export function Participar({ eventoId, comAprovacao, lotado }: { eventoId: string; comAprovacao: boolean; lotado: boolean }) {
  const { pendente, erro, rodar } = useAcao();
  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="btn btn-pri self-start" disabled={pendente || (lotado && !comAprovacao)} onClick={() => rodar(() => participarDoEvento(eventoId))}>
        {comAprovacao ? "Pedir para participar" : "Eu vou"}
      </button>
      {lotado && !comAprovacao && <p className="text-tinta-2">Não há mais vagas.</p>}
      <Erro texto={erro} />
    </div>
  );
}

/** Cancelar o pedido (pendente) ou desistir (confirmado). */
export function Sair({ eventoId, pendenteDeAprovacao }: { eventoId: string; pendenteDeAprovacao: boolean }) {
  const { pendente, erro, rodar } = useAcao();
  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="btn btn-qui btn-peq self-start" disabled={pendente} onClick={() => rodar(() => sairDoEvento(eventoId))}>
        {pendenteDeAprovacao ? "Cancelar pedido" : "Desistir"}
      </button>
      <Erro texto={erro} />
    </div>
  );
}

export function CancelarEvento({ eventoId, titulo }: { eventoId: string; titulo: string }) {
  const { pendente, erro, rodar } = useAcao();
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-per btn-peq" onClick={() => setAberto(true)}>
        Cancelar evento
      </button>
      <Dialogo aberto={aberto} aoFechar={() => setAberto(false)} titulo={`Cancelar "${titulo}"?`}>
        <p>Quem ia (e quem tinha pedido para ir) é avisado. Não dá para desfazer.</p>
        <Erro texto={erro} />
        <div className="flex justify-end gap-3">
          <button type="button" className="btn btn-qui" onClick={() => setAberto(false)}>
            Voltar
          </button>
          <button type="button" className="btn btn-per" disabled={pendente} onClick={() => rodar(() => cancelarEvento(eventoId), () => setAberto(false))}>
            {pendente ? "Cancelando…" : "Cancelar evento"}
          </button>
        </div>
      </Dialogo>
    </>
  );
}

/** Aceitar ou recusar um pedido. Recusar não avisa a pessoa nem guarda motivo. */
export function ResponderPedido({ eventoId, pessoaId, nome }: { eventoId: string; pessoaId: string; nome: string }) {
  const { pendente, erro, rodar } = useAcao();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-pri btn-peq" disabled={pendente} aria-label={`Aceitar ${nome}`} onClick={() => rodar(() => responderPedido(eventoId, pessoaId, true))}>
          Aceitar
        </button>
        <button type="button" className="btn btn-qui btn-peq" disabled={pendente} aria-label={`Recusar ${nome}`} onClick={() => rodar(() => responderPedido(eventoId, pessoaId, false))}>
          Recusar
        </button>
      </div>
      <Erro texto={erro} />
    </div>
  );
}

export function RemoverParticipante({ eventoId, pessoaId, nome }: { eventoId: string; pessoaId: string; nome: string }) {
  const { pendente, erro, rodar } = useAcao();
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-qui btn-peq" aria-label={`Remover ${nome}`} onClick={() => setAberto(true)}>
        Remover
      </button>
      <Dialogo aberto={aberto} aoFechar={() => setAberto(false)} titulo={`Remover ${nome} do evento?`}>
        <p>{nome} deixa de ver o local exato, o link e a lista de quem vai, e não é avisado.</p>
        <Erro texto={erro} />
        <div className="flex justify-end gap-3">
          <button type="button" className="btn btn-qui" onClick={() => setAberto(false)}>
            Voltar
          </button>
          <button type="button" className="btn btn-per" disabled={pendente} onClick={() => rodar(() => removerParticipante(eventoId, pessoaId), () => setAberto(false))}>
            Remover
          </button>
        </div>
      </Dialogo>
    </>
  );
}
