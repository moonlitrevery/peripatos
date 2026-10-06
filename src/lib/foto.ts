import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const LADO = 512;

// Reduz para caber em 512x512 e converte para WebP no próprio navegador.
// Desenhar no canvas já descarta os metadados, mas isso é só economia de
// banda: a garantia de que não sobra EXIF é o re-encode na Edge Function.
export async function redimensionar(arquivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  const escala = Math.min(1, LADO / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponível");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("falha ao converter"))), "image/webp", 0.85);
  });
}

// Envia para o bucket de entrada e pede o reprocessamento. A foto só passa a
// existir para a moderação depois que a Edge Function a re-encoda.
export async function enviarFoto(
  supabase: SupabaseClient<Database>,
  uid: string,
  arquivo: File,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!arquivo.type.startsWith("image/")) return { ok: false, erro: "Escolha um arquivo de imagem." };

  let blob: Blob;
  try {
    blob = await redimensionar(arquivo);
  } catch {
    return { ok: false, erro: "Não conseguimos ler esta imagem. Tente outra, em JPEG ou PNG." };
  }

  const caminho = `${uid}/${crypto.randomUUID()}.webp`;
  const envio = await supabase.storage.from("avatar-uploads").upload(caminho, blob, { contentType: "image/webp" });
  if (envio.error) return { ok: false, erro: "Não foi possível enviar a foto. Tente de novo." };

  const { error } = await supabase.functions.invoke("processar-avatar", { body: { caminho } });
  if (error) {
    await supabase.storage.from("avatar-uploads").remove([caminho]);
    return { ok: false, erro: "Não foi possível processar a foto. Tente de novo." };
  }
  return { ok: true };
}
