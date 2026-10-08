"use client";

import { createClient } from "@/lib/supabase/client";

// Notificações push pela PWA. A inscrição é deste aparelho e deste navegador.
// Quem guarda e quem pode ler a inscrição é o banco (só a própria pessoa).

export const CHAVE_VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type EstadoDoPush =
  | "indisponivel" // este navegador não tem push, ou o app não tem a chave configurada
  | "instalar" // iPhone/iPad: só funciona com o app na tela inicial
  | "bloqueado" // a pessoa negou a permissão no navegador
  | "desligado"
  | "ligado";

function ehIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function instalado() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function bytesDaChave(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  const bin = atob(b64);
  const saida = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) saida[i] = bin.charCodeAt(i);
  return saida;
}

function emBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  let bin = "";
  for (const b of new Uint8Array(buffer)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function estadoDoPush(): Promise<EstadoDoPush> {
  if (!CHAVE_VAPID) return "indisponivel";
  // No iPhone o push só existe dentro do app instalado; no Safari comum a
  // API nem aparece. Avisar isso é mais útil do que "indisponível".
  if (ehIos() && !instalado()) return "instalar";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "indisponivel";
  if (Notification.permission === "denied") return "bloqueado";
  const registro = await navigator.serviceWorker.getRegistration();
  const inscricao = await registro?.pushManager.getSubscription();
  return inscricao ? "ligado" : "desligado";
}

export async function ligarPush(): Promise<{ ok: true } | { ok: false; erro: string }> {
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") return { ok: false, erro: "Você não autorizou as notificações neste navegador." };

  const registro = await navigator.serviceWorker.ready;
  let inscricao: PushSubscription;
  try {
    inscricao =
      (await registro.pushManager.getSubscription()) ??
      (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesDaChave(CHAVE_VAPID) }));
  } catch {
    return { ok: false, erro: "Não foi possível ativar as notificações neste aparelho." };
  }

  const { error } = await createClient()
    .from("push_subscriptions")
    .insert({
      endpoint: inscricao.endpoint,
      p256dh: emBase64Url(inscricao.getKey("p256dh")),
      auth: emBase64Url(inscricao.getKey("auth")),
    });
  // 23505: este aparelho já estava inscrito.
  if (error && error.code !== "23505") {
    await inscricao.unsubscribe().catch(() => undefined);
    return { ok: false, erro: error.code?.startsWith("PT") ? error.message : "Não foi possível salvar a inscrição." };
  }
  return { ok: true };
}

export async function desligarPush(): Promise<{ ok: true } | { ok: false; erro: string }> {
  const registro = await navigator.serviceWorker.getRegistration();
  const inscricao = await registro?.pushManager.getSubscription();
  if (!inscricao) return { ok: true };
  const { error } = await createClient().from("push_subscriptions").delete().eq("endpoint", inscricao.endpoint);
  if (error) return { ok: false, erro: "Não foi possível desativar. Tente de novo." };
  await inscricao.unsubscribe().catch(() => undefined);
  return { ok: true };
}
