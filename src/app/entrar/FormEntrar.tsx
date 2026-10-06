"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { pedirCodigo, verificarCodigo } from "@/app/acoes/entrar";

const ESPERA_REENVIO = 60;

export function FormEntrar() {
  const [etapa, setEtapa] = useState<"email" | "codigo">("email");
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [resta, setResta] = useState(0);
  const [pendente, iniciar] = useTransition();
  const campoCodigo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resta <= 0) return;
    const t = setTimeout(() => setResta((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [resta]);

  useEffect(() => {
    if (etapa === "codigo") campoCodigo.current?.focus();
  }, [etapa]);

  function enviar(reenvio: boolean) {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await pedirCodigo(email);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setEtapa("codigo");
      setResta(ESPERA_REENVIO);
      if (reenvio) setAviso("Enviamos um código novo. O anterior deixou de valer.");
    });
  }

  function verificar() {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await verificarCodigo(email, codigo);
      // Quando dá certo a ação redireciona e nada volta para cá.
      if (r && !r.ok) {
        setErro(r.erro);
        setCodigo("");
        campoCodigo.current?.focus();
      }
    });
  }

  const tempo = `${Math.floor(resta / 60)}:${String(resta % 60).padStart(2, "0")}`;

  if (etapa === "email") {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          enviar(false);
        }}
        noValidate
      >
        <div>
          <label htmlFor="email" className="rotulo">
            E-mail institucional
          </label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-describedby={erro ? "email-ajuda email-erro" : "email-ajuda"}
            aria-invalid={erro ? true : undefined}
            placeholder="nome.RA@alunos.unisagrado.edu.br"
            className="campo"
          />
          <p id="email-ajuda" className="ajuda">
            Mandamos um código de 6 dígitos. Sem senha e sem link.
          </p>
        </div>
        {erro && (
          <p id="email-erro" role="alert" className="erro">
            {erro}
          </p>
        )}
        <button type="submit" className="btn btn-pri" disabled={pendente || email.trim() === ""}>
          {pendente ? "Enviando…" : "Receber código"}
        </button>
      </form>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        verificar();
      }}
      noValidate
    >
      <p>
        Enviamos um código para <strong className="break-all">{email}</strong>.
      </p>
      <div>
        <label htmlFor="codigo" className="rotulo">
          Código de 6 dígitos
        </label>
        <input
          ref={campoCodigo}
          id="codigo"
          name="codigo"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          required
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
          aria-describedby={erro ? "codigo-erro" : undefined}
          aria-invalid={erro ? true : undefined}
          className="campo font-display text-center text-2xl font-bold tracking-[0.5em] tabular-nums"
        />
      </div>
      {erro && (
        <p id="codigo-erro" role="alert" className="erro">
          {erro}
        </p>
      )}
      {aviso && (
        <p role="status" className="fino">
          {aviso}
        </p>
      )}
      <button type="submit" className="btn btn-pri" disabled={pendente || codigo.length !== 6}>
        {pendente ? "Conferindo…" : "Entrar"}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="btn btn-qui btn-peq" disabled={pendente || resta > 0} onClick={() => enviar(true)}>
          {resta > 0 ? `Reenviar em ${tempo}` : "Reenviar código"}
        </button>
        <button
          type="button"
          className="text-petroleo text-sm font-semibold underline underline-offset-4"
          onClick={() => {
            setEtapa("email");
            setCodigo("");
            setErro(null);
            setAviso(null);
          }}
        >
          Usar outro e-mail
        </button>
      </div>
    </form>
  );
}
