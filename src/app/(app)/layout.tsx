import { Navegacao } from "@/components/Navegacao";
import { Sugestoes } from "@/components/Sugestoes";
import { exigirSessao } from "@/lib/sessao";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { supabase, user } = await exigirSessao();
  const [{ data: naoLidas }, { data: notificacoes }] = await Promise.all([
    supabase.rpc("total_nao_lidas"),
    supabase.rpc("total_notificacoes_nao_lidas"),
  ]);
  return (
    <>
      <Navegacao
        uid={user.id}
        naoLidasIniciais={typeof naoLidas === "number" ? naoLidas : 0}
        notificacoesIniciais={typeof notificacoes === "number" ? notificacoes : 0}
      />
      {/* Celular: uma coluna, com as abas embaixo. Tablet e desktop: a
          navegação vira barra lateral e o conteúdo fica numa coluna central
          de largura de leitura. Em telas largas entra uma terceira coluna,
          com sugestões de gente parecida. */}
      <div className="flex w-full flex-1 justify-center gap-10 md:pl-24 lg:pl-60 xl:px-10 xl:pl-[17rem]">
        <main id="conteudo" className="w-full max-w-xl min-w-0 px-5 pt-5 pb-28 md:pt-8 md:pb-12">
          {children}
        </main>
        <aside aria-label="Sugestões" className="hidden w-72 shrink-0 pt-8 xl:block">
          <Sugestoes />
        </aside>
      </div>
    </>
  );
}
