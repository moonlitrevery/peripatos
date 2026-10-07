"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { concluirOnboarding } from "@/app/acoes/onboarding";
import { SeletorDeAvatar } from "@/components/SeletorDeAvatar";
import { SeletorDeTags } from "@/components/SeletorDeTags";
import { TagsSensiveis } from "@/components/TagsSensiveis";
import { enviarFoto } from "@/lib/foto";
import { createClient } from "@/lib/supabase/client";
import { TERMOS_VERSAO } from "@/lib/legal";
import { MAX_TAGS_COMUNS, type Tag } from "@/lib/tags";
import { idadeEmAnos } from "@/lib/tempo";

const TITULOS = ["Sobre você", "Do que você gosta", "Seu avatar"];

export function FormOnboarding({ uid, tags }: { uid: string; tags: Tag[] }) {
  const router = useRouter();
  const [passo, setPasso] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [bio, setBio] = useState("");
  const [comuns, setComuns] = useState<number[]>([]);
  const [sensiveis, setSensiveis] = useState<number[]>([]);
  const [preset, setPreset] = useState<number | null>(1);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [aceitouTermos, setAceitouTermos] = useState(false);
  const [consentiu, setConsentiu] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const titulo = useRef<HTMLHeadingElement>(null);

  // A cada passo o foco vai para o título, para leitor de tela e teclado
  // saberem que a tela mudou.
  useEffect(() => {
    titulo.current?.focus();
  }, [passo]);

  const hoje = new Date().toISOString().slice(0, 10);
  const comunsDisponiveis = tags.filter((t) => !t.sensivel);
  const sensiveisDisponiveis = tags.filter((t) => t.sensivel);

  function dados() {
    return {
      username,
      displayName,
      nascimento,
      bio,
      tagsComuns: comuns,
      tagsSensiveis: consentiu ? sensiveis : [],
      preset,
      termosAceitos: aceitouTermos ? TERMOS_VERSAO : null,
      consentiuSensiveis: consentiu,
    };
  }

  function avancarDoPrimeiro() {
    setErro(null);
    if (displayName.trim() === "") return setErro("Diga como você quer ser chamado.");
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return setErro("O username precisa ter de 3 a 20 caracteres: letras minúsculas, números e _.");
    if (!nascimento) return setErro("Informe sua data de nascimento.");
    const idade = idadeEmAnos(nascimento);
    if (Number.isNaN(idade) || nascimento > hoje) return setErro("Essa data de nascimento não parece certa.");

    if (idade < 18) {
      // O banco é quem decide e quem apaga: mandamos a data e ele remove a
      // conta na mesma chamada. Nada do formulário fica guardado.
      // Se for mesmo menor, a action redireciona para /maiores-de-18.
      iniciar(async () => {
        const r = await concluirOnboarding(dados());
        if (!r.ok) setErro(r.erro);
        else router.replace("/");
      });
      return;
    }
    if (!aceitouTermos) return setErro("Para continuar é preciso aceitar os Termos de uso e a Política de privacidade.");
    setPasso(1);
  }

  function concluir() {
    setErro(null);
    iniciar(async () => {
      const r = await concluirOnboarding(dados());
      if (!r.ok) {
        setErro(r.erro);
        if (/username/i.test(r.erro)) setPasso(0);
        return;
      }
      if (arquivo) {
        // A conta já está criada. Se a foto falhar, a pessoa segue com o
        // avatar pronto e pode tentar de novo em Configurações.
        await enviarFoto(createClient(), uid, arquivo);
      }
      router.replace("/");
      router.refresh();
    });
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (passo === 0) avancarDoPrimeiro();
        else if (passo === 1) setPasso(2);
        else concluir();
      }}
      noValidate
    >
      <header className="flex flex-col gap-1">
        <p className="fino font-semibold">
          Passo {passo + 1} de {TITULOS.length}
        </p>
        <h1 ref={titulo} tabIndex={-1} className="text-3xl font-bold outline-none">
          {TITULOS[passo]}
        </h1>
      </header>

      {passo === 0 && (
        <>
          <div>
            <label htmlFor="display_name" className="rotulo">
              Como você quer ser chamado
            </label>
            <input
              id="display_name"
              className="campo"
              maxLength={50}
              autoComplete="nickname"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              aria-describedby="display_name-ajuda"
              required
            />
            <p id="display_name-ajuda" className="ajuda">
              Não precisa ser o nome que está no seu e-mail. Use seu nome social ou um apelido, se preferir.
            </p>
          </div>
          <div>
            <label htmlFor="username" className="rotulo">
              Username
            </label>
            <input
              id="username"
              className="campo"
              maxLength={20}
              autoCapitalize="none"
              autoComplete="username"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              aria-describedby="username-ajuda"
              required
            />
            <p id="username-ajuda" className="ajuda">
              De 3 a 20 caracteres: letras minúsculas, números e _. É o endereço do seu perfil.
            </p>
          </div>
          <div>
            <label htmlFor="nascimento" className="rotulo">
              Data de nascimento
            </label>
            <input
              id="nascimento"
              type="date"
              className="campo"
              max={hoje}
              min="1900-01-01"
              autoComplete="bday"
              value={nascimento}
              onChange={(e) => setNascimento(e.target.value)}
              aria-describedby="nascimento-ajuda"
              required
            />
            <p id="nascimento-ajuda" className="ajuda">
              O Peripatos é só para maiores de 18. A data não aparece para ninguém.
            </p>
          </div>
          <div>
            <label htmlFor="bio" className="rotulo">
              Uma linha sobre você <span className="text-tinta-2 font-normal">(opcional)</span>
            </label>
            <textarea id="bio" className="campo" rows={2} maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)} />
          </div>
          <div className="cartao">
            <label htmlFor="aceite" className="flex cursor-pointer items-start gap-3">
              <input
                id="aceite"
                type="checkbox"
                className="mt-1 size-5 shrink-0 accent-[var(--petroleo)]"
                checked={aceitouTermos}
                onChange={(e) => setAceitouTermos(e.target.checked)}
                required
              />
              <span>
                Li e aceito os{" "}
                <a href="/termos" target="_blank" rel="noopener" className="text-petroleo font-semibold underline underline-offset-4">
                  Termos de uso
                </a>{" "}
                e a{" "}
                <a href="/privacidade" target="_blank" rel="noopener" className="text-petroleo font-semibold underline underline-offset-4">
                  Política de privacidade
                </a>
                <span className="sr-only"> (abrem em outra aba)</span>.
              </span>
            </label>
            <p className="ajuda">Guardamos a versão que você aceitou e a data. Versão atual: {TERMOS_VERSAO}.</p>
          </div>
        </>
      )}

      {passo === 1 && (
        <>
          <p className="text-tinta-2">
            É por aqui que o Peripatos encontra gente parecida com você. Escolha o que quiser, até {MAX_TAGS_COMUNS}.
            Dá para mudar depois.
          </p>
          <SeletorDeTags tags={comunsDisponiveis} selecionadas={comuns} aoMudar={setComuns} maximo={MAX_TAGS_COMUNS} prefixo="tag" />

          <details className="cartao">
            <summary className="cursor-pointer font-semibold">Identidade e crenças (opcional)</summary>
            <div className="mt-4 flex flex-col gap-4">
              <TagsSensiveis
                tags={sensiveisDisponiveis}
                selecionadas={sensiveis}
                aoMudar={setSensiveis}
                consentiu={consentiu}
                aoConsentir={setConsentiu}
                prefixo="sens"
              />
            </div>
          </details>
        </>
      )}

      {passo === 2 && <SeletorDeAvatar preset={preset} aoMudarPreset={setPreset} arquivo={arquivo} aoMudarArquivo={setArquivo} />}

      {erro && (
        <p role="alert" className="erro">
          {erro}
        </p>
      )}

      <div className="flex gap-3">
        {passo > 0 && (
          <button type="button" className="btn btn-qui" disabled={pendente} onClick={() => { setErro(null); setPasso(passo - 1); }}>
            Voltar
          </button>
        )}
        <button type="submit" className="btn btn-pri flex-1" disabled={pendente}>
          {pendente ? "Um instante…" : passo === 2 ? "Concluir" : "Continuar"}
        </button>
      </div>
    </form>
  );
}
