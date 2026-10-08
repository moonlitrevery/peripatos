"use client";

import { useState } from "react";
import { Denunciar } from "@/components/Denunciar";
import { MenuDeAcoes } from "@/components/MenuDeAcoes";

// O que é raro no post de outra pessoa (denunciar) fica nos três pontos, como
// no perfil. Vale onde quer que o post apareça: no feed e no perfil do autor.
export function MenuDoPost({ id, nome }: { id: string; nome: string }) {
  const [denunciando, setDenunciando] = useState(false);
  return (
    <>
      <MenuDeAcoes
        rotulo={`Mais ações para o post de ${nome}`}
        lado="esquerda"
        itens={[{ rotulo: "Denunciar", aoEscolher: () => setDenunciando(true) }]}
      />
      <Denunciar alvo={{ postId: id }} controle={{ aberto: denunciando, aoFechar: () => setDenunciando(false) }} />
    </>
  );
}
