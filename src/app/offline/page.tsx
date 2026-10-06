import type { Metadata } from "next";
import { Marca } from "@/components/Marca";

export const metadata: Metadata = { title: "Sem conexão" };

// Página estática e sem nenhum dado de usuário: é a única que o service
// worker guarda.
export default function Offline() {
  return (
    <main id="conteudo" className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-5 py-10">
      <Marca tamanho={44} />
      <h1 className="text-3xl font-bold">Você está sem conexão</h1>
      <p className="text-tinta-2">
        O Peripatos precisa de internet para mostrar o que está acontecendo. Assim que a conexão voltar, é só tentar de
        novo.
      </p>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- recarga completa de propósito, para sair do cache */}
      <a href="/" className="btn btn-pri self-start">
        Tentar de novo
      </a>
    </main>
  );
}
