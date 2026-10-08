"use client";

import { useId, useState, useTransition } from "react";
import { denunciarEvento } from "@/app/acoes/eventos";
import { denunciarMensagem } from "@/app/acoes/mensagens";
import { denunciar } from "@/app/acoes/social";
import { Dialogo } from "@/components/Dialogo";
import { MOTIVOS, type MotivoDenuncia } from "@/lib/denuncias";

type Props = {
  alvo: { postId: string } | { perfilId: string } | { mensagemId: string } | { eventoId: string };
  /** Texto do botão que abre o diálogo. */
  rotulo?: string;
  className?: string;
  /**
   * Quando o diálogo é aberto por fora (um item de menu), quem usa controla
   * o estado e o componente não desenha botão nenhum.
   */
  controle?: { aberto: boolean; aoFechar: () => void };
};

export function Denunciar({ alvo, rotulo = "Denunciar", className = "btn btn-qui btn-peq", controle }: Props) {
  const [abertoAqui, setAberto] = useState(false);
  const aberto = controle ? controle.aberto : abertoAqui;
  const [motivo, setMotivo] = useState<MotivoDenuncia | "">("");
  const [detalhe, setDetalhe] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviada, setEnviada] = useState(false);
  const [pendente, iniciar] = useTransition();
  // Numa conversa ou no feed há um destes por item: os campos precisam de
  // ids próprios, senão o rótulo de um aponta para o campo de outro.
  const id = useId();
  const oQue = "postId" in alvo ? "este post" : "mensagemId" in alvo ? "esta mensagem" : "eventoId" in alvo ? "este evento" : "este perfil";

  function fechar() {
    setAberto(false);
    controle?.aoFechar();
    setErro(null);
    if (enviada) {
      setEnviada(false);
      setMotivo("");
      setDetalhe("");
    }
  }

  return (
    <>
      {!controle && (
        <button type="button" className={className} onClick={() => setAberto(true)}>
          {rotulo}
        </button>
      )}
      <Dialogo aberto={aberto} aoFechar={fechar} titulo={`Denunciar ${oQue}`}>
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
                const r =
                  "mensagemId" in alvo
                    ? await denunciarMensagem(alvo.mensagemId, motivo, detalhe)
                    : "eventoId" in alvo
                      ? await denunciarEvento(alvo.eventoId, motivo, detalhe)
                      : await denunciar(alvo, motivo, detalhe);
                if (r.ok) setEnviada(true);
                else setErro(r.erro);
              });
            }}
          >
            <p className="fino">Quem foi denunciado não fica sabendo que foi você.</p>
            {"eventoId" in alvo && (
              <p className="fino">
                A moderação recebe uma cópia do título, da descrição e do local geral. Ela não vê o local exato, o link
                nem quem vai.
              </p>
            )}
            {"mensagemId" in alvo && (
              <p className="fino">
                A moderação recebe uma cópia desta mensagem, e só dela. Ela não tem acesso ao resto da conversa.
              </p>
            )}
            <div>
              <label htmlFor={`${id}-motivo`} className="rotulo">
                Motivo
              </label>
              <select
                id={`${id}-motivo`}
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
              <label htmlFor={`${id}-detalhe`} className="rotulo">
                Conte o que aconteceu <span className="text-tinta-2 font-normal">(opcional)</span>
              </label>
              <textarea
                id={`${id}-detalhe`}
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
