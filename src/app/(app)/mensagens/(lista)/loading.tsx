import { Esqueleto, Osso, OssoDeAvatar } from "@/components/Esqueleto";

export default function CarregandoMensagens() {
  return (
    <Esqueleto titulo="Mensagens" subtitulo="Conversas com quem você segue e que te segue de volta.">
      {[0, 1, 2].map((i) => (
        <div key={i} className="cartao flex items-center gap-3">
          <OssoDeAvatar tamanho={48} />
          <div className="flex flex-1 flex-col gap-2">
            <Osso className="h-4 w-32" />
            <Osso className="h-3 w-48" />
          </div>
          <Osso className="h-3 w-10" />
        </div>
      ))}
    </Esqueleto>
  );
}
