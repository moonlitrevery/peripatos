import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirSessao, meuCargo, nivelDaSessao } from "@/lib/sessao";
import { FormVerificacao } from "./FormVerificacao";

export const metadata: Metadata = { title: "Verificação em duas etapas" };

export default async function Verificacao() {
  const { supabase } = await exigirSessao();
  const cargo = await meuCargo();
  if (!cargo) redirect("/");
  if ((await nivelDaSessao()) === "aal2") redirect("/moderacao");

  const { data: fatores } = await supabase.auth.mfa.listFactors();
  const fator = fatores?.totp[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/voce" className="text-petroleo text-sm font-semibold underline underline-offset-4">
          ‹ Você
        </Link>
        <h1 className="text-3xl font-bold">Verificação em duas etapas</h1>
      </header>
      <p className="text-tinta-2">
        Quem modera vê denúncias e pode ocultar posts e banir contas. Por isso o Peripatos pede, além do código do
        e-mail, um código do seu aplicativo autenticador a cada login.
      </p>
      <FormVerificacao fatorId={fator?.id ?? null} />
    </div>
  );
}
