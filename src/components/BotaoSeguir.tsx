"use client";

import { useRef, useState } from "react";
import { deixarDeSeguir, seguir } from "@/app/acoes/social";

type Props = {
  alvoId: string;
  nome: string;
  seguindoInicial: boolean;
  /** Botão principal da tela (perfil). */
  grande?: boolean;
  /** O botão está num post: seguir por aqui registra de qual post veio. */
  viaPostId?: string;
  /** Avisa quem usa a cada toque (o estado otimista, já na hora). */
  aoMudar?: (seguindo: boolean) => void;
};

// Otimista: o botão muda na hora do toque. Se o servidor recusar (bloqueio,
// limite de follows, sessão caída), volta ao que era e mostra o motivo.
export function BotaoSeguir({ alvoId, nome, seguindoInicial, grande, viaPostId, aoMudar }: Props) {
  const [seguindo, setSeguindo] = useState(seguindoInicial);
  const [erro, setErro] = useState<string | null>(null);
  // O que a pessoa quer (o último toque) e o que o servidor já confirmou. Um
  // segundo toque antes da resposta não se perde: quando a resposta chega, o
  // botão manda o que faltar para os dois ficarem iguais.
  const desejado = useRef(seguindoInicial);
  const confirmado = useRef(seguindoInicial);
  const emCurso = useRef(false);
  // O botão não trava enquanto o servidor responde, mas avisa (aria-busy).
  const [enviando, setEnviando] = useState(false);

  async function sincronizar() {
    emCurso.current = true;
    setEnviando(true);
    while (confirmado.current !== desejado.current) {
      const alvo = desejado.current;
      const r = alvo ? await seguir(alvoId, viaPostId) : await deixarDeSeguir(alvoId);
      if (!r.ok) {
        // O servidor recusou: volta ao último estado que ele confirmou.
        desejado.current = confirmado.current;
        setSeguindo(confirmado.current);
        aoMudar?.(confirmado.current);
        setErro(r.erro);
        break;
      }
      confirmado.current = alvo;
    }
    emCurso.current = false;
    setEnviando(false);
  }

  function alternar() {
    const novo = !seguindo;
    setErro(null);
    setSeguindo(novo);
    aoMudar?.(novo);
    desejado.current = novo;
    if (!emCurso.current) void sincronizar();
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        className={`btn ${grande ? "" : "btn-peq"} ${seguindo ? "btn-sec" : "btn-pri"}`}
        aria-pressed={seguindo}
        aria-busy={enviando}
        aria-label={seguindo ? `Deixar de seguir ${nome}` : `Seguir ${nome}`}
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
