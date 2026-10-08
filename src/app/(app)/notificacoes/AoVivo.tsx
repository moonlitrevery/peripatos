"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { marcarNotificacoesLidas } from "@/app/acoes/notificacoes";
import { avisarLeitura, useAvisoDeNotificacao } from "@/lib/tempo-real";

// Abrir a aba marca tudo como lido (a lista desta visita continua mostrando o
// que era novo). Se chegar uma notificação com a aba aberta, a lista recarrega.
export function AoVivo({ uid, haNovas }: { uid: string; haNovas: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!haNovas) return;
    void marcarNotificacoesLidas().then(() => avisarLeitura());
  }, [haNovas]);
  useAvisoDeNotificacao(uid, () => router.refresh());
  return null;
}
