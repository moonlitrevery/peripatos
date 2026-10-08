import type { Metadata } from "next";
import Link from "next/link";
import { sair } from "@/app/acoes/entrar";
import { Avatar } from "@/components/Avatar";
import { assinarAvatares } from "@/lib/avatares";
import { exigirSessao, meuCargo, meuPerfil } from "@/lib/sessao";

export const metadata: Metadata = { title: "Você" };

const item = "cartao flex min-h-14 items-center justify-between font-semibold";

export default async function Voce() {
  const { supabase } = await exigirSessao();
  const [perfil, cargo] = await Promise.all([meuPerfil(), meuCargo()]);
  const urls = await assinarAvatares(supabase, [perfil.avatar_status === "aprovado" ? perfil.avatar_path : null]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end gap-4">
        <Avatar
          url={perfil.avatar_path ? urls.get(perfil.avatar_path) : null}
          preset={perfil.avatar_preset}
          semente={perfil.id}
          tamanho={72}
          nome={perfil.display_name}
        />
        <div className="min-w-0 pb-1">
          <h1 className="text-3xl leading-tight font-bold break-words">{perfil.display_name}</h1>
          <p className="text-tinta-2">@{perfil.username}</p>
        </div>
      </header>

      <nav aria-label="Sua conta">
        <ul className="flex flex-col gap-3">
          <li>
            <Link href={`/u/${perfil.username}`} className={item}>
              Ver meu perfil <span aria-hidden="true">›</span>
            </Link>
          </li>
          <li>
            <Link href="/conquistas" className={item}>
              Conquistas <span aria-hidden="true">›</span>
            </Link>
          </li>
          <li>
            <Link href="/config" className={item}>
              Configurações <span aria-hidden="true">›</span>
            </Link>
          </li>
          {/* Só aparece para a staff. Esconder o link é conforto: quem abrir
              /moderacao sem cargo é redirecionado, e o banco não devolve nada. */}
          {cargo && (
            <li>
              <Link href="/moderacao" className={item}>
                Moderação <span aria-hidden="true">›</span>
              </Link>
            </li>
          )}
          <li>
            <Link href="/termos" className={item}>
              Termos de uso <span aria-hidden="true">›</span>
            </Link>
          </li>
          <li>
            <Link href="/privacidade" className={item}>
              Privacidade <span aria-hidden="true">›</span>
            </Link>
          </li>
        </ul>
      </nav>

      <form action={sair}>
        <button type="submit" className="btn btn-qui">
          Sair
        </button>
      </form>
    </div>
  );
}
