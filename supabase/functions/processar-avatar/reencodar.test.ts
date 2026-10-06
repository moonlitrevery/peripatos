// Prova de que a imagem que sai do re-encode não carrega EXIF.
//
//   pnpm test:exif      (não precisa de Docker nem do Supabase rodando)
//
// A fixture é um JPEG de 1200x900 com um bloco EXIF de verdade: fabricante,
// orientação e uma localização GPS (22°19'30"S 49°04'15"W). O primeiro teste
// confere que a fixture tem mesmo esses dados; sem isso, "a saída não tem
// EXIF" não provaria nada.

import { assert, assertEquals } from "jsr:@std/assert@1";
import exifr from "npm:exifr@7";
import { LADO_MAXIMO, reencodar } from "./reencodar.ts";

const fixture = await Deno.readFile(
  new URL("../../../e2e/fixtures/foto-com-gps.jpg", import.meta.url),
);

const TUDO = { tiff: true, exif: true, gps: true, xmp: true, iptc: true, icc: true, jfif: true, ihdr: true };

function contem(bytes: Uint8Array, texto: string): boolean {
  const alvo = new TextEncoder().encode(texto);
  externo: for (let i = 0; i <= bytes.length - alvo.length; i++) {
    for (let j = 0; j < alvo.length; j++) if (bytes[i + j] !== alvo[j]) continue externo;
    return true;
  }
  return false;
}

// Nomes dos blocos (chunks) do contêiner RIFF de um WebP.
function chunksDoWebp(bytes: Uint8Array): string[] {
  const nomes: string[] = [];
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 12; i + 8 <= bytes.length;) {
    nomes.push(new TextDecoder().decode(bytes.subarray(i, i + 4)));
    const tamanho = dv.getUint32(i + 4, true);
    i += 8 + tamanho + (tamanho % 2);
  }
  return nomes;
}

Deno.test("a fixture tem EXIF com localização GPS", async () => {
  const meta = await exifr.parse(fixture, TUDO);
  assertEquals(meta.Make, "PeripatosCam");
  assertEquals(Math.round(meta.latitude * 1000), -22325);
  assertEquals(Math.round(meta.longitude * 1000), -49071);
  assert(contem(fixture, "Exif\0\0"));
});

Deno.test("a imagem reprocessada é um WebP sem EXIF, GPS, XMP nem perfil ICC", async () => {
  const saida = reencodar(fixture);

  // É um WebP de verdade…
  assertEquals(new TextDecoder().decode(saida.subarray(0, 4)), "RIFF");
  assertEquals(new TextDecoder().decode(saida.subarray(8, 12)), "WEBP");

  // …sem nenhum bloco de metadados no contêiner…
  const chunks = chunksDoWebp(saida);
  for (const proibido of ["EXIF", "XMP ", "ICCP"]) {
    assert(!chunks.includes(proibido), `o WebP final tem o bloco ${proibido}: ${chunks.join(",")}`);
  }

  // …sem nada que um leitor de EXIF encontre…
  const meta = await exifr.parse(saida, TUDO).catch(() => undefined);
  assertEquals(meta?.latitude, undefined);
  assertEquals(meta?.longitude, undefined);
  assertEquals(meta?.GPSLatitude, undefined);
  assertEquals(meta?.Make, undefined);
  assertEquals(await exifr.gps(saida).catch(() => undefined), undefined);

  // …e sem os bytes que estavam no original.
  assert(!contem(saida, "Exif\0\0"));
  assert(!contem(saida, "PeripatosCam"));
});

Deno.test("a imagem reprocessada cabe em 512x512", () => {
  const saida = reencodar(fixture);
  const dv = new DataView(saida.buffer, saida.byteOffset, saida.byteLength);
  const tipo = new TextDecoder().decode(saida.subarray(12, 16));
  let largura: number, altura: number;
  if (tipo === "VP8 ") {
    largura = dv.getUint16(26, true) & 0x3fff;
    altura = dv.getUint16(28, true) & 0x3fff;
  } else if (tipo === "VP8X") {
    largura = 1 + (dv.getUint32(24, true) & 0xffffff);
    altura = 1 + (dv.getUint32(27, true) & 0xffffff);
  } else {
    throw new Error(`formato WebP inesperado: ${tipo}`);
  }
  assert(largura <= LADO_MAXIMO && altura <= LADO_MAXIMO, `${largura}x${altura}`);
  assertEquals([largura, altura], [512, 384]);
});

Deno.test("arquivo que não é imagem é recusado", () => {
  let recusou = false;
  try {
    reencodar(new TextEncoder().encode("isto não é uma imagem"));
  } catch {
    recusou = true;
  }
  assert(recusou);
});
