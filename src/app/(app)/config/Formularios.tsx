"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { escolherAvatarPronto, excluirConta, removerFoto, salvarPerfil, salvarTags } from "@/app/acoes/config";
import { desbloquear } from "@/app/acoes/social";
import { Dialogo } from "@/components/Dialogo";
import { SeletorDeAvatar } from "@/components/SeletorDeAvatar";
import { SeletorDeTags } from "@/components/SeletorDeTags";
import type { Resultado } from "@/lib/erros";
import { enviarFoto } from "@/lib/foto";
import { createClient } from "@/lib/supabase/client";
import { MAX_TAGS_COMUNS, MAX_TAGS_SENSIVEIS, type Tag } from "@/lib/tags";

function useSalvar() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  function salvar(fn: () => Promise<Resultado | { ok: true } | { ok: false; erro: string }>) {
    setErro(null);
    setSalvo(false);
    iniciar(async () => {
      const r = await fn();
      if (r.ok) {
        setSalvo(true);
        router.refresh();
      } else setErro(r.erro);
    });
  }
  return { pendente, erro, salvo, salvar };
}

function Retorno({ erro, salvo, children }: { erro: string | null; salvo: boolean; children?: ReactNode }) {
  return (
    <>
      {erro && (
        <p role="alert" className="erro">
          {erro}
        </p>
      )}
      {salvo && (
        <p role="status" className="text-petroleo text-sm font-semibold">
          {children ?? "Salvo."}
        </p>
      )}
    </>
  );
}

export function FormPerfil({ inicial }: { inicial: { displayName: string; username: string; bio: string } }) {
  const [d, setD] = useState(inicial);
  const { pendente, erro, salvo, salvar } = useSalvar();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        salvar(() => salvarPerfil(d));
      }}
    >
      <div>
        <label htmlFor="cfg-nome" className="rotulo">
          Como você quer ser chamado
        </label>
        <input id="cfg-nome" className="campo" maxLength={50} value={d.displayName} onChange={(e) => setD({ ...d, displayName: e.target.value })} required />
      </div>
      <div>
        <label htmlFor="cfg-username" className="rotulo">
          Username
        </label>
        <input
          id="cfg-username"
          className="campo"
          maxLength={20}
          autoCapitalize="none"
          spellCheck={false}
          value={d.username}
          onChange={(e) => setD({ ...d, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
          required
        />
      </div>
      <div>
        <label htmlFor="cfg-bio" className="rotulo">
          Uma linha sobre você
        </label>
        <textarea id="cfg-bio" className="campo" rows={3} maxLength={300} value={d.bio} onChange={(e) => setD({ ...d, bio: e.target.value })} />
      </div>
      <Retorno erro={erro} salvo={salvo}>Perfil salvo.</Retorno>
      <button type="submit" className="btn btn-pri self-start" disabled={pendente}>
        {pendente ? "Salvando…" : "Salvar perfil"}
      </button>
    </form>
  );
}

export function FormTags({ tags, comunsIniciais, sensiveisIniciais }: { tags: Tag[]; comunsIniciais: number[]; sensiveisIniciais: number[] }) {
  const [comuns, setComuns] = useState(comunsIniciais);
  const [sensiveis, setSensiveis] = useState(sensiveisIniciais);
  const { pendente, erro, salvo, salvar } = useSalvar();
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        salvar(() => salvarTags(comuns, sensiveis));
      }}
    >
      <SeletorDeTags tags={tags.filter((t) => !t.sensivel)} selecionadas={comuns} aoMudar={setComuns} maximo={MAX_TAGS_COMUNS} prefixo="cfg-tag" />
      <details className="border-linha rounded-2xl border p-4" open={sensiveisIniciais.length > 0}>
        <summary className="cursor-pointer font-semibold">Identidade e crenças (opcional)</summary>
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-tinta-2">
            Só aparecem para quem você segue e que te segue de volta, e só contam na afinidade com essas pessoas. Nem a
            moderação vê.
          </p>
          <SeletorDeTags
            tags={tags.filter((t) => t.sensivel)}
            selecionadas={sensiveis}
            aoMudar={setSensiveis}
            maximo={MAX_TAGS_SENSIVEIS}
            prefixo="cfg-sens"
          />
        </div>
      </details>
      <Retorno erro={erro} salvo={salvo}>Gostos salvos.</Retorno>
      <button type="submit" className="btn btn-pri self-start" disabled={pendente}>
        {pendente ? "Salvando…" : "Salvar gostos"}
      </button>
    </form>
  );
}

const STATUS_DA_FOTO: Record<string, string> = {
  sem_avatar: "Você está usando um avatar pronto.",
  pendente: "Sua foto está aguardando moderação. Até ser aprovada, os outros veem o avatar pronto.",
  aprovado: "Sua foto foi aprovada e é ela que aparece para os outros.",
  recusado: "Sua foto foi recusada pela moderação. Os outros veem o avatar pronto.",
};

export function FormAvatar({ uid, presetInicial, status }: { uid: string; presetInicial: number | null; status: string }) {
  const [preset, setPreset] = useState(presetInicial);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const { pendente, erro, salvo, salvar } = useSalvar();
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        salvar(async () => {
          if (preset) {
            const r = await escolherAvatarPronto(preset);
            if (!r.ok) return r;
          }
          if (arquivo) {
            const r = await enviarFoto(createClient(), uid, arquivo);
            if (!r.ok) return r;
            setArquivo(null);
          }
          return { ok: true };
        });
      }}
    >
      <p className="text-tinta-2" data-testid="status-da-foto">
        {STATUS_DA_FOTO[status]}
      </p>
      <SeletorDeAvatar preset={preset} aoMudarPreset={setPreset} arquivo={arquivo} aoMudarArquivo={setArquivo} />
      <Retorno erro={erro} salvo={salvo}>Avatar salvo.</Retorno>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn-pri" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar avatar"}
        </button>
        {status !== "sem_avatar" && (
          <button type="button" className="btn btn-qui" disabled={pendente} onClick={() => salvar(removerFoto)}>
            Apagar minha foto
          </button>
        )}
      </div>
    </form>
  );
}

export function Bloqueados({ lista }: { lista: { id: string; username: string; nome: string }[] }) {
  const { pendente, erro, salvar } = useSalvar();
  if (lista.length === 0) return <p className="text-tinta-2">Você não bloqueou ninguém.</p>;
  return (
    <>
      <ul className="flex flex-col gap-2">
        {lista.map((p) => (
          <li key={p.id} className="border-linha flex items-center justify-between gap-3 rounded-2xl border p-3">
            <span className="min-w-0">
              <span className="block truncate font-semibold">{p.nome}</span>
              <span className="fino">@{p.username}</span>
            </span>
            <button
              type="button"
              className="btn btn-qui btn-peq"
              disabled={pendente}
              aria-label={`Desbloquear ${p.nome}`}
              onClick={() => salvar(() => desbloquear(p.id))}
            >
              Desbloquear
            </button>
          </li>
        ))}
      </ul>
      <Retorno erro={erro} salvo={false} />
    </>
  );
}

export function ExcluirConta() {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <>
      <button type="button" className="btn btn-per self-start" onClick={() => setAberto(true)}>
        Excluir minha conta
      </button>
      <Dialogo aberto={aberto} aoFechar={() => setAberto(false)} titulo="Excluir sua conta?">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            iniciar(async () => {
              const r = await excluirConta(texto);
              if (r && !r.ok) setErro(r.erro);
            });
          }}
        >
          <p>
            Isso apaga de vez seu perfil, seus posts, seus gostos, quem você segue e quem te segue, seus bloqueios, sua
            foto e seu login. <strong>Não tem como desfazer.</strong>
          </p>
          <div>
            <label htmlFor="excluir-confirmacao" className="rotulo">
              Para confirmar, digite EXCLUIR
            </label>
            <input
              id="excluir-confirmacao"
              className="campo"
              autoComplete="off"
              autoCapitalize="characters"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </div>
          {erro && (
            <p role="alert" className="erro">
              {erro}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" className="btn btn-qui" onClick={() => setAberto(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-per" disabled={pendente || texto.trim() !== "EXCLUIR"}>
              {pendente ? "Excluindo…" : "Excluir para sempre"}
            </button>
          </div>
        </form>
      </Dialogo>
    </>
  );
}
