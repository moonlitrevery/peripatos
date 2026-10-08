import { Esqueleto, Osso, OssoDeAvatar } from "@/components/Esqueleto";

export default function CarregandoGente() {
  return (
    <Esqueleto titulo="Gente" subtitulo="Quem mais gosta do que você gosta, na sua universidade.">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="cartao flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <OssoDeAvatar tamanho={52} />
            <div className="flex flex-1 flex-col gap-2">
              <Osso className="h-5 w-36" />
              <Osso className="h-3 w-24" />
            </div>
            <Osso className="h-9 w-20 rounded-full" />
          </div>
          <Osso className="h-4 w-4/5" />
          <Osso className="h-4 w-44" />
          <div className="flex gap-1.5">
            <Osso className="h-7 w-16 rounded-full" />
            <Osso className="h-7 w-24 rounded-full" />
            <Osso className="h-7 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </Esqueleto>
  );
}
