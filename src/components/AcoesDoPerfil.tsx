"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { abrirConversa } from "@/app/acoes/mensagens";
import { bloquear, removerSeguidor } from "@/app/acoes/social";
import { BotaoSeguir } from "@/components/BotaoSeguir";
import { Denunciar } from "@/components/Denunciar";
import { Dialogo } from "@/components/Dialogo";

type Props = { alvoId: string; nome: string; seguindo: boolean; segueVoce: boolean };

export function AcoesDoPerfil({ alvoId, nome, seguindo, segueVoce }: Props) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-2">
        <BotaoSeguir alvoId={alvoId} nome={nome} seguindoInicial={seguindo} />
        {/* Só aparece para mútuos. Esconder é conforto: quem tentar sem ser
            mútuo recebe a recusa do banco. */}
        {seguindo && segueVoce && (
          <button
            type="button"
            className="btn btn-sec btn-peq"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await abrirConversa(alvoId);
                if (r && !r.ok) setErro(r.erro);
              })
            }
          >
            Mensagem
          </button>
        )}
        {segueVoce && (
          <button
            type="button"
            className="btn btn-qui btn-peq"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await removerSeguidor(alvoId);
                if (r.ok) router.refresh();
                else setErro(r.erro);
              })
            }
          >
            Remover dos seus seguidores
          </button>
        )}
        <Denunciar alvo={{ perfilId: alvoId }} />
        <button type="button" className="btn btn-per btn-peq" onClick={() => setConfirmando(true)}>
          Bloquear
        </button>
      </div>
      {erro && (
        <p role="alert" className="erro">
          {erro}
        </p>
      )}

      <Dialogo aberto={confirmando} aoFechar={() => setConfirmando(false)} titulo={`Bloquear ${nome}?`}>
        <p>
          Vocês deixam de se ver: perfil, posts e gostos somem para os dois lados, e quem seguia quem deixa de seguir.
          {" "}{nome} não é avisado.
        </p>
        <p className="fino">Você pode desbloquear depois em Configurações.</p>
        <div className="flex justify-end gap-3">
          <button type="button" className="btn btn-qui" onClick={() => setConfirmando(false)}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-per"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await bloquear(alvoId);
                if (r.ok) {
                  router.replace("/gente");
                  router.refresh();
                } else {
                  setErro(r.erro);
                  setConfirmando(false);
                }
              })
            }
          >
            {pendente ? "Bloqueando…" : "Bloquear"}
          </button>
        </div>
      </Dialogo>
    </div>
  );
}
