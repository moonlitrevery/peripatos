import { Fragment } from "react";

// Transforma em link só o que começa com http:// ou https://. Qualquer outro
// esquema (javascript:, data:, mailto:...) fica como texto puro. O endereço
// passa por `new URL`, e o protocolo é conferido de novo antes de virar href.
const URL_NO_TEXTO = /\bhttps?:\/\/[^\s<>"']+/gi;

function hrefSeguro(bruto: string): string | null {
  try {
    const url = new URL(bruto);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function TextoComLinks({ texto }: { texto: string }) {
  const partes: { texto: string; href: string | null }[] = [];
  let fim = 0;
  for (const m of texto.matchAll(URL_NO_TEXTO)) {
    // pontuação no fim da frase não faz parte do endereço
    const bruto = m[0].replace(/[.,;:!?)\]]+$/, "");
    const inicio = m.index;
    if (inicio > fim) partes.push({ texto: texto.slice(fim, inicio), href: null });
    partes.push({ texto: bruto, href: hrefSeguro(bruto) });
    fim = inicio + bruto.length;
  }
  if (fim < texto.length) partes.push({ texto: texto.slice(fim), href: null });

  return (
    <>
      {partes.map((p, i) =>
        p.href ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-4 break-all">
            {p.texto}
          </a>
        ) : (
          <Fragment key={i}>{p.texto}</Fragment>
        ),
      )}
    </>
  );
}
