import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { Gif } from "@/components/Gif";
import type { ItemFeed } from "@/lib/feed";
import { haQuantoTempo } from "@/lib/tempo";

export function Post({ item, acoes }: { item: ItemFeed; acoes?: ReactNode }) {
  return (
    <article className="cartao flex flex-col gap-3" aria-label={`Post de ${item.nome}`}>
      {item.origem === "descoberta" && (
        <p className="text-tinta-2 text-[0.75rem] font-bold tracking-wide uppercase">Fora do seu círculo</p>
      )}
      <header className="flex items-center gap-3">
        <Avatar url={item.avatarUrl} preset={item.preset} semente={item.autorId} />
        <div className="min-w-0">
          <Link href={`/u/${item.username}`} className="font-display block truncate text-[1.0625rem] leading-tight font-bold">
            {item.origem === "proprio" ? "Você" : item.nome}
          </Link>
          <p className="fino truncate">
            @{item.username} · <time dateTime={item.criadoEm}>{haQuantoTempo(item.criadoEm)}</time>
            {item.editado && " · editado"}
          </p>
        </div>
      </header>
      {item.corpo && <p className="break-words whitespace-pre-wrap">{item.corpo}</p>}
      {item.gifId && <Gif id={item.gifId} />}
      {acoes && <footer className="flex flex-wrap items-center gap-2">{acoes}</footer>}
    </article>
  );
}
