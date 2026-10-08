"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { contarNaoLidas } from "@/app/acoes/mensagens";
import { contarNotificacoes } from "@/app/acoes/notificacoes";
import { Marca } from "@/components/Marca";
import { useAoLer, useAvisoDeNotificacao, useEventosDeMensagem } from "@/lib/tempo-real";

const ICONES = {
  inicio: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  gente: "M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm8.5 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM1.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6zm14.6 0c0-1.9-.6-3.6-1.7-4.9.7-.2 1.4-.3 2.1-.3 3.2 0 5.5 2 5.5 5.2z",
  eventos: "M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1zM5 10v9h14v-9z",
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

// Celular: abas embaixo. Tablet (md): barra lateral estreita, ícone sobre o
// rótulo. Desktop (lg): barra lateral larga, ícone ao lado do rótulo.
const base =
  "aba-nav flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-semibold md:min-h-16 md:flex-none md:rounded-2xl md:py-2 lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:text-base";

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

  const emEventos = caminho.startsWith("/eventos");
  type Aba = { href: string; rotulo: string; icone: string; ativa: boolean; aviso: number; teste: string; ativaNoCelular?: boolean; soTelaLarga?: boolean };
  const abas: Aba[] = [
    { href: "/", rotulo: "Início", icone: ICONES.inicio, ativa: caminho === "/", aviso: 0, teste: "" },
    {
      href: "/gente",
      rotulo: "Gente",
      icone: ICONES.gente,
      ativa: caminho.startsWith("/gente") || caminho.startsWith("/u/"),
      // No celular Eventos mora dentro de Gente (as abas "Pessoas | Eventos"
      // no topo da tela): ali é a aba Gente que fica marcada.
      ativaNoCelular: emEventos,
      aviso: 0,
      teste: "",
    },
    // Só no tablet e no desktop: a barra de baixo do celular fica com cinco itens.
    { href: "/eventos", rotulo: "Eventos", icone: ICONES.eventos, ativa: emEventos, soTelaLarga: true, aviso: 0, teste: "" },
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
      className="bg-papel border-linha fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] md:inset-y-0 md:right-auto md:left-0 md:flex md:w-24 md:flex-col md:gap-6 md:border-t-0 md:border-r md:px-2 md:py-6 md:pb-6 lg:w-60 lg:px-4"
    >
      <Link href="/" aria-label="Peripatos, ir para o Início" className="hidden items-center justify-center gap-3 md:flex lg:justify-start lg:px-4">
        <Marca tamanho={26} />
        <span className="font-display hidden text-xl font-bold lg:inline">Peripatos</span>
      </Link>
      <ul className="mx-auto flex max-w-xl md:mx-0 md:max-w-none md:flex-col md:gap-1">
        {abas.map((aba) => (
          <li key={aba.rotulo} className={`flex-1 md:flex md:flex-none md:flex-col ${aba.soTelaLarga ? "hidden" : "flex"}`}>
            <Link
              href={aba.href}
              aria-current={aba.ativa ? "page" : undefined}
              className={`${base} relative ${
                aba.ativa
                  ? "text-petroleo shadow-[inset_0_3px_0_var(--petroleo)] md:bg-[color-mix(in_srgb,var(--petroleo)_12%,transparent)] md:shadow-none"
                  : aba.ativaNoCelular
                    ? "text-petroleo max-md:shadow-[inset_0_3px_0_var(--petroleo)] md:text-tinta-2"
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
