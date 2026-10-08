import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AbasDeGente } from "@/components/AbasDeGente";
import { Avatar } from "@/components/Avatar";
import { BotaoSeguir } from "@/components/BotaoSeguir";
import { ondeEm } from "@/components/CartaoDeEvento";
import { TagChip } from "@/components/TagChip";
import { TextoComLinks } from "@/components/TextoComLinks";
import { assinarAvatares } from "@/lib/avatares";
import { deLinha, quando, textoDasVagas } from "@/lib/eventos";
import { exigirSessao } from "@/lib/sessao";
import { deLinha as tagDeLinha, fraseEmComum, type Tag } from "@/lib/tags";
import { CancelarEvento, Participar, RemoverParticipante, ResponderPedido, Sair } from "./Acoes";
import { DenunciarEvento } from "./Denuncia";

export const metadata: Metadata = { title: "Evento" };

type Pessoa = { id: string; username: string | null; display_name: string | null; bio: string | null; avatar_path: string | null; avatar_status: string; avatar_preset: number | null };

// A página de um evento, do ponto de vista de quem abre. O banco decide tudo:
// a RPC só devolve o local exato e o link para quem organiza ou está
// confirmado, e a lista de quem vai (event_participants) só tem linhas para
// essas mesmas pessoas. Para o resto, esta página não tem o que mostrar.
export default async function PaginaDoEvento({ params }: PageProps<"/eventos/[id]">) {
  const { id } = await params;
  const { supabase, user } = await exigirSessao();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data: linhas } = await supabase.rpc("evento", { p_evento: id });
  const linha = linhas?.[0];
  // Não existe, é de outra instituição, quem organiza te bloqueou, foi
  // ocultado, ou já acabou e você não foi: a mesma página.
  if (!linha) notFound();
  const e = deLinha(linha);

  const organizo = e.meuStatus === "organizo";
  const vou = organizo || e.meuStatus === "confirmado";
  const aberto = !e.cancelado && !e.acabou && !e.oculto;

  // Quem vai: o RLS só devolve linhas a quem organiza (todas) e a quem está
  // confirmado (as dos outros confirmados).
  const { data: linhasDePessoas } = vou
    ? await supabase.from("event_participants").select("user_id, status, created_at").eq("event_id", e.id).neq("status", "recusado").order("created_at")
    : { data: [] };
  const participantes = (linhasDePessoas ?? []).filter((p) => p.user_id !== user.id || p.status === "confirmado");
  const ids = participantes.map((p) => p.user_id);
  const pendentes = organizo ? participantes.filter((p) => p.status === "pendente").map((p) => p.user_id) : [];

  const [perfis, minhasTags, tagsDeles, sigo] = await Promise.all([
    ids.length ? supabase.from("profiles").select("id, username, display_name, bio, avatar_path, avatar_status, avatar_preset").in("id", ids) : null,
    pendentes.length ? supabase.from("profile_tags").select("tag_id").eq("user_id", user.id) : null,
    pendentes.length ? supabase.from("profile_tags").select("user_id, tags(id, slug, name, category, is_sensitive)").in("user_id", pendentes) : null,
    organizo && ids.length ? supabase.from("follows").select("followee_id").eq("follower_id", user.id).in("followee_id", ids) : null,
  ]);
  const perfilDe = new Map(((perfis?.data ?? []) as Pessoa[]).map((p) => [p.id, p]));
  const urls = await assinarAvatares(supabase, [
    e.organizador.avatarPath,
    ...[...perfilDe.values()].map((p) => (p.avatar_status === "aprovado" ? p.avatar_path : null)),
  ]);
  const meus = new Set((minhasTags?.data ?? []).map((t) => t.tag_id));
  const emComumCom = new Map<string, Tag[]>();
  for (const l of tagsDeles?.data ?? []) {
    if (!l.tags || !meus.has(l.tags.id)) continue;
    emComumCom.set(l.user_id, [...(emComumCom.get(l.user_id) ?? []), tagDeLinha(l.tags)]);
  }
  const jaSigo = new Set((sigo?.data ?? []).map((f) => f.followee_id));

  const avatar = (p: Pessoa, tamanho: number) => (
    <Avatar url={p.avatar_status === "aprovado" && p.avatar_path ? urls.get(p.avatar_path) : null} preset={p.avatar_preset} semente={p.id} tamanho={tamanho} nome={p.display_name} />
  );
  const confirmados = participantes.filter((p) => p.status === "confirmado").flatMap((p) => (perfilDe.get(p.user_id) ? [perfilDe.get(p.user_id)!] : []));
  const pedidos = pendentes.flatMap((pid) => (perfilDe.get(pid) ? [perfilDe.get(pid)!] : []));
  const vagas = textoDasVagas(e);

  return (
    <div className="flex flex-col gap-6">
      <AbasDeGente atual="eventos" />
      <header className="flex flex-col gap-2">
        <Link href="/eventos" className="text-petroleo text-sm font-semibold underline underline-offset-4">
          ‹ Eventos
        </Link>
        <h1 className="text-3xl leading-tight font-bold break-words">{e.titulo}</h1>
        {e.cancelado && (
          <p role="status" className="erro">
            Este evento foi cancelado.
          </p>
        )}
        {e.oculto && (
          <p role="status" className="erro">
            Este evento foi ocultado pela moderação e não aparece para mais ninguém.
          </p>
        )}
        {e.acabou && !e.cancelado && <p className="text-tinta-2">Este evento já aconteceu.</p>}
        <p className="flex items-center gap-2">
          <Avatar url={e.organizador.avatarPath ? urls.get(e.organizador.avatarPath) : null} preset={e.organizador.preset} semente={e.organizador.id} tamanho={32} nome={e.organizador.nome} />
          <span>
            Organizado por{" "}
            {organizo ? (
              "você"
            ) : (
              <Link href={`/u/${e.organizador.username}`} className="text-petroleo font-semibold underline underline-offset-4">
                {e.organizador.nome}
              </Link>
            )}
          </span>
        </p>
      </header>

      <section aria-labelledby="t-quando" className="cartao flex flex-col gap-3">
        <h2 id="t-quando" className="sr-only">
          Quando e onde
        </h2>
        <dl className="flex flex-col gap-3">
          <div>
            <dt className="fino">Quando</dt>
            <dd className="font-semibold">
              <time dateTime={e.inicio}>{quando(e.inicio, e.fim)}</time> <span className="fino font-normal">(horário de Brasília)</span>
            </dd>
          </div>
          <div>
            <dt className="fino">Onde</dt>
            <dd className="font-semibold">{ondeEm(e)}</dd>
          </div>
          {e.modalidade === "presencial" ? (
            <div>
              <dt className="fino">Local exato</dt>
              <dd data-testid="local-exato" className="break-words">
                {vou ? (e.localExato ?? "Quem organiza não informou um local exato.") : "Aparece para quem confirmar presença."}
              </dd>
            </div>
          ) : (
            <div>
              <dt className="fino">Link</dt>
              <dd data-testid="link-do-evento" className="break-words">
                {vou && e.link ? <TextoComLinks texto={e.link} /> : "Aparece para quem confirmar presença."}
              </dd>
            </div>
          )}
          <div>
            <dt className="fino">Participação</dt>
            <dd>
              {e.tipo === "aprovacao" ? "Com aprovação: você pede, e quem organiza aceita ou recusa." : "Aberto: é só confirmar."}
              {vagas && <strong className="block" data-testid="vagas">{vagas}</strong>}
            </dd>
          </div>
        </dl>
      </section>

      {e.descricao && (
        <section aria-labelledby="t-sobre" className="flex flex-col gap-2">
          <h2 id="t-sobre" className="text-xl font-bold">
            Sobre
          </h2>
          <p className="break-words whitespace-pre-wrap">
            <TextoComLinks texto={e.descricao} />
          </p>
        </section>
      )}

      {e.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tags do evento">
          {e.tags.map((t) => (
            <li key={t.id}>
              <TagChip tag={t} />
            </li>
          ))}
        </ul>
      )}

      {/* O que a pessoa pode fazer agora */}
      <section aria-labelledby="t-participar" className="flex flex-col gap-3">
        <h2 id="t-participar" className="text-xl font-bold">
          {organizo ? "Seu evento" : "Sua participação"}
        </h2>
        {organizo ? (
          aberto ? (
            <div className="flex flex-wrap gap-2">
              <Link href={`/eventos/${e.id}/editar`} className="btn btn-sec btn-peq">
                Editar
              </Link>
              <CancelarEvento eventoId={e.id} titulo={e.titulo} />
            </div>
          ) : (
            <p className="text-tinta-2">Este evento não pode mais ser editado.</p>
          )
        ) : e.meuStatus === "confirmado" ? (
          <>
            <p role="status" className="font-semibold">
              Você vai.
            </p>
            {aberto && <Sair eventoId={e.id} pendenteDeAprovacao={false} />}
          </>
        ) : e.meuStatus === "pendente" ? (
          <>
            <p role="status" className="font-semibold">
              Pedido enviado. Quem organiza ainda não respondeu.
            </p>
            {aberto && <Sair eventoId={e.id} pendenteDeAprovacao />}
          </>
        ) : e.meuStatus === "recusado" ? (
          // Discreto: sem motivo, e sem dizer se foi recusa ou remoção.
          <p role="status" className="text-tinta-2">
            {e.tipo === "aprovacao" ? "Seu pedido não foi aceito." : "Você não participa deste evento."}
          </p>
        ) : aberto ? (
          <Participar eventoId={e.id} comAprovacao={e.tipo === "aprovacao"} lotado={e.vagasRestantes === 0} />
        ) : (
          <p className="text-tinta-2">Não dá mais para participar deste evento.</p>
        )}
      </section>

      {organizo && e.tipo === "aprovacao" && (
        <section aria-labelledby="t-pedidos" className="flex flex-col gap-3">
          <h2 id="t-pedidos" className="text-xl font-bold">
            Pedidos para participar ({pedidos.length})
          </h2>
          {pedidos.length === 0 ? (
            <p className="text-tinta-2">Nenhum pedido esperando.</p>
          ) : (
            <ul className="flex flex-col gap-3" aria-label="Pedidos para participar">
              {pedidos.map((p) => {
                const comuns = emComumCom.get(p.id) ?? [];
                return (
                  <li key={p.id}>
                    <article className="cartao flex flex-col gap-3" aria-label={p.display_name ?? ""}>
                      <header className="flex items-center gap-3">
                        {avatar(p, 48)}
                        <div className="min-w-0 flex-1">
                          <Link href={`/u/${p.username}`} className="block truncate text-lg font-bold">
                            {p.display_name}
                          </Link>
                          <p className="fino truncate">@{p.username}</p>
                        </div>
                      </header>
                      {p.bio && <p className="break-words">{p.bio}</p>}
                      <p className={`text-[0.9375rem] font-bold ${comuns.length > 0 ? "text-ambar" : "text-tinta-2"}`}>{fraseEmComum(comuns.length)}</p>
                      {comuns.length > 0 && (
                        <ul className="flex flex-wrap gap-1.5" aria-label={`Gostos em comum com ${p.display_name}`}>
                          {comuns.map((t) => (
                            <li key={t.id}>
                              <TagChip tag={t} comum />
                            </li>
                          ))}
                        </ul>
                      )}
                      <ResponderPedido eventoId={e.id} pessoaId={p.id} nome={p.display_name ?? ""} />
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="fino">Quem você recusar não é avisado e não fica sabendo o motivo.</p>
        </section>
      )}

      {vou && (
        <section aria-labelledby="t-quem-vai" className="flex flex-col gap-3">
          <h2 id="t-quem-vai" className="text-xl font-bold">
            Quem vai ({confirmados.length})
          </h2>
          <p className="fino">Só quem organiza e quem está confirmado vê esta lista.</p>
          {confirmados.length === 0 ? (
            <p className="text-tinta-2">Ninguém confirmou ainda.</p>
          ) : (
            <ul className="flex flex-col gap-3" aria-label="Quem vai">
              {confirmados.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3">
                  {avatar(p, 40)}
                  <div className="min-w-0 flex-1">
                    <Link href={`/u/${p.username}`} className="block truncate font-bold">
                      {p.id === user.id ? "Você" : p.display_name}
                    </Link>
                    <p className="fino truncate">@{p.username}</p>
                  </div>
                  {organizo && (
                    <span className="flex flex-wrap items-start gap-2">
                      {/* Aceitar não segue ninguém: seguir de volta é uma escolha. */}
                      {!jaSigo.has(p.id) && <BotaoSeguir alvoId={p.id} nome={p.display_name ?? ""} seguindoInicial={false} />}
                      {aberto && <RemoverParticipante eventoId={e.id} pessoaId={p.id} nome={p.display_name ?? ""} />}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!organizo && !e.oculto && (
        <p>
          <DenunciarEvento eventoId={e.id} />
        </p>
      )}
    </div>
  );
}
