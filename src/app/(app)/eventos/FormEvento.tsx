"use client";

import { useState, useTransition } from "react";
import type { CamposDoEvento } from "@/app/acoes/eventos";
import { SeletorDeTags } from "@/components/SeletorDeTags";
import type { Resultado } from "@/lib/erros";
import type { Tag } from "@/lib/tags";

type Props = {
  /** Gostos do vocabulário (sem as tags sensíveis). */
  tags: Tag[];
  inicial?: Partial<CamposDoEvento>;
  /** Na edição o tipo não muda: mudaria o que os pedidos já feitos significam. */
  editando?: boolean;
  rotuloDoBotao: string;
  acao: (campos: CamposDoEvento) => Promise<Resultado>;
};

export function FormEvento({ tags, inicial, editando, rotuloDoBotao, acao }: Props) {
  const [c, setC] = useState<CamposDoEvento>({
    titulo: "",
    descricao: "",
    inicio: "",
    fim: "",
    modalidade: "presencial",
    localGeral: "",
    localExato: "",
    link: "",
    tipo: "aberto",
    vagas: "",
    tags: [],
    ...inicial,
  });
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const mudar = <K extends keyof CamposDoEvento>(campo: K, valor: CamposDoEvento[K]) => setC((atual) => ({ ...atual, [campo]: valor }));
  const presencial = c.modalidade === "presencial";

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        iniciar(async () => {
          const r = await acao(c);
          if (r && !r.ok) setErro(r.erro);
        });
      }}
    >
      <div>
        <label htmlFor="ev-titulo" className="rotulo">
          Título
        </label>
        <input id="ev-titulo" className="campo" value={c.titulo} onChange={(e) => mudar("titulo", e.target.value)} minLength={3} maxLength={80} required />
      </div>
      <div>
        <label htmlFor="ev-descricao" className="rotulo">
          Descrição <span className="text-tinta-2 font-normal">(opcional)</span>
        </label>
        <textarea id="ev-descricao" className="campo" rows={4} value={c.descricao} onChange={(e) => mudar("descricao", e.target.value)} maxLength={1000} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ev-inicio" className="rotulo">
            Começa em
          </label>
          <input id="ev-inicio" type="datetime-local" className="campo" value={c.inicio} onChange={(e) => mudar("inicio", e.target.value)} aria-describedby="ev-fuso" required />
        </div>
        <div>
          <label htmlFor="ev-fim" className="rotulo">
            Termina em <span className="text-tinta-2 font-normal">(opcional)</span>
          </label>
          <input id="ev-fim" type="datetime-local" className="campo" value={c.fim} onChange={(e) => mudar("fim", e.target.value)} aria-describedby="ev-fuso" />
        </div>
        <p id="ev-fuso" className="ajuda sm:col-span-2">
          Horário de Brasília.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="rotulo">Modalidade</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {(["presencial", "online"] as const).map((m) => (
            <label key={m} className="flex min-h-11 items-center gap-2">
              <input type="radio" name="ev-modalidade" value={m} checked={c.modalidade === m} onChange={() => mudar("modalidade", m)} />
              {m === "presencial" ? "Presencial" : "Online"}
            </label>
          ))}
        </div>
      </fieldset>

      {presencial ? (
        <>
          <div>
            <label htmlFor="ev-local-geral" className="rotulo">
              Local geral
            </label>
            <input
              id="ev-local-geral"
              className="campo"
              value={c.localGeral}
              onChange={(e) => mudar("localGeral", e.target.value)}
              maxLength={80}
              placeholder="no campus, no centro…"
              aria-describedby="ev-local-geral-ajuda"
              required
            />
            <p id="ev-local-geral-ajuda" className="ajuda">
              Todo mundo da sua universidade vê. Não ponha endereço aqui.
            </p>
          </div>
          <div>
            <label htmlFor="ev-local-exato" className="rotulo">
              Local exato <span className="text-tinta-2 font-normal">(opcional)</span>
            </label>
            <input
              id="ev-local-exato"
              className="campo"
              value={c.localExato}
              onChange={(e) => mudar("localExato", e.target.value)}
              maxLength={200}
              aria-describedby="ev-local-exato-ajuda"
            />
            <p id="ev-local-exato-ajuda" className="ajuda">
              Só aparece para quem confirmar presença (ou for aceito).
            </p>
          </div>
        </>
      ) : (
        <div>
          <label htmlFor="ev-link" className="rotulo">
            Link do evento
          </label>
          <input
            id="ev-link"
            type="url"
            inputMode="url"
            className="campo"
            value={c.link}
            onChange={(e) => mudar("link", e.target.value)}
            maxLength={500}
            placeholder="https://"
            pattern="https?://.+"
            aria-describedby="ev-link-ajuda"
            required
          />
          <p id="ev-link-ajuda" className="ajuda">
            Começa com http:// ou https://. Só aparece para quem confirmar presença (ou for aceito).
          </p>
        </div>
      )}

      {editando ? (
        <p className="fino">
          Este evento é <strong>{c.tipo === "aprovacao" ? "com aprovação" : "aberto"}</strong>. O tipo não muda depois de criado.
        </p>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="rotulo">Quem pode participar</legend>
          <label className="flex min-h-11 items-start gap-2">
            <input type="radio" name="ev-tipo" value="aberto" className="mt-1.5" checked={c.tipo === "aberto"} onChange={() => mudar("tipo", "aberto")} />
            <span>
              <strong className="block">Aberto</strong>
              <span className="text-tinta-2">A pessoa confirma presença e pronto.</span>
            </span>
          </label>
          <label className="flex min-h-11 items-start gap-2">
            <input type="radio" name="ev-tipo" value="aprovacao" className="mt-1.5" checked={c.tipo === "aprovacao"} onChange={() => mudar("tipo", "aprovacao")} />
            <span>
              <strong className="block">Com aprovação</strong>
              <span className="text-tinta-2">A pessoa pede para participar, e você aceita ou recusa.</span>
            </span>
          </label>
        </fieldset>
      )}

      <div>
        <label htmlFor="ev-vagas" className="rotulo">
          Vagas <span className="text-tinta-2 font-normal">(opcional)</span>
        </label>
        <input
          id="ev-vagas"
          className="campo"
          inputMode="numeric"
          pattern="[0-9]{1,3}"
          value={c.vagas}
          onChange={(e) => mudar("vagas", e.target.value.replace(/\D/g, "").slice(0, 3))}
          aria-describedby="ev-vagas-ajuda"
        />
        <p id="ev-vagas-ajuda" className="ajuda">
          Com vagas, todo mundo vê quantas sobram. Sem vagas, nenhum número aparece.
        </p>
      </div>

      <details className="border-linha rounded-2xl border p-4" open={c.tags.length > 0}>
        <summary className="cursor-pointer font-semibold">Tags (opcional)</summary>
        <div className="mt-4 flex flex-col gap-3">
          <p className="fino">Quem tem esses gostos encontra o evento no filtro &quot;Com meus gostos&quot;.</p>
          <SeletorDeTags tags={tags} selecionadas={c.tags} aoMudar={(ids) => mudar("tags", ids)} maximo={5} prefixo="ev-tag" />
        </div>
      </details>

      {erro && (
        <p role="alert" className="erro">
          {erro}
        </p>
      )}
      <button type="submit" className="btn btn-pri self-start" disabled={pendente}>
        {pendente ? "Salvando…" : rotuloDoBotao}
      </button>
    </form>
  );
}
