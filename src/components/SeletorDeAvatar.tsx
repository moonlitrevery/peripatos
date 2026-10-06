"use client";

import { useId, useState } from "react";
import { AvatarPronto } from "@/components/Avatar";
import { TOTAL_AVATARES_PRONTOS } from "@/lib/avatares";

type Props = {
  preset: number | null;
  aoMudarPreset: (n: number) => void;
  arquivo: File | null;
  aoMudarArquivo: (f: File | null) => void;
};

export function SeletorDeAvatar({ preset, aoMudarPreset, arquivo, aoMudarArquivo }: Props) {
  const grupo = useId();
  const [previa, setPrevia] = useState<string | null>(null);

  function escolher(f: File | null) {
    if (previa) URL.revokeObjectURL(previa);
    setPrevia(f ? URL.createObjectURL(f) : null);
    aoMudarArquivo(f);
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset>
        <legend className="rotulo">Escolha um avatar pronto</legend>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
          {Array.from({ length: TOTAL_AVATARES_PRONTOS }, (_, i) => i + 1).map((n) => (
            <label
              key={n}
              htmlFor={`${grupo}-${n}`}
              className={`flex cursor-pointer justify-center rounded-2xl border-2 p-2 has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--foco)] ${
                preset === n ? "border-petroleo bg-papel-2" : "border-transparent"
              }`}
            >
              <input
                id={`${grupo}-${n}`}
                type="radio"
                name={grupo}
                className="sr-only"
                checked={preset === n}
                onChange={() => aoMudarPreset(n)}
              />
              <AvatarPronto numero={n} tamanho={48} />
              <span className="sr-only">Avatar pronto {n}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor={`${grupo}-foto`} className="rotulo">
          Ou envie uma foto <span className="text-tinta-2 font-normal">(opcional)</span>
        </label>
        <div className="flex items-center gap-4">
          {previa && (
            // eslint-disable-next-line @next/next/no-img-element -- prévia local, blob: do próprio navegador
            <img src={previa} alt="Prévia da foto escolhida" className="arco h-[70px] w-14 object-cover" />
          )}
          <input
            id={`${grupo}-foto`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => escolher(e.target.files?.[0] ?? null)}
            className="file:btn file:btn-qui file:btn-peq text-tinta-2 w-full text-sm file:mr-3"
            aria-describedby={`${grupo}-foto-ajuda`}
          />
        </div>
        <p id={`${grupo}-foto-ajuda`} className="ajuda">
          A foto passa por moderação antes de aparecer para os outros. Até lá, vale o avatar pronto. Removemos da
          imagem os dados escondidos, como o local onde ela foi tirada.
        </p>
        {arquivo && (
          <button type="button" className="text-petroleo mt-2 text-sm font-semibold underline underline-offset-4" onClick={() => escolher(null)}>
            Tirar a foto escolhida
          </button>
        )}
      </div>
    </div>
  );
}
