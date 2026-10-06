import Link from "next/link";

export default function PerfilNaoEncontrado() {
  return (
    <section className="cartao flex flex-col items-start gap-3">
      <h1 className="text-2xl font-bold">Não achamos este perfil</h1>
      <p className="text-tinta-2">Pode ser que o endereço esteja errado ou que o perfil não esteja disponível para você.</p>
      <Link href="/gente" className="btn btn-pri btn-peq">
        Ver gente parecida comigo
      </Link>
    </section>
  );
}
