import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { assinarAvatares } from "@/lib/avatares";
import { exigirSessao } from "@/lib/sessao";
import { haQuantoTempo } from "@/lib/tempo";
import { AtualizarAoReceber } from "./AtualizarAoReceber";

export const metadata: Metadata = { title: "Mensagens" };

const CONTA_EXCLUIDA = "Conta excluída";

export default async function Mensagens() {
  const { supabase, user } = await exigirSessao();
  // A lista, a prévia e o contador de não lidas vêm do banco, que só devolve
  // as conversas que existem para quem pede (bloqueio esconde dos dois lados).
  const { data } = await supabase.rpc("minhas_conversas");
  const conversas = data ?? [];
  const urls = await assinarAvatares(supabase, conversas.map((c) => c.avatar_path));

  return (
    <div className="flex flex-col gap-6">
      <AtualizarAoReceber uid={user.id} />
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Mensagens</h1>
        <p className="text-tinta-2">Conversas com quem você segue e que te segue de volta.</p>
      </header>

      {conversas.length === 0 ? (
        <section className="cartao flex flex-col items-start gap-3">
          <h2 className="text-xl font-bold">Nenhuma conversa ainda</h2>
          <p className="text-tinta-2">
            Dá para mandar mensagem para quem você segue e que te segue de volta. No perfil da pessoa aparece o botão
            Mensagem.
          </p>
          <Link href="/gente" className="btn btn-pri">
            Conhecer gente
          </Link>
        </section>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Conversas">
          {conversas.map((c) => (
            <li key={c.conversa_id}>
              <Link href={`/mensagens/${c.conversa_id}`} className="cartao flex items-center gap-3">
                <Avatar
                  url={c.avatar_path ? urls.get(c.avatar_path) : null}
                  preset={c.avatar_preset}
                  semente={c.outro_id ?? c.conversa_id}
                  nome={c.display_name}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-display truncate text-[1.0625rem] font-bold">{c.outro_excluido ? CONTA_EXCLUIDA : c.display_name}</span>
                    <time dateTime={c.ultima_em} className="fino shrink-0">
                      {haQuantoTempo(c.ultima_em)}
                    </time>
                  </span>
                  <span className={`block truncate text-sm ${c.nao_lidas > 0 ? "text-tinta font-semibold" : "text-tinta-2"}`}>
                    {c.previa === null ? "Nenhuma mensagem ainda" : `${c.previa_minha ? "Você: " : ""}${c.previa}`}
                  </span>
                  {c.outro_excluido ? (
                    <span className="fino block">Esta pessoa excluiu a conta</span>
                  ) : (
                    !c.aberta && <span className="fino block">Conversa fechada: vocês não se seguem mais</span>
                  )}
                </span>
                {c.nao_lidas > 0 && (
                  <span className="bg-petroleo text-sobre-petroleo min-w-6 shrink-0 rounded-full px-2 py-0.5 text-center text-[0.75rem] font-bold">
                    {c.nao_lidas}
                    <span className="sr-only"> {c.nao_lidas === 1 ? "mensagem não lida" : "mensagens não lidas"}</span>
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
