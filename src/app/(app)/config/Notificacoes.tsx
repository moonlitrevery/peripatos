"use client";

import { useEffect, useState, useTransition } from "react";
import { salvarPushPorTipo, type PushPorTipo } from "@/app/acoes/notificacoes";
import { desligarPush, estadoDoPush, ligarPush, type EstadoDoPush } from "@/lib/push";

const TIPOS: { chave: keyof PushPorTipo; rotulo: string }[] = [
  { chave: "mensagem", rotulo: "Mensagens novas" },
  { chave: "mutuo", rotulo: "Quando você e alguém viram mútuos" },
  { chave: "novo_seguidor", rotulo: "Novos seguidores" },
  { chave: "conquista", rotulo: "Conquistas novas" },
  { chave: "avatar", rotulo: "Foto aprovada ou recusada" },
  { chave: "denuncia", rotulo: "Denúncia analisada" },
  { chave: "termos", rotulo: "Termos atualizados" },
];

const TEXTO: Record<EstadoDoPush, string> = {
  indisponivel: "Este navegador não tem notificações, ou elas ainda não foram configuradas no Peripatos.",
  instalar:
    "No iPhone e no iPad as notificações só funcionam com o Peripatos instalado: no Safari, toque em Compartilhar e depois em Adicionar à Tela de Início. Abra o app por esse ícone e volte aqui.",
  bloqueado: "As notificações do Peripatos estão bloqueadas neste navegador. Libere nas configurações do site e volte aqui.",
  desligado: "As notificações estão desligadas neste aparelho.",
  ligado: "As notificações estão ligadas neste aparelho.",
};

export function Notificacoes({ porTipo }: { porTipo: PushPorTipo }) {
  const [tipos, setTipos] = useState(porTipo);
  const [salvo, setSalvo] = useState<string | null>(null);
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

  // Cada caixa salva na hora. Se o banco recusar, a caixa volta ao que era.
  function alternarTipo(chave: keyof PushPorTipo, valor: boolean) {
    const antes = tipos;
    const depois = { ...tipos, [chave]: valor };
    setTipos(depois);
    setErro(null);
    setSalvo(null);
    iniciar(async () => {
      const r = await salvarPushPorTipo(depois);
      if (r.ok) setSalvo("Escolha salva.");
      else {
        setTipos(antes);
        setErro(r.erro);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-tinta-2">
        Você escolhe o que vira aviso no aparelho. O aviso de mensagem diz só{" "}
        <strong className="text-tinta">de quem é</strong>, nunca o que a pessoa escreveu. Os outros dizem só o que
        aconteceu, sem o nome de ninguém: eles podem aparecer com o celular bloqueado, na frente de quem estiver por perto.
      </p>
      <fieldset className="flex flex-col gap-1">
        <legend className="rotulo">Avisar no aparelho sobre</legend>
        {TIPOS.map((t) => (
          <label key={t.chave} className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              className="accent-petroleo h-5 w-5 shrink-0"
              checked={tipos[t.chave]}
              onChange={(e) => alternarTipo(t.chave, e.target.checked)}
            />
            {t.rotulo}
          </label>
        ))}
        <p className="fino min-h-5" role="status" data-testid="push-por-tipo">
          {salvo}
        </p>
      </fieldset>
      {/* O estado deste aparelho só é conhecido no navegador, depois que a
          tela já apareceu: "Conferindo…" vira um parágrafo de várias linhas e,
          às vezes, um botão. O espaço fica reservado desde o início (cabe o
          texto mais longo, ou o texto curto com o botão) para que nada abaixo
          mude de lugar. Logo depois vêm "Sair de todos os dispositivos" e
          "Excluir minha conta": um botão que anda debaixo do dedo, ali, é o
          toque caindo no lugar errado. */}
      <div className="flex min-h-40 flex-col gap-4">
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
      </div>
      <p className="fino">
        Os tipos valem para a sua conta. Ativar ou desativar vale para este aparelho e este navegador. Quem não entra há muito tempo deixa de receber sozinho.
      </p>
    </div>
  );
}
