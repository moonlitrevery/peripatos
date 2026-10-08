"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export type ItemDoMenu = { rotulo: string; aoEscolher: () => void; perigo?: boolean };

// Menu de "mais ações" (os três pontos). Segue o padrão de botão de menu:
//   - o botão diz que abre um menu e se está aberto (aria-haspopup, aria-expanded);
//   - Enter, Espaço ou seta para baixo abrem e levam o foco ao primeiro item;
//   - setas andam pelos itens, Home e End vão às pontas;
//   - Esc fecha e devolve o foco ao botão; Tab ou clicar fora fecham.
// `lado` diz para onde a lista abre: à direita do botão (padrão) ou, quando o
// botão fica na borda direita do cartão, para a esquerda.
export function MenuDeAcoes({ rotulo, itens, lado = "direita" }: { rotulo: string; itens: ItemDoMenu[]; lado?: "direita" | "esquerda" }) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);

  const focar = (i: number) => {
    const alvos = lista.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    if (!alvos || alvos.length === 0) return;
    alvos[(i + alvos.length) % alvos.length]?.focus();
  };

  useEffect(() => {
    if (!aberto) return;
    focar(0);
    const fora = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberto]);

  function fechar(devolverFoco: boolean) {
    setAberto(false);
    if (devolverFoco) botao.current?.focus();
  }

  function teclaNoMenu(e: KeyboardEvent<HTMLDivElement>) {
    const alvos = [...(lista.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const atual = alvos.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focar(atual + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focar(atual - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focar(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focar(alvos.length - 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      fechar(true);
    } else if (e.key === "Tab") {
      setAberto(false);
    }
  }

  return (
    <div ref={raiz} className="relative">
      <button
        ref={botao}
        type="button"
        className="btn btn-qui btn-peq min-h-11 w-11 px-0"
        aria-label={rotulo}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? id : undefined}
        onClick={() => setAberto((a) => !a)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !aberto) {
            e.preventDefault();
            setAberto(true);
          }
        }}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <circle cx="5" cy="12" r="2" fill="currentColor" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
          <circle cx="19" cy="12" r="2" fill="currentColor" />
        </svg>
      </button>
      {aberto && (
        <div
          ref={lista}
          id={id}
          role="menu"
          aria-label={rotulo}
          onKeyDown={teclaNoMenu}
          className={`bg-papel border-linha absolute z-20 mt-2 flex w-64 flex-col rounded-2xl border p-1.5 shadow-lg ${lado === "esquerda" ? "right-0" : "left-0"}`}
        >
          {itens.map((item) => (
            <button
              key={item.rotulo}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={`item-do-menu ${item.perigo ? "item-do-menu-perigo" : ""}`}
              onClick={() => {
                // Fecha antes: o que o item abre (um diálogo) leva o foco consigo.
                // O foco passa pelo botão para o diálogo ter para onde devolvê-lo
                // ao fechar (o item do menu já não existe mais).
                setAberto(false);
                botao.current?.focus();
                item.aoEscolher();
              }}
            >
              {item.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
