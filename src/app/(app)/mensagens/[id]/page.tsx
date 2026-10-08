import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { assinarAvatares } from "@/lib/avatares";
import { ultimasMensagens } from "@/lib/mensagens";
import { exigirSessao } from "@/lib/sessao";
import { uuid } from "@/lib/validacao";
import { Conversa } from "./Conversa";

export const metadata: Metadata = { title: "Conversa" };

export default async function PaginaDaConversa({ params }: PageProps<"/mensagens/[id]">) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const { supabase, user } = await exigirSessao();

  // O banco só devolve a conversa a quem participa dela e ainda pode vê-la.
  // Terceiro, staff, bloqueado: tudo cai no mesmo "não encontrada".
  const { data: lista } = await supabase.rpc("minhas_conversas");
  const conversa = (lista ?? []).find((c) => c.conversa_id === id);
  if (!conversa) notFound();

  // A outra pessoa pode ter excluído a conta: as mensagens dela foram
  // apagadas, e as de quem ficou continuam aqui.
  const nome = conversa.outro_excluido ? "Conta excluída" : (conversa.display_name ?? "");

  const [pagina, urls] = await Promise.all([
    ultimasMensagens(supabase, id, user.id),
    assinarAvatares(supabase, [conversa.avatar_path]),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <Link href="/mensagens" className="text-petroleo self-start text-sm font-semibold underline underline-offset-4">
          ‹ Mensagens
        </Link>
        <div className="flex items-center gap-3">
          <Avatar
            url={conversa.avatar_path ? urls.get(conversa.avatar_path) : null}
            preset={conversa.avatar_preset}
            semente={conversa.outro_id ?? conversa.conversa_id}
            nome={conversa.display_name}
          />
          <div className="min-w-0">
            <h1 className="text-2xl leading-tight font-bold break-words">{nome}</h1>
            {conversa.username && (
              <Link href={`/u/${conversa.username}`} className="fino underline underline-offset-4">
                @{conversa.username}
              </Link>
            )}
          </div>
        </div>
      </header>

      <Conversa
        conversaId={id}
        uid={user.id}
        nomeDoOutro={nome}
        outroExcluido={conversa.outro_excluido}
        iniciais={pagina.mensagens}
        haMaisInicial={pagina.haMais}
        aberta={conversa.aberta}
      />
    </div>
  );
}
