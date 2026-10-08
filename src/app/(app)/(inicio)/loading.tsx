import { Esqueleto, Osso, OssoDePost } from "@/components/Esqueleto";

export default function CarregandoInicio() {
  return (
    <Esqueleto titulo="Início">
      {/* o formulário de novo post */}
      <div className="cartao flex flex-col gap-3">
        <Osso className="h-[4.5rem] w-full" />
        <div className="flex items-center gap-3">
          <Osso className="h-9 w-16 rounded-full" />
          <Osso className="ml-auto h-9 w-24 rounded-full" />
        </div>
      </div>
      {/* as duas abas */}
      <div className="border-linha flex min-h-11 items-center gap-4 border-b">
        <Osso className="mx-auto h-4 w-20" />
        <Osso className="mx-auto h-4 w-20" />
      </div>
      <OssoDePost />
      <OssoDePost />
      <OssoDePost />
    </Esqueleto>
  );
}
