import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Busca de GIFs. A chave do Giphy fica só aqui, no servidor: o navegador fala
// com esta rota, nunca com o Giphy usando a chave.
// O que volta para o cliente é o ID do GIF e uma prévia. No post grava-se só o
// ID, e o banco recusa qualquer coisa que não seja alfanumérica.

type GifDoGiphy = {
  id: string;
  title?: string;
  images?: { fixed_width?: { webp?: string; url?: string; width?: string; height?: string } };
};

const ID_VALIDO = /^[A-Za-z0-9]{1,64}$/;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Login necessário." }, { status: 401 });

  const chave = process.env.GIPHY_API_KEY;
  if (!chave) {
    return NextResponse.json({ erro: "A busca de GIFs não está configurada." }, { status: 503 });
  }

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 50);
  const url = new URL(q ? "https://api.giphy.com/v1/gifs/search" : "https://api.giphy.com/v1/gifs/trending");
  url.searchParams.set("api_key", chave);
  url.searchParams.set("limit", "18");
  url.searchParams.set("rating", "pg-13");
  url.searchParams.set("bundle", "messaging_non_clips");
  if (q) {
    url.searchParams.set("q", q);
    url.searchParams.set("lang", "pt");
  }

  let corpo: { data?: GifDoGiphy[] };
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) return NextResponse.json({ erro: "O Giphy não respondeu. Tente de novo." }, { status: 502 });
    corpo = await r.json();
  } catch {
    return NextResponse.json({ erro: "O Giphy não respondeu. Tente de novo." }, { status: 502 });
  }

  const gifs = (corpo.data ?? [])
    .filter((g) => ID_VALIDO.test(g.id) && g.images?.fixed_width)
    .map((g) => ({
      id: g.id,
      titulo: g.title || "GIF",
      previa: g.images!.fixed_width!.webp || g.images!.fixed_width!.url || "",
      largura: Number(g.images!.fixed_width!.width) || 200,
      altura: Number(g.images!.fixed_width!.height) || 200,
    }))
    .filter((g) => g.previa.startsWith("https://"));

  return NextResponse.json({ gifs }, { headers: { "Cache-Control": "private, no-store" } });
}
