import type { Database } from "@/lib/database.types";

export type MotivoDenuncia = Database["public"]["Enums"]["report_reason"];

export const MOTIVOS: { valor: MotivoDenuncia; rotulo: string }[] = [
  { valor: "assedio", rotulo: "Assédio ou perseguição" },
  { valor: "discurso_de_odio", rotulo: "Discurso de ódio" },
  { valor: "exposicao_de_dados_pessoais", rotulo: "Expõe alguém ou dados pessoais" },
  { valor: "violencia_ou_ameaca", rotulo: "Violência ou ameaça" },
  { valor: "conteudo_sexual", rotulo: "Conteúdo sexual" },
  { valor: "menor_de_idade", rotulo: "Parece ser menor de 18" },
  { valor: "perfil_falso", rotulo: "Perfil falso" },
  { valor: "spam", rotulo: "Spam" },
  { valor: "outro", rotulo: "Outro motivo" },
];

export function rotuloDoMotivo(m: string): string {
  return MOTIVOS.find((x) => x.valor === m)?.rotulo ?? m;
}
