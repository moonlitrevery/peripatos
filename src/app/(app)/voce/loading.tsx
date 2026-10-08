import { Osso, OssoDeAvatar } from "@/components/Esqueleto";

// Aqui o título da tela é o nome da pessoa, que ainda não chegou: o
// esqueleto guarda o lugar dele e o leitor de tela ouve "Você".
export default function CarregandoVoce() {
  return (
    <div data-esqueleto className="flex flex-col gap-6" aria-busy="true">
      <header className="flex items-end gap-4">
        <OssoDeAvatar tamanho={72} />
        <div className="flex flex-col gap-2 pb-1">
          <h1 className="sr-only">Você</h1>
          <Osso className="h-8 w-40" />
          <Osso className="h-4 w-24" />
        </div>
      </header>
      <p className="sr-only" role="status">
        Carregando…
      </p>
      <div aria-hidden="true" className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Osso key={i} className="h-14 w-full rounded-[20px]" />
        ))}
      </div>
    </div>
  );
}
