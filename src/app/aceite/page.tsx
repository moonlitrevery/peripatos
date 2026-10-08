import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Marca } from "@/components/Marca";
import { MUDANCAS_DA_VERSAO, TERMOS_VERSAO } from "@/lib/legal";
import { exigirSessao } from "@/lib/sessao";
import { FormAceite } from "./FormAceite";

export const metadata: Metadata = { title: "Os termos mudaram" };

// Aparece quando a versão vigente dos Termos é diferente da última que a
// pessoa aceitou. O proxy traz todo mundo nessa situação para cá.
export default async function Aceite() {
  const { supabase } = await exigirSessao();
  const { data } = await supabase.rpc("conta_status");
  const conta = data as { termos_em_dia?: boolean; termos_versao?: string | null; termos_aceitos_em?: string | null } | null;
  if (conta?.termos_em_dia) redirect("/");

  return (
    <main id="conteudo" className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-5 py-8">
      <Marca tamanho={32} />
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Os termos do Peripatos mudaram</h1>
        <p className="text-tinta-2">
          Para continuar usando o app, veja o que mudou e diga se aceita.
          {conta?.termos_aceitos_em && (
            <>
              {" "}
              Você tinha aceitado a versão anterior em{" "}
              <time dateTime={conta.termos_aceitos_em}>
                {new Date(conta.termos_aceitos_em).toLocaleDateString("pt-BR", { dateStyle: "long" })}
              </time>
              .
            </>
          )}
        </p>
      </header>

      <section className="cartao flex flex-col gap-3" aria-labelledby="t-mudou">
        <h2 id="t-mudou" className="text-xl font-bold">
          O que mudou
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          {MUDANCAS_DA_VERSAO.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <p className="fino">Versão {TERMOS_VERSAO}.</p>
      </section>

      <FormAceite versao={TERMOS_VERSAO} />
    </main>
  );
}
