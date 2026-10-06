// Edge Function: processar-avatar
//
// Recebe o caminho de uma foto que a pessoa acabou de enviar para o bucket de
// entrada (`avatar-uploads`) e:
//   1. confere que quem chama é o dono do arquivo;
//   2. decodifica a imagem e a codifica de novo, do zero, em WebP. O arquivo
//      novo é gerado só a partir dos pixels: EXIF (inclusive localização GPS,
//      modelo do aparelho e data), XMP, IPTC, comentários e perfis embutidos
//      não são copiados. Além disso `strip()` remove qualquer perfil que a
//      biblioteca ainda carregasse;
//   3. grava o resultado em `avatars` (onde só esta função escreve), o que
//      coloca a foto na fila de moderação como "pendente";
//   4. apaga o original e as fotos anteriores da pessoa.
//
// Se qualquer passo falhar, o original é apagado do mesmo jeito: um arquivo
// com metadados nunca fica guardado.
//
// É o único lugar do projeto que usa a service role. Ela vem do ambiente do
// Supabase e nunca chega ao navegador.

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
} from "npm:@imagemagick/magick-wasm@0.0.30";

const LADO_MAXIMO = 512;
const TAMANHO_MAXIMO = 2 * 1024 * 1024;

const wasm = await Deno.readFile(
  new URL("magick.wasm", import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.30")),
);
await initializeImageMagick(wasm);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function responder(status: number, corpo: Record<string, unknown>) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function reencodar(original: Uint8Array): Uint8Array {
  return ImageMagick.read(original, (img) => {
    // Aplica a rotação indicada no EXIF aos pixels antes de jogar o EXIF fora,
    // senão a foto de celular sairia deitada.
    img.autoOrient();
    img.strip();
    if (img.width > LADO_MAXIMO || img.height > LADO_MAXIMO) {
      img.resize(LADO_MAXIMO, LADO_MAXIMO);
    }
    img.quality = 82;
    // `data` aponta para a memória do WASM, que é liberada ao sair: copiamos.
    return img.write(MagickFormat.WebP, (data) => new Uint8Array(data));
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return responder(405, { erro: "Método não permitido." });

  const url = Deno.env.get("SUPABASE_URL")!;
  const autorizacao = req.headers.get("Authorization") ?? "";

  // Quem está chamando? Validado no servidor de Auth, com o token da pessoa.
  const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await comoUsuario.auth.getUser();
  if (!user) return responder(401, { erro: "Login necessário." });

  let caminho: unknown;
  try {
    caminho = (await req.json())?.caminho;
  } catch {
    return responder(400, { erro: "Corpo inválido." });
  }
  // Só um arquivo direto na pasta da própria pessoa. Sem subpastas, sem "..".
  if (
    typeof caminho !== "string" ||
    !new RegExp(`^${user.id}/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$`).test(caminho)
  ) {
    return responder(403, { erro: "Este arquivo não é seu." });
  }

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const entrada = admin.storage.from("avatar-uploads");
  const saida = admin.storage.from("avatars");

  const apagarOriginal = () => entrada.remove([caminho as string]);

  const baixado = await entrada.download(caminho);
  if (baixado.error || !baixado.data) return responder(404, { erro: "Arquivo não encontrado." });
  if (baixado.data.size > TAMANHO_MAXIMO) {
    await apagarOriginal();
    return responder(413, { erro: "A imagem é grande demais." });
  }

  let limpa: Uint8Array;
  try {
    limpa = reencodar(new Uint8Array(await baixado.data.arrayBuffer()));
  } catch {
    await apagarOriginal();
    return responder(422, { erro: "Não foi possível ler esta imagem." });
  }

  const novo = `${user.id}/${crypto.randomUUID()}.webp`;
  const gravado = await saida.upload(novo, limpa, { contentType: "image/webp", upsert: false });
  if (gravado.error) {
    await apagarOriginal();
    return responder(500, { erro: "Não foi possível guardar a imagem." });
  }

  // Fotos anteriores da pessoa deixam de existir: só a nova fica.
  const antigas = await saida.list(user.id, { limit: 1000 });
  const paraApagar = (antigas.data ?? [])
    .map((f) => `${user.id}/${f.name}`)
    .filter((c) => c !== novo);
  if (paraApagar.length > 0) await saida.remove(paraApagar);

  await apagarOriginal();

  return responder(200, { caminho: novo });
});
