import type { ReactNode } from "react";

// Peças dos esqueletos (loading.tsx). Cada tela monta o seu no formato do
// conteúdo de verdade, para nada pular de lugar quando os dados chegam. O
// título é o texto real: é ele que o leitor de tela anuncia na troca de tela.

export function Esqueleto({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <div data-esqueleto className="flex flex-col gap-5" aria-busy="true">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">{titulo}</h1>
        {subtitulo && <p className="text-tinta-2">{subtitulo}</p>}
      </header>
      <p className="sr-only" role="status">
        Carregando…
      </p>
      <div aria-hidden="true" className="flex flex-col gap-4">
        {children}
      </div>
    </div>
  );
}

export function Osso({ className = "" }: { className?: string }) {
  return <span className={`osso block ${className}`} />;
}

/** O arco do avatar, no tamanho pedido. */
export function OssoDeAvatar({ tamanho = 44 }: { tamanho?: number }) {
  return <span className="osso arco block shrink-0" style={{ width: tamanho, height: tamanho * 1.25 }} />;
}

export function OssoDePost() {
  return (
    <div className="cartao flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <OssoDeAvatar />
        <div className="flex flex-1 flex-col gap-2">
          <Osso className="h-4 w-32" />
          <Osso className="h-3 w-24" />
        </div>
      </div>
      <Osso className="h-4 w-full" />
      <Osso className="h-4 w-3/5" />
    </div>
  );
}
