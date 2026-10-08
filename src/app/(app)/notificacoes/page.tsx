import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { Medalha } from "@/components/Conquista";
import { assinarAvatares } from "@/lib/avatares";
import { exigirSessao } from "@/lib/sessao";
import { haQuantoTempo } from "@/lib/tempo";
import { AoVivo } from "./AoVivo";

export const metadata: Metadata = { title: "Notificações" };

type Pessoa = { id: string; username: string | null; nome: string | null; avatar_path: string | null; avatar_preset: number | null };

const elo = "text-petroleo font-semibold underline underline-offset-4";

function NomeDe({ pessoa }: { pessoa: Pessoa }) {
  return (
    <Link href={`/u/${pessoa.username}`} className={elo}>
      {pessoa.nome}
    </Link>
  );
}

/** "Ana", "Ana e Bia", "Ana, Bia e mais 3". */
function Nomes({ pessoas, total }: { pessoas: Pessoa[]; total: number }) {
  const resto = total - pessoas.length;
  return (
    <>
      {pessoas.map((p, i) => (
        <span key={p.id}>
          {i > 0 && (i === pessoas.length - 1 && resto <= 0 ? " e " : ", ")}
          <NomeDe pessoa={p} />
        </span>
      ))}
      {resto > 0 && ` e mais ${resto}`}
    </>
  );
}

// Tudo o que aparece aqui foi gerado pelo banco, e só chega a quem é dono: a
// RPC devolve as notificações de quem chama, já agrupadas e sem ninguém que a
// pessoa bloqueou.
export default async function Notificacoes() {
  const { supabase, user } = await exigirSessao();
  const { data } = await supabase.rpc("minhas_notificacoes");
  const grupos = (data ?? []).map((g) => ({ ...g, pessoas: (g.pessoas ?? []) as Pessoa[] }));
  const urls = await assinarAvatares(supabase, grupos.flatMap((g) => g.pessoas.map((p) => p.avatar_path)));

  const avatar = (p: Pessoa, tamanho = 36) => (
    <Avatar url={p.avatar_path ? urls.get(p.avatar_path) : null} preset={p.avatar_preset} semente={p.id} tamanho={tamanho} nome={p.nome} />
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Notificações</h1>
      <AoVivo uid={user.id} haNovas={grupos.some((g) => !g.lida)} />

      {grupos.length === 0 ? (
        <p className="text-tinta-2">Nada por aqui ainda. Quando alguém te seguir ou você ganhar uma conquista, aparece aqui.</p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Suas notificações">
          {grupos.map((g) => {
            let figura: ReactNode = null;
            let texto: ReactNode;
            let destaque = false;

            switch (g.tipo) {
              case "mutuo": {
                const p = g.pessoas[0];
                destaque = true;
                figura = p ? avatar(p, 48) : null;
                texto = (
                  <>
                    <strong className="font-display block text-lg leading-snug">Vocês viraram mútuos</strong>
                    {p ? (
                      <>
                        Você e <NomeDe pessoa={p} /> agora se seguem. Já dá para conversar.
                      </>
                    ) : (
                      "Você e outra pessoa agora se seguem."
                    )}
                  </>
                );
                break;
              }
              case "novo_seguidor":
                figura = <span className="flex -space-x-2">{g.pessoas.map((p) => <span key={p.id}>{avatar(p, 32)}</span>)}</span>;
                // Só quem foi seguido lê isto: o trecho é de um post dele mesmo.
                texto = g.pelo_post ? (
                  <>
                    <Nomes pessoas={g.pessoas} total={1} /> te seguiu pelo seu post
                    {g.post_trecho ? (
                      <>
                        : <q className="text-tinta-2">{g.post_trecho}</q>
                      </>
                    ) : (
                      "."
                    )}
                  </>
                ) : g.quantidade === 1 ? (
                    <>
                      <Nomes pessoas={g.pessoas} total={1} /> começou a seguir você.
                    </>
                  ) : (
                    <>
                      <strong className="block">{g.quantidade} pessoas te seguiram</strong>
                      <Nomes pessoas={g.pessoas} total={g.quantidade} />
                    </>
                  );
                break;
              case "avatar_aprovado":
                texto = "Sua foto foi aprovada e já aparece no seu perfil.";
                break;
              case "avatar_recusado":
                texto = (
                  <>
                    Sua foto não foi aprovada. Você pode enviar outra em{" "}
                    <Link href="/config" className={elo}>
                      Configurações
                    </Link>
                    .
                  </>
                );
                break;
              case "denuncia_analisada":
                texto =
                  g.quantidade === 1
                    ? "Sua denúncia foi analisada pela moderação. Obrigado por avisar."
                    : `${g.quantidade} denúncias suas foram analisadas pela moderação. Obrigado por avisar.`;
                break;
              case "termos_atualizados":
                texto = (
                  <>
                    Os{" "}
                    <Link href="/termos" className={elo}>
                      Termos de uso
                    </Link>{" "}
                    e a{" "}
                    <Link href="/privacidade" className={elo}>
                      Política de privacidade
                    </Link>{" "}
                    foram atualizados.
                  </>
                );
                break;
              case "cargo_concedido":
                texto = (
                  <>
                    <strong className="block">Você entrou para a equipe do Peripatos</strong>
                    Para começar, ative a verificação em duas etapas em{" "}
                    <Link href="/moderacao" className={elo}>
                      Moderação
                    </Link>
                    .
                  </>
                );
                break;
              case "conquista":
                figura =
                  g.conquista_emoji && g.conquista_cor ? (
                    <Medalha
                      conquista={{ emoji: g.conquista_emoji, emojiRotulo: g.conquista_emoji_rotulo ?? "", cor: g.conquista_cor }}
                      tamanho={44}
                    />
                  ) : null;
                texto = (
                  <>
                    Você ganhou a conquista{" "}
                    <Link href={`/conquistas/${g.conquista_slug}`} className={elo}>
                      {g.conquista_nome}
                    </Link>
                    .
                  </>
                );
                break;
            }

            return (
              <li
                key={g.grupo}
                data-tipo={g.tipo}
                className={`cartao flex items-center gap-3 ${destaque ? "border-petroleo border-2 py-5" : ""}`}
              >
                {figura}
                <p className="min-w-0 flex-1 break-words">
                  {!g.lida && <span className="sr-only">Nova: </span>}
                  {texto}
                  <time dateTime={g.ultima_em} className="fino block">
                    {haQuantoTempo(g.ultima_em)}
                  </time>
                </p>
                {!g.lida && <span aria-hidden="true" data-testid="nova" className="bg-petroleo h-2.5 w-2.5 shrink-0 rounded-full" />}
              </li>
            );
          })}
        </ul>
      )}

      <p className="fino">
        Notificações com mais de 60 dias são apagadas. Para receber avisos no aparelho, veja{" "}
        <Link href="/config#notificacoes" className={elo}>
          Configurações
        </Link>
        .
      </p>
    </div>
  );
}
