import Link from "next/link";

export default function ConversaNaoEncontrada() {
  return (
    <section className="cartao flex flex-col items-start gap-3">
      <h1 className="text-2xl font-bold">Não achamos esta conversa</h1>
      <p className="text-tinta-2">Pode ser que o endereço esteja errado ou que a conversa não esteja disponível para você.</p>
      <Link href="/mensagens" className="btn btn-pri btn-peq">
        Ver minhas conversas
      </Link>
    </section>
  );
}
