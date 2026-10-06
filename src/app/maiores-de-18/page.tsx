import type { Metadata } from "next";
import Link from "next/link";
import { Marca } from "@/components/Marca";

export const metadata: Metadata = { title: "Para maiores de 18" };

// Para onde vai quem informou data de menor no onboarding. A conta já foi
// apagada pelo banco e a sessão encerrada, então a página é pública e
// estática: não sabe (nem guarda) quem chegou aqui.
export default function MaioresDe18() {
  return (
    <main id="conteudo" className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-5 py-10">
      <Marca tamanho={44} />
      <h1 className="text-3xl font-bold">O Peripatos é para maiores de 18</h1>
      <p>Volte quando fizer aniversário.</p>
      <p className="text-tinta-2">
        Apagamos os dados deste cadastro agora: seu e-mail, seu RA e a data que você informou não ficaram guardados.
      </p>
      <Link href="/entrar" className="btn btn-qui self-start">
        Voltar ao início
      </Link>
    </main>
  );
}
