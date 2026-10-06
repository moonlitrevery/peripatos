"use client";

import { useId, useState, useTransition } from "react";
import { Dialogo } from "@/components/Dialogo";
import type { Resultado } from "@/lib/erros";

type Props = {
  rotulo: string;
  titulo: string;
  explicacao?: string;
  perigo?: boolean;
  /** Server action já amarrada ao alvo; recebe só o motivo. */
  acao: (motivo: string) => Promise<Resultado>;
};

// Toda ação de moderação pede um motivo por escrito, que fica na auditoria.
export function AcaoComMotivo({ rotulo, titulo, explicacao, perigo, acao }: Props) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <>
      <button type="button" className={`btn btn-peq ${perigo ? "btn-per" : "btn-qui"}`} onClick={() => setAberto(true)}>
        {rotulo}
      </button>
      <Dialogo aberto={aberto} aoFechar={() => setAberto(false)} titulo={titulo}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            iniciar(async () => {
              const r = await acao(motivo);
              if (r.ok) {
                setAberto(false);
                setMotivo("");
              } else setErro(r.erro);
            });
          }}
        >
          {explicacao && <p className="text-tinta-2">{explicacao}</p>}
          <div>
            <label htmlFor={id} className="rotulo">
              Motivo
            </label>
            <textarea id={id} className="campo" rows={3} maxLength={1000} value={motivo} onChange={(e) => setMotivo(e.target.value)} required />
            <p className="ajuda">Fica registrado na trilha de moderação, com seu nome.</p>
          </div>
          {erro && (
            <p role="alert" className="erro">
              {erro}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" className="btn btn-qui" onClick={() => setAberto(false)}>
              Cancelar
            </button>
            <button type="submit" className={`btn ${perigo ? "btn-per" : "btn-pri"}`} disabled={pendente || motivo.trim().length < 3}>
              {pendente ? "Um instante…" : rotulo}
            </button>
          </div>
        </form>
      </Dialogo>
    </>
  );
}
