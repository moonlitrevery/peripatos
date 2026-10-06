export function Marca({ tamanho = 28 }: { tamanho?: number }) {
  return (
    <svg viewBox="0 0 84 104" width={tamanho} height={(tamanho * 104) / 84} aria-hidden="true" focusable="false">
      <path d="M4 104V42a22 22 0 0 1 44 0v62z" fill="var(--petroleo)" />
      <path d="M36 104V54a22 22 0 0 1 44 0v50z" fill="var(--ambar)" opacity=".92" />
    </svg>
  );
}
