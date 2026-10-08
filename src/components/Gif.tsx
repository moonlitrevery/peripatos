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
      // O post guarda só o ID do GIF, então o tamanho dele só é conhecido
      // quando a imagem chega. A moldura tem tamanho próprio desde o início
      // (4:3, com teto de altura: no celular nunca passa de menos da metade
      // da tela) e o GIF se encaixa dentro dela. Assim o que vem abaixo não
      // pula de lugar quando o GIF carrega.
      className="bg-papel-2 aspect-[4/3] max-h-[min(20rem,45svh)] w-full rounded-2xl object-contain"
    />
  );
}
