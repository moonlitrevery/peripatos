"use client";

import { useState, useTransition } from "react";
import { mostrarConquista } from "@/app/acoes/conquistas";

// Mostrar ou esconder do perfil uma conquista que a pessoa já tem. Esconder
// não apaga: a conquista continua sendo dela.
export function Visibilidade({ slug, nome, oculta }: { slug: string; nome: string; oculta: boolean }) {
  const [estaOculta, setOculta] = useState(oculta);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        className="btn btn-qui btn-peq"
        disabled={pendente}
        aria-label={`${estaOculta ? "Mostrar no perfil" : "Esconder do perfil"}: ${nome}`}
        onClick={() => {
          setErro(null);
          iniciar(async () => {
            const r = await mostrarConquista(slug, estaOculta);
            if (r.ok) setOculta(!estaOculta);
            else setErro(r.erro);
          });
        }}
      >
        {estaOculta ? "Mostrar no perfil" : "Esconder do perfil"}
      </button>
      <p className="fino" role="status">
        {estaOculta ? "Só você vê." : "Aparece no seu perfil."}
      </p>
      {erro && (
        <p role="alert" className="erro">
          {erro}
        </p>
      )}
    </div>
  );
}
