"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

// Tempo real das mensagens.
//
// Cada pessoa assina UM canal privado, o dela ("usuario:<uid>"). O Realtime
// só deixa entrar quem passa pela política de realtime.messages, e essa
// política só reconhece o canal da própria pessoa. É o banco que decide, a
// cada mensagem, para o canal de quem o aviso vai.
//
// O aviso traz só identificadores. O texto é buscado depois, pela API, onde o
// RLS decide de novo se esta pessoa pode ler.

export type Evento = { tipo: "nova" | "apagada"; conversa: string; mensagem: string };

type Ouvinte = (e: Evento) => void;

// Uma assinatura por aba, compartilhada entre os componentes (o contador da
// navegação e a conversa aberta ouvem o mesmo canal).
let canal: RealtimeChannel | null = null;
let dono: string | null = null;
let conectando: Promise<void> | null = null;
const ouvintes = new Set<Ouvinte>();

// A navegação e a conversa aberta pedem a conexão quase ao mesmo tempo. Sem
// esta guarda as duas passariam pelo "ainda não há canal" e criariam duas
// assinaturas, e cada evento chegaria em dobro.
function conectar(uid: string): Promise<void> {
  if (canal && dono === uid) return Promise.resolve();
  if (conectando && dono === uid) return conectando;
  dono = uid;
  conectando = abrirCanal(uid).finally(() => {
    conectando = null;
  });
  return conectando;
}

async function abrirCanal(uid: string) {
  const supabase = createClient();
  if (canal) {
    await supabase.removeChannel(canal);
    canal = null;
  }
  // O canal privado exige o token do usuário na conexão.
  await supabase.realtime.setAuth();
  canal = supabase
    .channel(`usuario:${uid}`, { config: { private: true } })
    .on("broadcast", { event: "mensagem" }, (m) => {
      const p = m.payload as Partial<Evento> | undefined;
      if (!p || (p.tipo !== "nova" && p.tipo !== "apagada") || typeof p.conversa !== "string" || typeof p.mensagem !== "string") return;
      for (const o of ouvintes) o({ tipo: p.tipo, conversa: p.conversa, mensagem: p.mensagem });
    })
    .subscribe();
}

// Aviso local, só dentro desta aba: "acabei de marcar uma conversa como lida".
// A navegação usa para recontar as não lidas na hora. Não sai do navegador.
const LEITURA = "peripatos:conversa-lida";

export function avisarLeitura() {
  window.dispatchEvent(new Event(LEITURA));
}

export function useAoLer(aoLer: () => void) {
  useEffect(() => {
    window.addEventListener(LEITURA, aoLer);
    return () => window.removeEventListener(LEITURA, aoLer);
  }, [aoLer]);
}

export function useEventosDeMensagem(uid: string, aoReceber: Ouvinte) {
  const atual = useRef(aoReceber);
  useEffect(() => {
    atual.current = aoReceber;
  }, [aoReceber]);

  useEffect(() => {
    const ouvinte: Ouvinte = (e) => atual.current(e);
    ouvintes.add(ouvinte);
    void conectar(uid);
    return () => {
      ouvintes.delete(ouvinte);
      if (ouvintes.size === 0 && canal) {
        void createClient().removeChannel(canal);
        canal = null;
        dono = null;
      }
    };
  }, [uid]);
}
