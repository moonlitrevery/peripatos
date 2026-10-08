import { Navegacao } from "@/components/Navegacao";
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
      <main id="conteudo" className="mx-auto w-full max-w-xl flex-1 px-5 pt-5 pb-28 md:pb-12">
        {children}
      </main>
    </>
  );
}
