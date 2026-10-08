// O post guarda só o ID do GIF. A URL é montada aqui, sempre no domínio do
// Giphy: não há como um post apontar para uma imagem de outro lugar.
export function urlDoGif(id: string) {
  return `https://i.giphy.com/${encodeURIComponent(id)}.webp`;
}

// `alt` é o título que o Giphy dá ao GIF, guardado junto do post. Posts
// antigos, sem título, caem no genérico.
export function Gif({ id, alt }: { id: string; alt?: string | null }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- GIF animado servido pelo Giphy
    <img
      src={urlDoGif(id)}
      alt={alt ? `GIF: ${alt}` : "GIF sem descrição"}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      // Altura máxima: no celular um GIF em pé nunca passa de menos da metade da tela.
      className="bg-papel-2 max-h-[min(20rem,45svh)] w-auto max-w-full self-start rounded-2xl object-contain"
    />
  );
}
