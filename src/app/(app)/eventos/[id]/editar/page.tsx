import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { editarEvento } from "@/app/acoes/eventos";
import { AbasDeGente } from "@/components/AbasDeGente";
import { deLinha as eventoDeLinha, paraCampoDeData } from "@/lib/eventos";
import { exigirSessao } from "@/lib/sessao";
import { deLinha } from "@/lib/tags";
import { FormEvento } from "../../FormEvento";

export const metadata: Metadata = { title: "Editar evento" };

export default async function EditarEvento({ params }: PageProps<"/eventos/[id]/editar">) {
  const { id } = await params;
  const { supabase } = await exigirSessao();
  const [{ data: linhas }, { data: tags }] = await Promise.all([
    supabase.rpc("evento", { p_evento: id }),
    supabase.from("tags").select("id, slug, name, category, is_sensitive").eq("is_sensitive", false).order("id"),
  ]);
  const linha = linhas?.[0];
  if (!linha) notFound();
  const e = eventoDeLinha(linha);
  // Só quem organiza edita, e só o que ainda vai acontecer. Isto é navegação:
  // a RPC recusa de qualquer jeito.
  if (e.meuStatus !== "organizo" || e.cancelado || e.acabou) notFound();

  return (
    <div className="flex flex-col gap-6">
      <AbasDeGente atual="eventos" />
      <header className="flex flex-col gap-1">
        <Link href={`/eventos/${e.id}`} className="text-petroleo text-sm font-semibold underline underline-offset-4">
          ‹ Voltar ao evento
        </Link>
        <h1 className="text-3xl font-bold">Editar evento</h1>
        <p className="text-tinta-2">Se você mudar a data, o local ou o link, quem vai é avisado.</p>
      </header>
      <FormEvento
        tags={(tags ?? []).map(deLinha)}
        editando
        rotuloDoBotao="Salvar"
        acao={editarEvento.bind(null, e.id)}
        inicial={{
          titulo: e.titulo,
          descricao: e.descricao,
          inicio: paraCampoDeData(e.inicio),
          fim: paraCampoDeData(e.fim),
          modalidade: e.modalidade,
          localGeral: e.localGeral ?? "",
          localExato: e.localExato ?? "",
          link: e.link ?? "",
          tipo: e.tipo,
          vagas: e.vagas === null ? "" : String(e.vagas),
          tags: e.tags.map((t) => t.id),
        }}
      />
    </div>
  );
}
