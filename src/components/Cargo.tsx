const ROTULO = { admin: "Administração", moderador: "Moderação" } as const;

export type Papel = keyof typeof ROTULO;

// O cargo de quem cuida do app. Administração tem um brilho ao redor;
// Moderação não. Os dois levam sempre o nome escrito: o brilho e a cor nunca
// são a única forma de saber qual é qual.
export function Cargo({ papel }: { papel: Papel }) {
  return <span className={papel === "admin" ? "cargo cargo-admin" : "cargo"}>{ROTULO[papel]}</span>;
}
