// O re-encode em si, separado do servidor HTTP para poder ser testado sozinho
// (reencodar.test.ts). É aqui que os metadados deixam de existir.

import {
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
} from "npm:@imagemagick/magick-wasm@0.0.30";

export const LADO_MAXIMO = 512;

const wasm = await Deno.readFile(
  new URL("magick.wasm", import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.30")),
);
await initializeImageMagick(wasm);

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
