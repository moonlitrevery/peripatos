import { SUPABASE_URL } from "@/lib/env";

// Content-Security-Policy do app. Libera só o que o app usa de fato:
//   - scripts: os do próprio app, marcados com o nonce desta resposta. Nenhum
//     script inline sem nonce, nenhum domínio de terceiros;
//   - conexões: o próprio app e o Supabase (API, Storage, Functions);
//   - imagens: o próprio app, avatares assinados do Supabase e GIFs do Giphy;
//   - nada de iframe em lugar nenhum, em nenhuma direção.
//
// `style-src-attr 'unsafe-inline'` existe por causa de atributos style=""
// (tamanho dos avatares). Folhas de estilo continuam exigindo nonce.
export function montarCsp(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  const supabase = new URL(SUPABASE_URL).origin;
  const supabaseWs = supabase.replace(/^http/, "ws");
  const https = supabase.startsWith("https://");

  const diretivas = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${dev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    `style-src-attr 'unsafe-inline'`,
    `img-src 'self' data: blob: ${supabase} https://*.giphy.com`,
    `font-src 'self'`,
    `connect-src 'self' ${supabase} ${supabaseWs}`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `media-src 'none'`,
    `object-src 'none'`,
    `frame-src 'none'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    // Só quando o Supabase é https (produção). No ambiente local, em http,
    // forçar https quebraria as chamadas a 127.0.0.1.
    ...(https ? ["upgrade-insecure-requests"] : []),
  ];
  return diretivas.join("; ");
}
