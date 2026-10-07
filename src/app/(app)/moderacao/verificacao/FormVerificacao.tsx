"use client";

import { useState, useTransition } from "react";
import { confirmarCodigo, iniciarCadastro, type Cadastro } from "@/app/acoes/mfa";

// Dois caminhos na mesma tela:
//   - já tem autenticador: só digita o código;
//   - ainda não tem: mostra o QR code, a pessoa cadastra e digita o código.
export function FormVerificacao({ fatorId }: { fatorId: string | null }) {
  const [cadastro, setCadastro] = useState<Cadastro | null>(null);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const fator = fatorId ?? cadastro?.fatorId ?? null;

  if (!fator) {
    return (
      <section className="cartao flex flex-col gap-4">
        <h2 className="text-xl font-bold">Configurar o autenticador</h2>
        <p>
          Você vai precisar de um aplicativo autenticador no celular (Google Authenticator, Aegis, 1Password ou
          parecido).
        </p>
        {erro && (
          <p role="alert" className="erro">
            {erro}
          </p>
        )}
        <button
          type="button"
          className="btn btn-pri self-start"
          disabled={pendente}
          onClick={() => {
            setErro(null);
            iniciar(async () => {
              const r = await iniciarCadastro();
              if (r.ok) setCadastro(r.dados);
              else setErro(r.erro);
            });
          }}
        >
          {pendente ? "Um instante…" : "Começar"}
        </button>
      </section>
    );
  }

  return (
    <form
      className="cartao flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        iniciar(async () => {
          const r = await confirmarCodigo(fator, codigo);
          // Quando dá certo a ação redireciona e nada volta para cá.
          if (r && !r.ok) {
            setErro(r.erro);
            setCodigo("");
          }
        });
      }}
    >
      {cadastro ? (
        <>
          <h2 className="text-xl font-bold">Leia o código com o aplicativo</h2>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR code gerado pelo Auth, como data: URL */}
          <img src={cadastro.qr} alt="QR code para o aplicativo autenticador" width={192} height={192} className="self-start rounded-xl bg-white p-2" />
          <div>
            <p className="rotulo">Não consegue ler? Digite esta chave no aplicativo:</p>
            <code data-testid="segredo-totp" className="bg-papel-2 block rounded-xl p-3 text-sm break-all">
              {cadastro.segredo}
            </code>
            <p className="ajuda">Esta chave aparece só agora. Não a envie para ninguém.</p>
          </div>
        </>
      ) : (
        <h2 className="text-xl font-bold">Confirme com o autenticador</h2>
      )}
      <div>
        <label htmlFor="codigo-totp" className="rotulo">
          Código do autenticador
        </label>
        <input
          id="codigo-totp"
          className="campo tracking-[0.3em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
          required
        />
      </div>
      {erro && (
        <p role="alert" className="erro">
          {erro}
        </p>
      )}
      <button type="submit" className="btn btn-pri self-start" disabled={pendente || codigo.length !== 6}>
        {pendente ? "Conferindo…" : "Confirmar"}
      </button>
    </form>
  );
}
