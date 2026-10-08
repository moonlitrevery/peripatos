import Link from "next/link";

// No celular a barra de baixo tem cinco itens e continua com cinco: Eventos
// mora dentro de Gente, como uma segunda aba no topo. No tablet e no desktop
// Eventos tem o próprio item na barra lateral, e estas abas não aparecem.
export function AbasDeGente({ atual }: { atual: "pessoas" | "eventos" }) {
  const abas = [
    { id: "pessoas", href: "/gente", rotulo: "Pessoas" },
    { id: "eventos", href: "/eventos", rotulo: "Eventos" },
  ] as const;
  return (
    <nav aria-label="Pessoas e eventos" className="border-linha flex gap-1 border-b md:hidden">
      {abas.map((aba) => (
        <Link
          key={aba.id}
          href={aba.href}
          aria-current={aba.id === atual ? "page" : undefined}
          className={`-mb-px flex min-h-11 flex-1 items-center justify-center border-b-[3px] px-4 font-semibold ${
            aba.id === atual ? "border-petroleo text-petroleo" : "text-tinta-2 border-transparent"
          }`}
        >
          {aba.rotulo}
        </Link>
      ))}
    </nav>
  );
}
