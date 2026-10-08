import { Esqueleto, Osso, OssoDeAvatar } from "@/components/Esqueleto";

export default function CarregandoNotificacoes() {
  return (
    <Esqueleto titulo="Notificações">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="cartao flex items-center gap-3">
          <OssoDeAvatar tamanho={36} />
          <div className="flex flex-1 flex-col gap-2">
            <Osso className="h-4 w-4/5" />
            <Osso className="h-3 w-16" />
          </div>
        </div>
      ))}
    </Esqueleto>
  );
}
