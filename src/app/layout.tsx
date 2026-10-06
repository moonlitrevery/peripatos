import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Bricolage_Grotesque } from "next/font/google";
import { RegistrarServiceWorker } from "@/components/RegistrarServiceWorker";
import "./globals.css";

const texto = Atkinson_Hyperlegible_Next({ variable: "--font-texto", subsets: ["latin"], display: "swap" });
const titulo = Bricolage_Grotesque({ variable: "--font-titulo", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Peripatos", template: "%s · Peripatos" },
  description: "Encontre gente da sua universidade que gosta do que você gosta.",
  applicationName: "Peripatos",
  appleWebApp: { capable: true, title: "Peripatos", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icones/icone.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icones/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f5f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1618" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${texto.variable} ${titulo.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a
          href="#conteudo"
          className="btn btn-pri sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
        >
          Pular para o conteúdo
        </a>
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
