import type { Metadata } from "next";
import Link from "next/link";
import { exigirSessao, meuPerfil } from "@/lib/sessao";
import { deLinha } from "@/lib/tags";
import { Bloqueados, ExcluirConta, FormAvatar, FormPerfil, FormTags } from "./Formularios";

export const metadata: Metadata = { title: "Configurações" };

export default async function Config() {
  const { supabase, user } = await exigirSessao();
  const perfil = await meuPerfil();

  const [tags, comuns, sensiveis, bloqueios] = await Promise.all([
    supabase.from("tags").select("id, slug, name, category, is_sensitive").order("id"),
    supabase.from("profile_tags").select("tag_id").eq("user_id", user.id),
    supabase.from("profile_sensitive_tags").select("tag_id").eq("user_id", user.id),
    supabase.rpc("meus_bloqueios"),
  ]);

  const secao = "cartao flex flex-col gap-4 scroll-mt-20";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/voce" className="text-petroleo text-sm font-semibold underline underline-offset-4">
          ‹ Você
        </Link>
        <h1 className="text-3xl font-bold">Configurações</h1>
      </header>

      <section className={secao} aria-labelledby="t-perfil">
        <h2 id="t-perfil" className="text-xl font-bold">
          Perfil
        </h2>
        <FormPerfil
          inicial={{ displayName: perfil.display_name ?? "", username: perfil.username ?? "", bio: perfil.bio ?? "" }}
        />
      </section>

      <section className={secao} id="gostos" aria-labelledby="t-gostos">
        <h2 id="t-gostos" className="text-xl font-bold">
          Gostos
        </h2>
        <FormTags
          tags={(tags.data ?? []).map(deLinha)}
          comunsIniciais={(comuns.data ?? []).map((l) => l.tag_id)}
          sensiveisIniciais={(sensiveis.data ?? []).map((l) => l.tag_id)}
        />
      </section>

      <section className={secao} aria-labelledby="t-avatar">
        <h2 id="t-avatar" className="text-xl font-bold">
          Avatar
        </h2>
        <FormAvatar uid={user.id} presetInicial={perfil.avatar_preset} status={perfil.avatar_status} />
      </section>

      <section className={secao} aria-labelledby="t-bloqueados">
        <h2 id="t-bloqueados" className="text-xl font-bold">
          Pessoas bloqueadas
        </h2>
        <Bloqueados
          lista={(bloqueios.data ?? []).map((b) => ({ id: b.user_id, username: b.username, nome: b.display_name }))}
        />
      </section>

      <section className={secao} aria-labelledby="t-excluir">
        <h2 id="t-excluir" className="text-xl font-bold">
          Excluir conta
        </h2>
        <p className="text-tinta-2">
          Apaga seus dados de verdade, não só esconde. Veja o que acontece com cada informação na{" "}
          <Link href="/privacidade" className="text-petroleo font-semibold underline underline-offset-4">
            Política de privacidade
          </Link>
          .
        </p>
        <ExcluirConta />
      </section>
    </div>
  );
}
