import type { Metadata } from "next";
import Link from "next/link";
import { Marca } from "@/components/Marca";
import { FormEntrar } from "./FormEntrar";

export const metadata: Metadata = { title: "Entrar" };

const AVISOS: Record<string, string> = {
  excluida: "Sua conta foi excluída. Seus dados foram apagados.",
  "saiu-de-tudo": "Você saiu de todos os dispositivos.",
  menor: "O Peripatos é para maiores de 18. Volte quando fizer aniversário. Apagamos os dados deste cadastro.",
};

export default async function Entrar({ searchParams }: PageProps<"/entrar">) {
  const { conta } = await searchParams;
  const aviso = typeof conta === "string" ? AVISOS[conta] : undefined;

  return (
    <main id="conteudo" className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-5 py-10">
      <header className="flex flex-col gap-4">
        <Marca tamanho={44} />
        <h1 className="text-4xl leading-[1.05] font-bold">Peripatos</h1>
        <p className="text-tinta-2">
          Gente da sua universidade que gosta do que você gosta.
        </p>
        <p className="fino">
          Projeto independente. Não é um serviço oficial nem tem vínculo com nenhuma universidade.
        </p>
      </header>

      {aviso && (
        <p role="status" className="cartao font-semibold">
          {aviso}
        </p>
      )}

      <FormEntrar />

      <p className="fino">
        Antes de criar seu perfil você vai ler e aceitar os{" "}
        <Link href="/termos" className="text-petroleo font-semibold underline underline-offset-4">
          Termos de uso
        </Link>{" "}
        e a{" "}
        <Link href="/privacidade" className="text-petroleo font-semibold underline underline-offset-4">
          Política de privacidade
        </Link>
        . Seu e-mail e seu RA nunca aparecem para ninguém.
      </p>
    </main>
  );
}
