"use client";

import { agruparPorCategoria, type Tag } from "@/lib/tags";

type Props = {
  tags: Tag[];
  selecionadas: number[];
  aoMudar: (ids: number[]) => void;
  maximo: number;
  /** Prefixo para os ids dos campos, para o mesmo seletor poder aparecer duas vezes. */
  prefixo: string;
};

// Cada tag é um checkbox de verdade com cara de chip: funciona com teclado e
// leitor de tela sem nenhum truque.
export function SeletorDeTags({ tags, selecionadas, aoMudar, maximo, prefixo }: Props) {
  const marcadas = new Set(selecionadas);
  const cheio = marcadas.size >= maximo;

  function alternar(id: number) {
    const novo = new Set(marcadas);
    if (novo.has(id)) novo.delete(id);
    else if (!cheio) novo.add(id);
    aoMudar([...novo]);
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="fino" role="status" aria-live="polite">
        <strong className="text-tinta">{marcadas.size}</strong> de {maximo} escolhidas
        {cheio && ". Para trocar, desmarque alguma."}
      </p>
      {agruparPorCategoria(tags).map((grupo) => (
        <fieldset key={grupo.categoria} className="flex flex-col gap-2.5">
          <legend className="font-display mb-2 text-base font-bold">{grupo.nome}</legend>
          <div className="flex flex-wrap gap-2">
            {grupo.tags.map((tag) => {
              const marcada = marcadas.has(tag.id);
              const id = `${prefixo}-${tag.id}`;
              return (
                <label
                  key={tag.id}
                  htmlFor={id}
                  className={`chip min-h-10 cursor-pointer border-[1.5px] px-3.5 has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--foco)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-45 ${
                    marcada ? "bg-petroleo text-sobre-petroleo border-petroleo" : "border-linha bg-papel"
                  }`}
                >
                  <input
                    id={id}
                    type="checkbox"
                    className="sr-only"
                    checked={marcada}
                    disabled={!marcada && cheio}
                    onChange={() => alternar(tag.id)}
                  />
                  {tag.nome}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
