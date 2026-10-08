"use client";

import { useEffect, useState, useTransition } from "react";
import { desligarPush, estadoDoPush, ligarPush, type EstadoDoPush } from "@/lib/push";

const TEXTO: Record<EstadoDoPush, string> = {
  indisponivel: "Este navegador não tem notificações, ou elas ainda não foram configuradas no Peripatos.",
  instalar:
    "No iPhone e no iPad as notificações só funcionam com o Peripatos instalado: no Safari, toque em Compartilhar e depois em Adicionar à Tela de Início. Abra o app por esse ícone e volte aqui.",
  bloqueado: "As notificações do Peripatos estão bloqueadas neste navegador. Libere nas configurações do site e volte aqui.",
  desligado: "As notificações estão desligadas neste aparelho.",
  ligado: "As notificações estão ligadas neste aparelho.",
};

export function Notificacoes() {
  const [estado, setEstado] = useState<EstadoDoPush | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    void estadoDoPush().then(setEstado);
  }, []);

  function alternar(ligar: boolean) {
    setErro(null);
    iniciar(async () => {
      const r = ligar ? await ligarPush() : await desligarPush();
      if (!r.ok) setErro(r.erro);
      setEstado(await estadoDoPush());
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-tinta-2">
        Avisamos quando chega uma mensagem. A notificação diz só <strong className="text-tinta">de quem é</strong>, nunca
        o que a pessoa escreveu: ela pode aparecer com o celular bloqueado, na frente de quem estiver por perto.
      </p>
      <p role="status" data-testid="estado-do-push">
        {estado === null ? "Conferindo…" : TEXTO[estado]}
      </p>
      {erro && (
        <p role="alert" className="erro">
          {erro}
        </p>
      )}
      {estado === "desligado" && (
        <button type="button" className="btn btn-pri self-start" disabled={pendente} onClick={() => alternar(true)}>
          {pendente ? "Ativando…" : "Ativar notificações neste aparelho"}
        </button>
      )}
      {estado === "ligado" && (
        <button type="button" className="btn btn-qui self-start" disabled={pendente} onClick={() => alternar(false)}>
          {pendente ? "Desativando…" : "Desativar neste aparelho"}
        </button>
      )}
      <p className="fino">
        A escolha vale para este aparelho e este navegador. Quem não entra há muito tempo deixa de receber sozinho.
      </p>
    </div>
  );
}
