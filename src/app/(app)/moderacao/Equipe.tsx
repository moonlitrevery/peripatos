import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nomearModeracao, removerCargo } from "@/app/acoes/moderacao";
import { Cargo, type Papel } from "@/components/Cargo";
import type { Database } from "@/lib/database.types";
import { AcaoComMotivo } from "./AcaoComMotivo";

export type Membro = { user_id: string; role: Papel; created_at: string };

const desde = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });

// % e _ são curingas do ILIKE: quem digita "50%" procura esse texto mesmo.
const literal = (texto: string) => texto.replace(/[\\%_]/g, (c) => `\\${c}`);

// A seção Equipe de /moderacao. Só é desenhada para a administração, e isso é
// só conforto: nomear e remover são RPCs que o banco recusa para qualquer
// outra pessoa, e que registram quem fez e por quê.
export async function Equipe({
  supabase,
  eu,
  membros,
  busca,
}: {
  supabase: SupabaseClient<Database>;
  eu: string;
  membros: Membro[];
  busca: string;
}) {
  const termo = busca.trim().slice(0, 50);
  const padrao = `%${literal(termo)}%`;
  const colunas = "id, username, display_name";
  // Duas consultas com .ilike (o valor vai separado do filtro), em vez de um
  // .or() montado em texto. Quem pode aparecer é do RLS: mesma instituição,
  // conta ativa, sem bloqueio.
  const [porNome, porUsername, daEquipe] = await Promise.all([
    termo.length >= 2 ? supabase.from("profiles").select(colunas).ilike("display_name", padrao).order("display_name").limit(8) : null,
    termo.length >= 2 ? supabase.from("profiles").select(colunas).ilike("username", padrao).order("username").limit(8) : null,
    supabase.from("profiles").select(colunas).in("id", membros.map((m) => m.user_id)),
  ]);
  const perfilDe = new Map((daEquipe.data ?? []).map((p) => [p.id, p]));
  const cargoDe = new Map(membros.map((m) => [m.user_id, m.role]));
  const achados = [...new Map([...(porNome?.data ?? []), ...(porUsername?.data ?? [])].map((p) => [p.id, p])).values()].slice(0, 8);

  const equipe = membros
    .flatMap((m) => {
      const p = perfilDe.get(m.user_id);
      return p ? [{ ...m, perfil: p }] : [];
    })
    .sort((a, b) => (a.role === b.role ? a.created_at.localeCompare(b.created_at) : a.role === "admin" ? -1 : 1));

  return (
    <section aria-labelledby="t-equipe" className="flex flex-col gap-4">
      <h2 id="t-equipe" className="text-xl font-bold">
        Equipe ({equipe.length})
      </h2>
      <p className="text-tinta-2">
        Quem modera e quem administra. Nomear e remover pedem um motivo e ficam registrados; quem é nomeado recebe um
        aviso e só consegue agir depois de ativar a verificação em duas etapas.
      </p>

      <ul className="flex flex-col gap-3" aria-label="Equipe atual">
        {equipe.map((m) => (
          <li key={m.user_id}>
            <article className="cartao flex flex-wrap items-center gap-3" aria-label={m.perfil.display_name ?? ""}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold break-words">
                  <Link href={`/u/${m.perfil.username}`} className="text-petroleo underline underline-offset-4">
                    {m.perfil.display_name}
                  </Link>{" "}
                  <span className="fino font-normal">@{m.perfil.username}</span>
                  {m.user_id === eu && <span className="fino font-normal"> (você)</span>}
                </p>
                <p className="fino">
                  desde <time dateTime={m.created_at}>{desde.format(new Date(m.created_at))}</time>
                </p>
              </div>
              <Cargo papel={m.role} />
              {/* Só a moderação é removida por aqui. Ninguém mexe no próprio
                  cargo, e a administração não se desfaz por um botão. */}
              {m.role === "moderador" && (
                <AcaoComMotivo
                  rotulo="Remover"
                  titulo={`Remover ${m.perfil.display_name} da moderação`}
                  explicacao="A pessoa deixa de ver a fila e de poder agir. Fica registrado quem removeu e por quê."
                  perigo
                  acao={removerCargo.bind(null, m.user_id)}
                />
              )}
            </article>
          </li>
        ))}
      </ul>

      <form method="get" action="/moderacao" role="search" aria-label="Buscar pessoa para a equipe" className="flex flex-col gap-2">
        <label htmlFor="busca-equipe" className="rotulo">
          Buscar pessoa da sua instituição
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="busca-equipe"
            name="equipe"
            type="search"
            defaultValue={termo}
            minLength={2}
            maxLength={50}
            autoComplete="off"
            placeholder="Nome ou username"
            className="campo min-w-0 flex-1"
          />
          <button type="submit" className="btn btn-sec">
            Buscar
          </button>
        </div>
      </form>

      {termo.length >= 2 && (
        <div className="flex flex-col gap-3">
          <p role="status" className="fino">
            {achados.length === 0
              ? `Ninguém encontrado para "${termo}".`
              : `${achados.length} ${achados.length === 1 ? "pessoa encontrada" : "pessoas encontradas"} para "${termo}".`}
          </p>
          <ul className="flex flex-col gap-3" aria-label="Resultado da busca">
            {achados.map((p) => {
              const cargo = cargoDe.get(p.id);
              return (
                <li key={p.id}>
                  <article className="cartao flex flex-wrap items-center gap-3" aria-label={p.display_name ?? ""}>
                    <p className="min-w-0 flex-1 font-semibold break-words">
                      <Link href={`/u/${p.username}`} className="text-petroleo underline underline-offset-4">
                        {p.display_name}
                      </Link>{" "}
                      <span className="fino font-normal">@{p.username}</span>
                    </p>
                    {cargo ? (
                      <Cargo papel={cargo} />
                    ) : (
                      <AcaoComMotivo
                        rotulo="Nomear como moderação"
                        titulo={`Nomear ${p.display_name} como moderação`}
                        explicacao="A pessoa passa a ver a fila de denúncias e as fotos pendentes, e a poder ocultar posts e banir. Ela é avisada, e só age depois de ativar a verificação em duas etapas."
                        acao={nomearModeracao.bind(null, p.id)}
                      />
                    )}
                  </article>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
