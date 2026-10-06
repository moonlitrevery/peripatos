import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import exifr from "exifr";
import { admin, clientePorApi, emailDe } from "./apoio";

// Este teste fala direto com a API, sem o app: é o que faria alguém que quer
// pular o redimensionamento do navegador e mandar a foto original, com EXIF.
// A foto de teste tem uma localização GPS nos metadados.
test("a Edge Function tira o EXIF, apaga o original e deixa a foto pendente", async () => {
  const original = readFileSync(path.join(__dirname, "fixtures", "foto-com-gps.jpg"));
  const antes = await exifr.parse(original, { gps: true, tiff: true });
  expect(antes.latitude).toBeCloseTo(-22.325, 3);
  expect(antes.Make).toBe("PeripatosCam");

  const nina = await clientePorApi(emailDe("nina"));
  const { data: sessao } = await nina.auth.getUser();
  const uid = sessao.user!.id;

  const entrada = `${uid}/original.jpg`;
  const envio = await nina.storage.from("avatar-uploads").upload(entrada, original, { contentType: "image/jpeg" });
  expect(envio.error).toBeNull();

  // Ninguém escreve direto no bucket final: só a função.
  const direto = await nina.storage.from("avatars").upload(`${uid}/direto.webp`, original, { contentType: "image/webp" });
  expect(direto.error).not.toBeNull();

  const resposta = await nina.functions.invoke<{ caminho: string }>("processar-avatar", { body: { caminho: entrada } });
  expect(resposta.error).toBeNull();
  const final = resposta.data!.caminho;
  expect(final).toMatch(new RegExp(`^${uid}/[0-9a-f-]+\\.webp$`));

  // O arquivo que ficou guardado não tem EXIF nem GPS.
  const baixado = await admin().storage.from("avatars").download(final);
  expect(baixado.error).toBeNull();
  const bytes = Buffer.from(await baixado.data!.arrayBuffer());
  expect(bytes.subarray(0, 4).toString("latin1")).toBe("RIFF");
  expect(bytes.subarray(8, 12).toString("latin1")).toBe("WEBP");
  expect(bytes.includes(Buffer.from("Exif\0\0", "latin1"))).toBe(false);
  expect(bytes.includes(Buffer.from("PeripatosCam", "latin1"))).toBe(false);
  const depois = await exifr.parse(bytes, { gps: true, tiff: true, exif: true, xmp: true, icc: true }).catch(() => undefined);
  expect(depois?.latitude).toBeUndefined();
  expect(depois?.GPSLatitude).toBeUndefined();
  expect(depois?.Make).toBeUndefined();

  // O original foi apagado e a pasta final tem só a foto reprocessada.
  const sobrou = await admin().storage.from("avatar-uploads").list(uid);
  expect(sobrou.data ?? []).toHaveLength(0);
  const finais = await admin().storage.from("avatars").list(uid);
  expect((finais.data ?? []).map((f) => `${uid}/${f.name}`)).toEqual([final]);

  // E a foto entrou na fila de moderação, sem aparecer para ninguém ainda.
  const perfil = await nina.from("profiles").select("avatar_status, avatar_path").eq("id", uid).single();
  expect(perfil.data).toEqual({ avatar_status: "pendente", avatar_path: final });

  // Ninguém pede o reprocessamento de um arquivo que não é seu.
  const alheio = await nina.functions.invoke("processar-avatar", {
    body: { caminho: "00000000-0000-4000-8000-000000000003/x.jpg" },
  });
  expect(alheio.error).not.toBeNull();
});
