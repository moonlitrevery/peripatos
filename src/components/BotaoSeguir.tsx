"use client";

import { useState, useTransition } from "react";
import { deixarDeSeguir, seguir } from "@/app/acoes/social";

type Props = { alvoId: string; nome: string; seguindoInicial: boolean };

export function BotaoSeguir({ alvoId, nome, seguindoInicial }: Props) {
  const [seguindo, setSeguindo] = useState(seguindoInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function alternar() {
    const era = seguindo;
    setErro(null);
    setSeguindo(!era);
    iniciar(async () => {
      const r = era ? await deixarDeSeguir(alvoId) : await seguir(alvoId);
      if (!r.ok) {
        setSeguindo(era);
        setErro(r.erro);
      }
    });
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        className={`btn btn-peq ${seguindo ? "btn-sec" : "btn-pri"}`}
        aria-pressed={seguindo}
        aria-label={seguindo ? `Deixar de seguir ${nome}` : `Seguir ${nome}`}
        disabled={pendente}
        onClick={alternar}
      >
        {seguindo ? "Seguindo" : "Seguir"}
      </button>
      {erro && (
        <span role="alert" className="erro">
          {erro}
        </span>
      )}
    </span>
  );
}
