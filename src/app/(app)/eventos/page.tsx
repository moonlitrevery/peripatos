import type { Metadata } from "next";
import Link from "next/link";
import { AbasDeGente } from "@/components/AbasDeGente";
import { CartaoDeEvento } from "@/components/CartaoDeEvento";
import { deLinha } from "@/lib/eventos";
import { exigirSessao } from "@/lib/sessao";

export const metadata: Metadata = { title: "Eventos" };

const MODALIDADES = [
  { valor: "", rotulo: "Todos" },
  { valor: "presencial", rotulo: "Presencial" },
  { valor: "online", rotulo: "Online" },
] as const;

// A lista dos próximos eventos da instituição, em ordem de data. O que entra
// (mesma instituição, sem bloqueio, não cancelado, não ocultado, ainda por
// acontecer) e os filtros são da RPC: os parâmetros da URL só escolhem o filtro.
export default async function Eventos({ searchParams }: PageProps<"/eventos">) {
  const { supabase } = await exigirSessao();
  const params = await searchParams;
  const gostos = params.gostos === "1";
  const modalidade = params.modalidade === "presencial" || params.modalidade === "online" ? params.modalidade : null;

  const { data } = await supabase.rpc("eventos_proximos", {
    p_com_meus_gostos: gostos,
    ...(modalidade ? { p_modalidade: modalidade } : {}),
  });
  const eventos = (data ?? []).map(deLinha);

  // Os links dos filtros são montados aqui, com valores fixos: nada do que a
  // pessoa digita vira endereço.
  const endereco = (g: boolean, m: string | null) => {
    const q = new URLSearchParams();
    if (g) q.set("gostos", "1");
    if (m) q.set("modalidade", m);
    const texto = q.toString();
    return texto ? `/eventos?${texto}` : "/eventos";
  };
  const filtros = [
    ...MODALIDADES.map((m) => ({ rotulo: m.rotulo, href: endereco(gostos, m.valor || null), ativa: (modalidade ?? "") === m.valor })),
    { rotulo: "Com meus gostos", href: endereco(!gostos, modalidade), ativa: gostos },
  ];

  return (
    <div className="flex flex-col gap-5">
      <AbasDeGente atual="eventos" />
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Eventos</h1>
        <p className="text-tinta-2">Coisas para fazer junto, com gente da sua universidade. Presencial ou online.</p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Link href="/eventos/novo" className="btn btn-pri btn-peq">
          Criar evento
        </Link>
        <Link href="/eventos/meus" className="btn btn-sec btn-peq">
          Meus eventos
        </Link>
      </div>

      <nav aria-label="Filtros" className="flex flex-col gap-2">
        <ul className="flex flex-wrap gap-2">
          {filtros.map((aba) => (
            <li key={aba.rotulo}>
              <Link href={aba.href} aria-current={aba.ativa ? "true" : undefined} className={`chip min-h-11 px-4 ${aba.ativa ? "chip-comum" : ""}`}>
                {aba.rotulo}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby="t-proximos" className="flex flex-col gap-4">
        <h2 id="t-proximos" className="text-xl font-bold">
          Próximos eventos
        </h2>
        {eventos.length === 0 ? (
          <p className="text-tinta-2">
            {gostos || modalidade ? "Nenhum evento com esses filtros por enquanto." : "Nenhum evento marcado por enquanto. Que tal criar o primeiro?"}
          </p>
        ) : (
          <ul className="flex flex-col gap-4" aria-label="Próximos eventos">
            {eventos.map((e) => (
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
