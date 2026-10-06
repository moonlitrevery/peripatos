// O post guarda só o ID do GIF. A URL é montada aqui, sempre no domínio do
// Giphy: não há como um post apontar para uma imagem de outro lugar.
export function urlDoGif(id: string) {
  return `https://i.giphy.com/${encodeURIComponent(id)}.webp`;
}

export function Gif({ id }: { id: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- GIF animado servido pelo Giphy
    <img
      src={urlDoGif(id)}
      alt="GIF"
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className="bg-papel-2 max-h-80 w-full rounded-2xl object-contain"
    />
  );
}
