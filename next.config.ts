import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
          // Dois anos, com subdomínios. O navegador ignora este cabeçalho em
          // http, então não atrapalha o ambiente local.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
      {
        // As páginas recebem uma CSP com nonce no proxy (src/proxy.ts). O que
        // não passa por ele (API e arquivos estáticos) recebe esta, que não
        // deixa nada executar nem ser embutido.
        source: "/(api|_next/static|_next/image|icones)/:path*",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" }],
      },
      {
        // O service worker precisa ser sempre revalidado, senão uma versão
        // antiga fica presa no aparelho.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
