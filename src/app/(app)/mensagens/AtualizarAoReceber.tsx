"use client";

import { useRouter } from "next/navigation";
import { useEventosDeMensagem } from "@/lib/tempo-real";

// Recarrega a lista de conversas quando chega (ou some) uma mensagem.
export function AtualizarAoReceber({ uid }: { uid: string }) {
  const router = useRouter();
  useEventosDeMensagem(uid, () => router.refresh());
  return null;
}
