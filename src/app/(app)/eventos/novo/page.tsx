import type { Metadata } from "next";
import Link from "next/link";
import { criarEvento } from "@/app/acoes/eventos";
import { AbasDeGente } from "@/components/AbasDeGente";
import { exigirSessao } from "@/lib/sessao";
import { deLinha } from "@/lib/tags";
import { FormEvento } from "../FormEvento";

export const metadata: Metadata = { title: "Criar evento" };

export default async function NovoEvento() {
  const { supabase } = await exigirSessao();
  // Só gostos: tag sensível não marca evento (o banco recusa).
  const { data } = await supabase.from("tags").select("id, slug, name, category, is_sensitive").eq("is_sensitive", false).order("id");

  return (
    <div className="flex flex-col gap-6">
      <AbasDeGente atual="eventos" />
      <header className="flex flex-col gap-1">
        <Link href="/eventos" className="text-petroleo text-sm font-semibold underline underline-offset-4">
          ‹ Eventos
        </Link>
        <h1 className="text-3xl font-bold">Criar evento</h1>
        <p className="text-tinta-2">
          Só gente da sua universidade vê. Quem vai, o local exato e o link ficam só entre você e quem confirmar.
        </p>
      </header>
      <FormEvento tags={(data ?? []).map(deLinha)} rotuloDoBotao="Criar evento" acao={criarEvento} />
    </div>
  );
}
