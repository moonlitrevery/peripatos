import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { Gif } from "@/components/Gif";
import type { ItemFeed } from "@/lib/feed";
import { haQuantoTempo } from "@/lib/tempo";

// No canto do cabeçalho: `seguir` é o botão de seguir o autor a partir deste
// post e `menu` é o de mais ações (os três pontos). `acoes` fica no rodapé.
export function Post({ item, acoes, seguir, menu }: { item: ItemFeed; acoes?: ReactNode; seguir?: ReactNode; menu?: ReactNode }) {
  return (
    <article className="cartao flex flex-col gap-3" aria-label={`Post de ${item.nome}`}>
      {item.origem === "descoberta" && (
        <p className="text-tinta-2 text-[0.75rem] font-bold tracking-wide uppercase">Fora do seu círculo</p>
      )}
      <header className="flex items-center gap-3">
        <Avatar url={item.avatarUrl} preset={item.preset} semente={item.autorId} nome={item.nome} />
        <div className="min-w-0 flex-1">
          <Link href={`/u/${item.username}`} className="font-display block truncate text-[1.0625rem] leading-tight font-bold">
            {item.origem === "proprio" ? "Você" : item.nome}
          </Link>
          <p className="fino truncate">
            @{item.username} · <time dateTime={item.criadoEm}>{haQuantoTempo(item.criadoEm)}</time>
            {item.editado && " · editado"}
          </p>
        </div>
        {seguir}
        {menu}
      </header>
      {item.corpo && <p className="break-words whitespace-pre-wrap">{item.corpo}</p>}
      {item.gifId && <Gif id={item.gifId} alt={item.gifAlt} />}
      {acoes && <footer className="flex flex-wrap items-center gap-2">{acoes}</footer>}
    </article>
  );
}
