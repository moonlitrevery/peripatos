"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

type Props = {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  children: ReactNode;
};

// <dialog> nativo: prende o foco, fecha com Esc e devolve o foco ao botão
// que abriu, sem biblioteca.
export function Dialogo({ aberto, aoFechar, titulo, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      onClose={aoFechar}
      onClick={(e) => {
        if (e.target === ref.current) aoFechar();
      }}
      aria-labelledby={idTitulo}
      className="bg-papel text-tinta border-linha m-auto w-[min(92vw,26rem)] rounded-[24px] border p-0 backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-4 p-5">
        <h2 id={idTitulo} className="text-xl font-bold">
          {titulo}
        </h2>
        {children}
      </div>
    </dialog>
  );
}
