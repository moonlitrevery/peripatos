#!/usr/bin/env node
// Gera o par de chaves VAPID das notificações push e o grava onde o ambiente
// LOCAL as procura:
//   - a pública em .env.local (NEXT_PUBLIC_VAPID_PUBLIC_KEY), para o navegador;
//   - a privada em supabase/functions/.env, que só a Edge Function lê.
// Os dois arquivos estão no .gitignore.
//
//   node scripts/gerar-vapid.mjs            # local: grava os arquivos (não troca chaves que já existam)
//   node scripts/gerar-vapid.mjs --mostrar  # produção: só imprime, para você colar no Vercel e no `supabase secrets set`
//
// Trocar as chaves invalida todas as inscrições existentes: cada pessoa
// precisa ativar as notificações de novo.
import { generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const b64url = (b) => Buffer.from(b).toString("base64url");

function gerar() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  // Pública: ponto não comprimido (0x04 || X || Y), 65 bytes. Privada: d, 32 bytes.
  const publica = b64url(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]));
  void publicKey;
  return { publica, privada: jwk.d };
}

function ler(arquivo) {
  return existsSync(arquivo) ? readFileSync(arquivo, "utf8") : "";
}

function valorDe(texto, nome) {
  return texto.match(new RegExp(`^${nome}=(.+)$`, "m"))?.[1]?.trim() ?? "";
}

function definir(texto, nome, valor) {
  const linha = `${nome}=${valor}`;
  if (new RegExp(`^${nome}=`, "m").test(texto)) return texto.replace(new RegExp(`^${nome}=.*$`, "m"), linha);
  return `${texto}${texto === "" || texto.endsWith("\n") ? "" : "\n"}${linha}\n`;
}

if (process.argv.includes("--mostrar")) {
  const { publica, privada } = gerar();
  console.log("Chave pública  (Vercel: NEXT_PUBLIC_VAPID_PUBLIC_KEY; Supabase: VAPID_PUBLIC_KEY):");
  console.log(publica);
  console.log("\nChave PRIVADA  (só no Supabase: `supabase secrets set VAPID_PRIVATE_KEY=...`). Não guarde em arquivo:");
  console.log(privada);
  process.exit(0);
}

const envLocal = path.join(RAIZ, ".env.local");
const envFuncoes = path.join(RAIZ, "supabase/functions/.env");
let app = ler(envLocal);
let funcoes = ler(envFuncoes);

const publicaDoApp = valorDe(app, "NEXT_PUBLIC_VAPID_PUBLIC_KEY");
const publicaDaFuncao = valorDe(funcoes, "VAPID_PUBLIC_KEY");
const privadaDaFuncao = valorDe(funcoes, "VAPID_PRIVATE_KEY");

if (publicaDoApp && publicaDoApp === publicaDaFuncao && privadaDaFuncao) {
  console.log("As chaves VAPID locais já existem e combinam. Nada a fazer.");
  process.exit(0);
}

const { publica, privada } = gerar();
app = definir(app, "NEXT_PUBLIC_VAPID_PUBLIC_KEY", publica);
funcoes = definir(funcoes, "VAPID_PUBLIC_KEY", publica);
funcoes = definir(funcoes, "VAPID_PRIVATE_KEY", privada);
if (!valorDe(funcoes, "VAPID_SUBJECT")) funcoes = definir(funcoes, "VAPID_SUBJECT", "mailto:dev@peripatos.invalid");
writeFileSync(envLocal, app, { mode: 0o600 });
writeFileSync(envFuncoes, funcoes, { mode: 0o600 });
console.log("Chaves VAPID locais geradas: .env.local e supabase/functions/.env.");
console.log("Reinicie o Supabase local (`supabase stop` e `supabase start`) para a Edge Function ler a chave nova.");
