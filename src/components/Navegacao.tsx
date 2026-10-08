"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { contarNaoLidas } from "@/app/acoes/mensagens";
import { contarNotificacoes } from "@/app/acoes/notificacoes";
import { useAoLer, useAvisoDeNotificacao, useEventosDeMensagem } from "@/lib/tempo-real";

const ICONES = {
  inicio: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  gente: "M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm8.5 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM1.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6zm14.6 0c0-1.9-.6-3.6-1.7-4.9.7-.2 1.4-.3 2.1-.3 3.2 0 5.5 2 5.5 5.2z",
  mensagens: "M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  notificacoes: "M12 22a2.5 2.5 0 0 0 2.4-2H9.6a2.5 2.5 0 0 0 2.4 2zm7-6v-5a7 7 0 0 0-5.5-6.8v-.7a1.5 1.5 0 0 0-3 0v.7A7 7 0 0 0 5 11v5l-2 2v1h18v-1z",
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
  "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-semibold md:flex-row md:gap-2 md:text-sm";

type Props = { uid: string; naoLidasIniciais: number; notificacoesIniciais: number };

// Os contadores de não lidas são só de quem está olhando: vêm do banco para
// esta pessoa e ninguém mais tem acesso ao que ela leu ou deixou de ler.
export function Navegacao({ uid, naoLidasIniciais, notificacoesIniciais }: Props) {
  const caminho = usePathname();
  const [naoLidas, setNaoLidas] = useState(naoLidasIniciais);
  const [notificacoes, setNotificacoes] = useState(notificacoesIniciais);

  // Vários motivos para recontar chegam quase juntos (um evento, uma leitura,
  // uma troca de tela). Junta tudo numa consulta só.
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recontar = useCallback(() => {
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => {
      void contarNaoLidas().then(setNaoLidas);
      void contarNotificacoes().then(setNotificacoes);
    }, 250);
  }, []);
  useEffect(
    () => () => {
      if (espera.current) clearTimeout(espera.current);
    },
    [],
  );
  // chegou ou sumiu uma mensagem
  useEventosDeMensagem(uid, recontar);
  // chegou uma notificação
  useAvisoDeNotificacao(uid, recontar);
  // esta aba acabou de marcar uma conversa (ou as notificações) como lida
  useAoLer(recontar);
  // abrir uma conversa marca como lida: reconta ao trocar de tela
  useEffect(() => {
    recontar();
  }, [caminho, recontar]);

  const abas = [
    { href: "/", rotulo: "Início", icone: ICONES.inicio, ativa: caminho === "/", aviso: 0, teste: "" },
    { href: "/gente", rotulo: "Gente", icone: ICONES.gente, ativa: caminho.startsWith("/gente") || caminho.startsWith("/u/"), aviso: 0, teste: "" },
    { href: "/mensagens", rotulo: "Mensagens", icone: ICONES.mensagens, ativa: caminho.startsWith("/mensagens"), aviso: naoLidas, teste: "nao-lidas" },
    {
      href: "/notificacoes",
      rotulo: "Notificações",
      icone: ICONES.notificacoes,
      ativa: caminho.startsWith("/notificacoes"),
      aviso: notificacoes,
      teste: "notificacoes-nao-lidas",
    },
    {
      href: "/voce",
      rotulo: "Você",
      icone: ICONES.voce,
      ativa: ["/voce", "/config", "/moderacao", "/conquistas"].some((p) => caminho.startsWith(p)),
      aviso: 0,
      teste: "",
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
            <Link
              href={aba.href}
              aria-current={aba.ativa ? "page" : undefined}
              className={`${base} relative ${
                aba.ativa
                  ? "text-petroleo shadow-[inset_0_3px_0_var(--petroleo)] md:shadow-[inset_0_-3px_0_var(--petroleo)]"
                  : "text-tinta-2"
              }`}
            >
              <span className="relative">
                <Icone d={aba.icone} />
                {aba.aviso > 0 && (
                  <span
                    data-testid={aba.teste}
                    className="bg-petroleo text-sobre-petroleo absolute -top-1.5 left-3.5 min-w-5 rounded-full px-1 text-center text-[0.75rem] leading-5 font-bold"
                    aria-hidden="true"
                  >
                    {aba.aviso > 99 ? "99+" : aba.aviso}
                  </span>
                )}
              </span>
              <span>
                {aba.rotulo}
                {aba.aviso > 0 && (
                  <span className="sr-only">
                    , {aba.aviso} {aba.aviso === 1 ? "não lida" : "não lidas"}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
