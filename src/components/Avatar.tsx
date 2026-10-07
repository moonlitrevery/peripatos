import { useId } from "react";
import { avatarPadrao } from "@/lib/avatares";

// Seis paletas x seis figuras = os 12 avatares prontos. Sem foto, sem rosto.
const PALETAS: [string, string][] = [
  ["#1E5A66", "#F7E2AE"],
  ["#A9670A", "#FFF4D6"],
  ["#47305C", "#EBE4F1"],
  ["#2F6B4F", "#E3F0E6"],
  ["#8A3B2E", "#F8E1D8"],
  ["#2B4A7A", "#DFE8F5"],
];

function Figura({ tipo, fundo, cor }: { tipo: number; fundo: string; cor: string }) {
  switch (tipo) {
    case 0:
      return (
        <>
          <circle cx="20" cy="22" r="9" fill={cor} />
          <path d="M0 40q20-14 40 0v10H0z" fill={cor} opacity=".55" />
        </>
      );
    case 1:
      return <path d="M6 50V30a7 7 0 0 1 14 0v20zM22 50V26a7 7 0 0 1 14 0v24z" fill={cor} />;
    case 2:
      return (
        <>
          <path d="M9 50V18h4v32zM18 50V18h4v32zM27 50V18h4v32z" fill={cor} />
          <path d="M6 14h28v4H6z" fill={cor} opacity=".6" />
        </>
      );
    case 3:
      return <path d="M-2 30q10-10 21 0t23 0v6q-12 10-23 0t-21 0zM-2 40q10-10 21 0t23 0v10H-2z" fill={cor} />;
    case 4:
      return (
        <>
          <path d="M20 12c10 8 10 22 0 32c-10-10-10-24 0-32z" fill={cor} />
          <path d="M20 20v30" stroke={fundo} strokeWidth="2" />
        </>
      );
    default:
      return (
        <>
          <path d="M4 50v-8h10v-8h10v-8h12v24z" fill={cor} />
          <circle cx="29" cy="15" r="4" fill={cor} opacity=".6" />
        </>
      );
  }
}

export function AvatarPronto({ numero, tamanho = 44 }: { numero: number; tamanho?: number }) {
  const id = useId();
  const i = Math.min(Math.max(numero, 1), 12) - 1;
  const [fundo, cor] = PALETAS[i % 6]!;
  const tipo = (i * 5 + Math.floor(i / 6)) % 6;
  return (
    <svg
      viewBox="0 0 40 50"
      width={tamanho}
      height={tamanho * 1.25}
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <defs>
        <clipPath id={id}>
          <path d="M0 50V20a20 20 0 0 1 40 0v30z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <path d="M0 0h40v50H0z" fill={fundo} />
        <Figura tipo={tipo} fundo={fundo} cor={cor} />
      </g>
    </svg>
  );
}

type Props = {
  /** URL assinada da foto aprovada, se houver. */
  url?: string | null;
  preset?: number | null;
  /** Usado para escolher um avatar pronto estável quando não há nenhum. */
  semente: string;
  tamanho?: number;
  /** Nome de quem aparece na foto. Vira o texto alternativo. */
  nome?: string | null;
};

// Foto de verdade tem texto alternativo com o nome da pessoa. Os avatares
// prontos são desenhos abstratos e ficam fora da leitura de tela: o nome
// sempre aparece ao lado em texto, e "figura abstrata" só faria barulho.
export function Avatar({ url, preset, semente, tamanho = 44, nome }: Props) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária do Storage
      <img
        src={url}
        alt={nome ? `Foto de ${nome}` : "Foto de perfil"}
        width={tamanho}
        height={tamanho * 1.25}
        className="arco bg-papel-2 shrink-0 object-cover"
        style={{ width: tamanho, height: tamanho * 1.25 }}
      />
    );
  }
  return <AvatarPronto numero={preset ?? avatarPadrao(semente)} tamanho={tamanho} />;
}
