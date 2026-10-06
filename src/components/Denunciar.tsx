"use client";

import { useState, useTransition } from "react";
import { denunciar } from "@/app/acoes/social";
import { Dialogo } from "@/components/Dialogo";
import { MOTIVOS, type MotivoDenuncia } from "@/lib/denuncias";

type Props = {
  alvo: { postId: string } | { perfilId: string };
  /** Texto do botão que abre o diálogo. */
  rotulo?: string;
  className?: string;
};

export function Denunciar({ alvo, rotulo = "Denunciar", className = "btn btn-qui btn-peq" }: Props) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState<MotivoDenuncia | "">("");
  const [detalhe, setDetalhe] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviada, setEnviada] = useState(false);
  const [pendente, iniciar] = useTransition();
  const ehPost = "postId" in alvo;

  function fechar() {
    setAberto(false);
    setErro(null);
    if (enviada) {
      setEnviada(false);
      setMotivo("");
      setDetalhe("");
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setAberto(true)}>
        {rotulo}
      </button>
      <Dialogo aberto={aberto} aoFechar={fechar} titulo={ehPost ? "Denunciar este post" : "Denunciar este perfil"}>
        {enviada ? (
          <>
            <p role="status">Denúncia enviada. A moderação da sua instituição vai analisar.</p>
            <button type="button" className="btn btn-pri" onClick={fechar}>
              Fechar
            </button>
          </>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!motivo) return setErro("Escolha um motivo.");
              setErro(null);
              iniciar(async () => {
                const r = await denunciar(alvo, motivo, detalhe);
                if (r.ok) setEnviada(true);
                else setErro(r.erro);
              });
            }}
          >
            <p className="fino">Quem foi denunciado não fica sabendo que foi você.</p>
            <div>
              <label htmlFor="denuncia-motivo" className="rotulo">
                Motivo
              </label>
              <select
                id="denuncia-motivo"
                className="campo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value as MotivoDenuncia)}
                required
              >
                <option value="" disabled>
                  Escolha…
                </option>
                {MOTIVOS.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="denuncia-detalhe" className="rotulo">
                Conte o que aconteceu <span className="text-tinta-2 font-normal">(opcional)</span>
              </label>
              <textarea
                id="denuncia-detalhe"
                className="campo"
                rows={3}
                maxLength={1000}
                value={detalhe}
                onChange={(e) => setDetalhe(e.target.value)}
              />
            </div>
            {erro && (
              <p role="alert" className="erro">
                {erro}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button type="button" className="btn btn-qui" onClick={fechar}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-pri" disabled={pendente}>
                {pendente ? "Enviando…" : "Enviar denúncia"}
              </button>
            </div>
          </form>
        )}
      </Dialogo>
    </>
  );
}
