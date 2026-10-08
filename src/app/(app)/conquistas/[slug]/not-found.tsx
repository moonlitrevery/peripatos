import Link from "next/link";

export default function ConquistaNaoEncontrada() {
  return (
    <div className="flex flex-col items-start gap-4 py-10">
      <h1 className="text-3xl font-bold">Conquista não encontrada</h1>
      <p className="text-tinta-2">Ela não existe, ou ainda não é para você ver.</p>
      <Link href="/conquistas" className="btn btn-sec">
        Ver as conquistas
      </Link>
    </div>
  );
}
