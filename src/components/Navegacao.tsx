"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONES = {
  inicio: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  gente: "M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm8.5 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM1.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6zm14.6 0c0-1.9-.6-3.6-1.7-4.9.7-.2 1.4-.3 2.1-.3 3.2 0 5.5 2 5.5 5.2z",
  mensagens: "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  voce: "M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm-8.5 9c0-4.1 3.8-7 8.5-7s8.5 2.9 8.5 7z",
};

function Icone({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path d={d} fill="currentColor" />
    </svg>
  );
}

const base =
  "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[0.75rem] font-semibold md:flex-row md:gap-2 md:text-sm";

// Quatro abas desde já: Mensagens chega no marco 2 e, quando chegar, nada
// muda de lugar.
export function Navegacao() {
  const caminho = usePathname();
  const abas = [
    { href: "/", rotulo: "Início", icone: ICONES.inicio, ativa: caminho === "/" },
    { href: "/gente", rotulo: "Gente", icone: ICONES.gente, ativa: caminho.startsWith("/gente") || caminho.startsWith("/u/") },
    { href: null, rotulo: "Mensagens", icone: ICONES.mensagens, ativa: false },
    {
      href: "/voce",
      rotulo: "Você",
      icone: ICONES.voce,
      ativa: ["/voce", "/config", "/moderacao"].some((p) => caminho.startsWith(p)),
    },
  ];

  return (
    <nav
      aria-label="Principal"
      className="bg-papel border-linha fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] md:sticky md:top-0 md:bottom-auto md:border-t-0 md:border-b md:pb-0"
    >
      <ul className="mx-auto flex max-w-xl">
        {abas.map((aba) => (
          <li key={aba.rotulo} className="flex flex-1">
            {aba.href ? (
              <Link
                href={aba.href}
                aria-current={aba.ativa ? "page" : undefined}
                className={`${base} ${
                  aba.ativa
                    ? "text-petroleo shadow-[inset_0_3px_0_var(--petroleo)] md:shadow-[inset_0_-3px_0_var(--petroleo)]"
                    : "text-tinta-2"
                }`}
              >
                <Icone d={aba.icone} />
                {aba.rotulo}
              </Link>
            ) : (
              <span aria-disabled="true" className={`${base} text-tinta-2`}>
                <Icone d={aba.icone} />
                <span>
                  {aba.rotulo}
                  <span className="sr-only">, </span>
                  <span className="block text-[0.625rem] font-normal md:ml-1 md:inline">em breve</span>
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
