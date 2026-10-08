import { Esqueleto, Osso } from "@/components/Esqueleto";

export default function CarregandoConfig() {
  return (
    <Esqueleto titulo="Configurações">
      {/* Perfil: três campos e o botão */}
      <div className="cartao flex flex-col gap-4">
        <Osso className="h-6 w-20" />
        <Osso className="h-12 w-full rounded-xl" />
        <Osso className="h-12 w-full rounded-xl" />
        <Osso className="h-24 w-full rounded-xl" />
        <Osso className="h-11 w-28 rounded-full" />
      </div>
      {/* Gostos: fileiras de chips */}
      <div className="cartao flex flex-col gap-4">
        <Osso className="h-6 w-20" />
        <div className="flex flex-wrap gap-1.5">
          {[16, 24, 20, 28, 16, 20, 24, 16].map((w, i) => (
            <Osso key={i} className={`h-7 rounded-full ${w === 16 ? "w-16" : w === 20 ? "w-20" : w === 24 ? "w-24" : "w-28"}`} />
          ))}
        </div>
      </div>
      <div className="cartao flex flex-col gap-4">
        <Osso className="h-6 w-20" />
        <Osso className="h-20 w-full" />
      </div>
    </Esqueleto>
  );
}
