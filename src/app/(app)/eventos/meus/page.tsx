import type { Metadata } from "next";
import Link from "next/link";
import { AbasDeGente } from "@/components/AbasDeGente";
import { CartaoDeEvento } from "@/components/CartaoDeEvento";
import { deLinha } from "@/lib/eventos";
import { exigirSessao } from "@/lib/sessao";

export const metadata: Metadata = { title: "Meus eventos" };

// Os eventos que a pessoa organiza e os que vai (ou pediu para ir). O que já
// acabou vira histórico, e só para quem organizou ou esteve confirmado.
export default async function MeusEventos() {
  const { supabase } = await exigirSessao();
  const { data } = await supabase.rpc("meus_eventos");
  const eventos = (data ?? []).map(deLinha);
  const proximos = eventos.filter((e) => !e.acabou);
  const historico = eventos.filter((e) => e.acabou && !e.cancelado);

  return (
    <div className="flex flex-col gap-6">
      <AbasDeGente atual="eventos" />
      <header className="flex flex-col gap-1">
        <Link href="/eventos" className="text-petroleo text-sm font-semibold underline underline-offset-4">
          ‹ Eventos
        </Link>
        <h1 className="text-3xl font-bold">Meus eventos</h1>
      </header>

      <section aria-labelledby="t-meus-proximos" className="flex flex-col gap-4">
        <h2 id="t-meus-proximos" className="text-xl font-bold">
          Próximos
        </h2>
        {proximos.length === 0 ? (
          <p className="text-tinta-2">Você não organiza nem vai a nenhum evento por enquanto.</p>
        ) : (
          <ul className="flex flex-col gap-4" aria-label="Meus próximos eventos">
            {proximos.map((e) => (
              <li key={e.id}>
                <CartaoDeEvento evento={e} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="t-historico" className="flex flex-col gap-4">
        <h2 id="t-historico" className="text-xl font-bold">
          Histórico
        </h2>
        {historico.length === 0 ? (
          <p className="text-tinta-2">Os eventos que você organizou ou a que foi aparecem aqui depois que acabam.</p>
        ) : (
          <ul className="flex flex-col gap-4" aria-label="Eventos que já aconteceram">
            {historico.map((e) => (
              <li key={e.id}>
                <CartaoDeEvento evento={e} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
