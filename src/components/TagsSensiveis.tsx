"use client";

import { SeletorDeTags } from "@/components/SeletorDeTags";
import { MAX_TAGS_SENSIVEIS, type Tag } from "@/lib/tags";

type Props = {
  tags: Tag[];
  selecionadas: number[];
  aoMudar: (ids: number[]) => void;
  /** A caixa de consentimento desta tela. */
  consentiu: boolean;
  aoConsentir: (v: boolean) => void;
  /** Quando a pessoa já consentiu antes (Configurações). */
  consentidoEm?: string | null;
  prefixo: string;
};

// Orientação sexual, identidade de gênero e religião são dados sensíveis
// (LGPD, art. 5º, II). O consentimento é pedido aqui, à parte do aceite dos
// termos, com a finalidade escrita, e as tags só ficam disponíveis depois
// dele. O banco confere de novo: sem consentimento registrado, recusa.
export function TagsSensiveis({ tags, selecionadas, aoMudar, consentiu, aoConsentir, consentidoEm, prefixo }: Props) {
  const liberado = consentiu || !!consentidoEm;
  const idCaixa = `${prefixo}-consentimento`;
  return (
    <div className="flex flex-col gap-4">
      <div className="border-sobre-sensivel bg-sensivel text-sobre-sensivel flex flex-col gap-3 rounded-2xl border-2 p-4">
        <h3 className="text-base font-bold">Consentimento para dados sensíveis</h3>
        <p>
          Orientação sexual, identidade de gênero e religião são dados pessoais sensíveis pela LGPD. Se você marcar
          alguma dessas tags, o Peripatos vai guardá-las para duas coisas, e só para elas:
        </p>
        <ul className="list-disc pl-5">
          <li>mostrá-las a quem você segue e que te segue de volta;</li>
          <li>calcular a afinidade entre você e essas pessoas.</li>
        </ul>
        <p>
          Ninguém mais vê, nem a moderação. Você pode retirar este consentimento quando quiser em Configurações: todas
          essas tags são apagadas na hora.
        </p>
        {consentidoEm ? (
          <p className="font-semibold">
            Você deu este consentimento em{" "}
            <time dateTime={consentidoEm}>{new Date(consentidoEm).toLocaleDateString("pt-BR", { dateStyle: "long" })}</time>.
          </p>
        ) : (
          <label htmlFor={idCaixa} className="flex cursor-pointer items-start gap-3 font-semibold">
            <input
              id={idCaixa}
              type="checkbox"
              className="mt-1 size-5 shrink-0 accent-[var(--sobre-sensivel)]"
              checked={consentiu}
              onChange={(e) => {
                aoConsentir(e.target.checked);
                if (!e.target.checked) aoMudar([]);
              }}
            />
            <span>Autorizo o Peripatos a tratar as tags de identidade e crenças que eu marcar, para essas finalidades.</span>
          </label>
        )}
      </div>

      {liberado ? (
        <SeletorDeTags tags={tags} selecionadas={selecionadas} aoMudar={aoMudar} maximo={MAX_TAGS_SENSIVEIS} prefixo={prefixo} />
      ) : (
        <p className="fino">Marque a autorização acima para escolher. Você também pode pular esta parte.</p>
      )}
    </div>
  );
}
