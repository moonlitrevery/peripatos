const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto", style: "short" });

export function haQuantoTempo(iso: string, agora = Date.now()): string {
  const seg = Math.round((new Date(iso).getTime() - agora) / 1000);
  const abs = Math.abs(seg);
  if (abs < 60) return "agora";
  if (abs < 3600) return rtf.format(Math.round(seg / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seg / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(seg / 86400), "day");
  return new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" });
}

// Idade em anos completos, pela data local. Só para avisar cedo na interface:
// quem decide se a pessoa é adulta é o banco.
export function idadeEmAnos(dataIso: string, hoje = new Date()): number {
  const [a, m, d] = dataIso.split("-").map(Number);
  if (!a || !m || !d) return NaN;
  let idade = hoje.getFullYear() - a;
  if (hoje.getMonth() + 1 < m || (hoje.getMonth() + 1 === m && hoje.getDate() < d)) idade -= 1;
  return idade;
}
