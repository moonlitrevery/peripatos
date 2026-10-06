import type { Metadata } from "next";
import { Marca } from "@/components/Marca";
import { exigirSessao } from "@/lib/sessao";
import { deLinha } from "@/lib/tags";
import { FormOnboarding } from "./FormOnboarding";

export const metadata: Metadata = { title: "Criar perfil" };

export default async function Onboarding() {
  const { supabase, user } = await exigirSessao();
  const { data: tags } = await supabase.from("tags").select("id, slug, name, category, is_sensitive").order("id");

  return (
    <main id="conteudo" className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-5 py-8">
      <Marca tamanho={32} />
      <FormOnboarding uid={user.id} tags={(tags ?? []).map(deLinha)} />
    </main>
  );
}
