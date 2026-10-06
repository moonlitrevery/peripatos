import Link from "next/link";
import type { ReactNode } from "react";
import { Marca } from "@/components/Marca";

export function PaginaLegal({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main id="conteudo" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 py-8">
      <Link href="/" className="self-start" aria-label="Peripatos, página inicial">
        <Marca tamanho={32} />
      </Link>
      <p role="note" className="border-perigo text-perigo rounded-2xl border-2 p-3 text-sm font-bold">
        RASCUNHO, revisar antes do lançamento. Este texto ainda não foi revisado por um advogado.
      </p>
      <h1 className="text-4xl font-bold">{titulo}</h1>
      <div className="[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-bold [&_li]:mb-1.5 [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
      <p className="fino">
        <Link href="/termos" className="text-petroleo font-semibold underline underline-offset-4">
          Termos de uso
        </Link>{" "}
        ·{" "}
        <Link href="/privacidade" className="text-petroleo font-semibold underline underline-offset-4">
          Privacidade
        </Link>
      </p>
    </main>
  );
}
