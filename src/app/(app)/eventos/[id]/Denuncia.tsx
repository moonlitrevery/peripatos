"use client";

import { Denunciar } from "@/components/Denunciar";

export function DenunciarEvento({ eventoId }: { eventoId: string }) {
  return <Denunciar alvo={{ eventoId }} rotulo="Denunciar evento" className="fino underline underline-offset-4" />;
}
