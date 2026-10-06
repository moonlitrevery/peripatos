import { Navegacao } from "@/components/Navegacao";
import { exigirSessao } from "@/lib/sessao";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await exigirSessao();
  return (
    <>
      <Navegacao />
      <main id="conteudo" className="mx-auto w-full max-w-xl flex-1 px-4 pt-5 pb-28 md:pb-12">
        {children}
      </main>
    </>
  );
}
