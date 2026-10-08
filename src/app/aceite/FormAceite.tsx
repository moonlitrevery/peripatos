"use client";

import { useState, useTransition } from "react";
import { aceitarTermos } from "@/app/acoes/config";
import { sair } from "@/app/acoes/entrar";
import { ExcluirConta } from "@/app/(app)/config/Formularios";

export function FormAceite({ versao }: { versao: string }) {
  const [aceitou, setAceitou] = useState(false);
  const [recusando, setRecusando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          iniciar(async () => {
            const r = await aceitarTermos(versao);
            // Quando dá certo a ação redireciona e nada volta para cá.
            if (r && !r.ok) setErro(r.erro);
          });
        }}
      >
        <div className="cartao">
          <label htmlFor="novo-aceite" className="flex cursor-pointer items-start gap-3">
            <input
              id="novo-aceite"
              type="checkbox"
              className="mt-1 size-5 shrink-0 accent-[var(--petroleo)]"
              checked={aceitou}
              onChange={(e) => setAceitou(e.target.checked)}
              required
            />
            <span>
              Li e aceito a nova versão dos{" "}
              <a href="/termos" target="_blank" rel="noopener" className="text-petroleo font-semibold underline underline-offset-4">
                Termos de uso
              </a>{" "}
              e da{" "}
              <a href="/privacidade" target="_blank" rel="noopener" className="text-petroleo font-semibold underline underline-offset-4">
                Política de privacidade
              </a>
              <span className="sr-only"> (abrem em outra aba)</span>.
            </span>
          </label>
        </div>
        {erro && (
          <p role="alert" className="erro">
            {erro}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn btn-pri" disabled={!aceitou || pendente}>
            {pendente ? "Um instante…" : "Aceitar e continuar"}
          </button>
          <button type="button" className="btn btn-qui" onClick={() => setRecusando(true)} aria-expanded={recusando}>
            Não aceito
          </button>
        </div>
      </form>

      {recusando && (
        <section className="cartao flex flex-col gap-4" aria-labelledby="t-recusa">
          <h2 id="t-recusa" className="text-xl font-bold">
            Se você não aceita
          </h2>
          <p>
            Sem aceitar a versão nova não dá para continuar usando o Peripatos. Você pode sair e pensar com calma: sua
            conta fica como está, e esta tela volta na próxima vez que você entrar. Ou pode excluir a conta, o que apaga
            seus dados de verdade.
          </p>
          <div className="flex flex-wrap items-start gap-3">
            <form action={sair}>
              <button type="submit" className="btn btn-sec">
                Sair
              </button>
            </form>
            <ExcluirConta />
          </div>
        </section>
      )}
    </div>
  );
}
