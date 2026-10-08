# Deploy do beta

Checklist para subir o Peripatos pela primeira vez: Supabase hospedado + Vercel. **Nada aqui foi executado ainda.** Siga na ordem: os passos dependem uns dos outros.

Cada passo está marcado com quem o faz:

- **[painel]** você, clicando no painel do Supabase, do Vercel ou do Google;
- **[comando]** um comando no terminal, na raiz do repositório.

> Os nomes dos menus do painel do Supabase mudam de tempos em tempos. Se um item não estiver exatamente onde este documento diz, procure pelo nome da configuração.

## O que sobe sozinho e o que não sobe

O `supabase/config.toml` configura só o Supabase **local**. No projeto hospedado, três coisas chegam por comando e todo o resto precisa ser replicado à mão no painel.

| O quê | Onde está no repositório | Como chega em produção |
| --- | --- | --- |
| Tabelas, RLS, funções, triggers | `supabase/migrations/` | `supabase db push` (passo 3) |
| Instituição, domínio da allowlist, tags | migration `20261006000001_vocabulario.sql` | `supabase db push` (passo 3) |
| **Buckets e políticas de storage** | migrations `…09_storage.sql` e `…03_menor_e_avatar.sql` | `supabase db push` (passo 3). Não estão no `config.toml` |
| **Segredo do HMAC de banimento** | gerado pela migration `…04_cadastro.sql` | `supabase db push` gera um segredo novo dentro do banco de produção (passo 4) |
| Edge Function `processar-avatar` e o `verify_jwt = true` dela | `supabase/functions/`, `[functions.processar-avatar]` | `supabase functions deploy` (passo 9) |
| **Auth hook de cadastro** | `[auth.hook.before_user_created]` | **Painel** (passo 6) |
| **Template do e-mail com código** | `[auth.email.template.*]`, `supabase/templates/otp.html` | **Painel** (passo 8) |
| **Expiração e tamanho do código** | `[auth.email]` `otp_expiry`, `otp_length` | **Painel** (passo 6) |
| **Limite de verificações de OTP** e de e-mails | `[auth.rate_limit]` | **Painel** (passo 8) |
| **SMTP** | não existe no `config.toml` (o local usa o Mailpit) | **Painel** (passo 7) |
| Confirmação de e-mail, login anônimo, telefone | `[auth]`, `[auth.email]`, `[auth.sms]` | **Painel** (passo 6) |
| Site URL | `[auth] site_url` (local: `127.0.0.1:3000`) | **Painel** (passo 11) |
| **Verificação em duas etapas (TOTP)** | `[auth.mfa.totp]` | **Painel** (passo 6). O banco exige aal2 da staff |
| Origem aceita pelas Edge Functions | não está no `config.toml` | **Comando** `supabase secrets set` (passo 9) |
| **Chaves das notificações push (VAPID)** | não estão no repositório | **Comando** e **Painel** (passo 9a) |
| **Realtime só com canais privados** | não está no `config.toml` | **Painel** (passo 5) |
| Edge Function `notificar-mensagem` | `supabase/functions/` | `supabase functions deploy` (passo 9a) |
| Schemas expostos pela API | `[api] schemas = ["public"]` | **Painel** (passo 5) |
| Dados de teste (`supabase/seed.sql`) | — | **Não sobem**, de propósito |

> **Não use `supabase config push`.** Ele empurraria para produção os valores locais do `config.toml` (Site URL `127.0.0.1`, limite de 2 e-mails por hora). `supabase config diff` só compara e é útil para conferir no fim.

## 0. Antes de começar

- [ ] **[painel]** O CI está verde em `main` (GitHub → Actions).
- [ ] **[painel]** Conta no Supabase e no Vercel.
- [ ] **[painel]** Uma conta Gmail só para o Peripatos, com verificação em duas etapas ligada (a senha de app do passo 7 exige).
- [ ] **[painel]** Chave da API do Giphy (<https://developers.giphy.com>). A chave de desenvolvimento serve para o beta, com limite baixo.
- [ ] Um gerenciador de senhas aberto: você vai guardar a senha do banco e a senha de app do Gmail.

## 1. Criar o projeto Supabase — [painel]

- [ ] *New project*. Região **South America (São Paulo)**.
- [ ] Gere a senha do banco e **guarde no gerenciador de senhas**. Ela não vai para o Vercel nem para o git.
- [ ] Anote, em *Project Settings → API*:
  - o **Project ref** (20 letras minúsculas);
  - a **Project URL** (`https://<ref>.supabase.co`);
  - a chave **publishable** (ou `anon`). É pública.
- [ ] **Não copie** a chave `secret`/`service_role` para lugar nenhum. Nenhum passo deste documento precisa dela.

## 2. Ligar o repositório ao projeto — [comando]

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <ref>     # pede a senha do banco
```

## 3. Aplicar as migrations — [comando]

> **O banco e o app têm que sair do mesmo commit.** O `db push` aplica as migrations da pasta em que você está; o Vercel publica o branch de produção (`main`). Se a sua pasta estiver num branch à frente de `main`, o banco fica mais novo que o app, e o app no ar passa a falhar (foi o que aconteceu no primeiro deploy: o banco exigia o aceite dos termos e o app publicado ainda não tinha a caixa). Antes de qualquer `db push`:
>
> ```bash
> git checkout main && git pull
> git status          # limpo, e "Your branch is up to date with 'origin/main'"
> ```

```bash
pnpm exec supabase db push --dry-run    # mostra o que seria aplicado, sem aplicar
pnpm exec supabase db push
```

Isso cria o schema, o RLS, as funções, a UNISAGRADO, o domínio `alunos.unisagrado.edu.br`, as tags, os dois buckets privados (`avatar-uploads` e `avatars`) e as políticas de storage. O seed não roda.

- [ ] **[painel]** Confira no *SQL Editor*:

```sql
select count(*) as tags from public.tags;                           -- maior que zero
select id, public, file_size_limit, allowed_mime_types from storage.buckets;
-- esperado: avatar-uploads e avatars, os dois com public = false
select policyname, cmd from pg_policies
 where schemaname = 'storage' and tablename = 'objects' order by 1;
-- esperado: 5 políticas peripatos_*, nenhuma de UPDATE e nenhuma de INSERT em avatars
```

## 4. Segredo do HMAC de banimento — [painel]

O e-mail de quem é banido é guardado como HMAC-SHA256, e a chave fica no Vault. A migration **gera a chave dentro do banco de produção**, com 32 bytes aleatórios. Ela nunca passou pelo git nem pela sua máquina, e por isso já é diferente da chave local, sem nenhuma ação sua.

- [ ] Confira no *SQL Editor* que ela existe, **sem olhar o valor**:

```sql
select name, created_at from vault.secrets where name = 'peripatos_ban_hmac_key';
-- esperado: exatamente 1 linha
```

Regras:

- **Nunca** copie a chave local para produção.
- A chave de produção sai do banco por um único caminho: dentro do backup criptografado (`docs/backup.md`), porque sem ela um banco restaurado não reconhece os banidos nem os RAs já cadastrados (a conta guarda só o HMAC do RA).
- **Não rotacione** depois do primeiro banimento: os hashes em `private.banned_emails` deixariam de bater e os banidos voltariam a conseguir se cadastrar.
- Se o projeto for apagado e recriado **sem** restaurar o backup, a lista de banidos e a unicidade de RA perdem o efeito.

## 5. Schemas expostos pela API — [painel]

- [ ] *Project Settings → Data API → Exposed schemas*: só **`public`**. O schema `private` **nunca** entra nessa lista (ele guarda e-mail, RA e data de nascimento).
- [ ] *Max rows*: `1000`.
- [ ] *Realtime → Settings*: desligue **Allow public access** (ou o nome equivalente), para o Realtime aceitar só canais privados, que passam pela autorização do banco. O app não depende disso para a privacidade das mensagens (o banco só publica em canais privados, e o evento não leva o texto), mas é uma camada a mais e fecha o Realtime para usos que o app não tem.

## 6. Auth: provedores, código e hook — [painel]

| Onde no painel | Configuração | Valor | No `config.toml` |
| --- | --- | --- | --- |
| *Authentication → Sign In / Providers → Email* | Provedor de e-mail | **ligado** | `[auth.email] enable_signup = true` |
| idem | *Confirm email* | **ligado** | `enable_confirmations = true` |
| idem | *Email OTP length* | **6** | `otp_length = 6` |
| idem | *Email OTP expiration* | **600** segundos | `otp_expiry = 600` |
| *Sign In / Providers* | *Allow anonymous sign-ins* | **desligado** | `enable_anonymous_sign_ins = false` |
| *Sign In / Providers → Phone* | Telefone | **desligado** | `[auth.sms] enable_signup = false` |
| *Sign In / Providers* | Google, GitHub e demais | **todos desligados** | nenhum `[auth.external.*]` ligado |
| *Sign In / Providers* | *Allow new users to sign up* | **ligado** | `enable_signup = true` |
| *Authentication → Multi-Factor* | *TOTP (app authenticator)* | **ligado** (enroll e verify) | `[auth.mfa.totp]` |
| *Authentication → Sessions* | *Time-box* e *Inactivity timeout* | só no plano Pro; ver `README.md`, "Sessões" | comentado em `[auth.sessions]` |

- [ ] Todos os itens da tabela conferidos.
- [ ] **Auth hook de cadastro.** *Authentication → Hooks → Before User Created*:
  - tipo **Postgres**, schema **`private`**, função **`hook_before_user_created`**;
  - ligue o hook.

  É ele que recusa domínio de fora da lista, e-mail sem RA e e-mail banido. **Sem o hook, qualquer e-mail do mundo cria conta.** A migration já deu ao `supabase_auth_admin` a permissão de executar a função; se o painel oferecer rodar os `grant`, pode aceitar.

## 7. SMTP — [painel]

O SMTP embutido do Supabase só entrega para membros do projeto e manda poucos e-mails por hora. Sem SMTP próprio ninguém de fora recebe o código.

- [ ] **[painel, Google]** Na conta Gmail do Peripatos: *Segurança → Verificação em duas etapas → Senhas de app*. Crie uma e guarde no gerenciador de senhas.
- [ ] **[painel, Supabase]** *Authentication → Emails → SMTP Settings → Enable custom SMTP*:

| Campo | Valor |
| --- | --- |
| Sender email | o endereço do Gmail |
| Sender name | `Peripatos` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | o endereço do Gmail |
| Password | a **senha de app** (não a senha da conta) |
| Minimum interval between emails | `60` segundos (é a contagem regressiva do botão "Reenviar código") |

O Gmail limita a cerca de 500 destinatários por dia. Serve para o beta; passou disso, troque por um serviço de e-mail transacional.

## 8. Template do e-mail e limites — [painel]

Faça depois do SMTP: alguns projetos só liberam a edição depois que o SMTP próprio está ligado.

- [ ] *Authentication → Emails → Templates*. Em **Confirm signup** e em **Magic Link**:
  - assunto: `Seu código de acesso ao Peripatos`;
  - corpo: o conteúdo de `supabase/templates/otp.html`, inteiro.

  O corpo precisa ter `{{ .Token }}` e **não pode ter** `{{ .ConfirmationURL }}`: o app entra só por código, nunca por link. São dois templates porque o primeiro acesso de uma pessoa usa *Confirm signup* e os seguintes usam *Magic Link*.

- [ ] *Authentication → Rate Limits*:

| Limite | Padrão | O que pôr | Por quê |
| --- | --- | --- | --- |
| **E-mails enviados** (por hora) | baixo, mesmo com SMTP próprio | **100** para começar | Cada login manda um e-mail. Com o padrão, o lançamento trava nos primeiros minutos |
| **Verificações de OTP** (a cada 5 min, por IP) | 30 | **100** para começar | Ver abaixo |
| Pedidos de login/cadastro (a cada 5 min, por IP) | 30 | **100** para começar | Mesmo motivo |

**Sobre o limite de verificações de OTP.** Ele é contado por IP. O app confere o código numa *server action*, então quem fala com o Auth é o servidor do Vercel: o Auth enxerga os IPs do Vercel, e não o de cada pessoa. Um limite pensado para "um IP por usuário" vira um limite para **todo mundo junto**. Com 30, trinta pessoas entrando nos mesmos cinco minutos já esgotam. Não suba demais: esse limite também é o que impede alguém de adivinhar um código de 6 dígitos por tentativa. Com 100 a cada 5 minutos e código de 10 minutos, um atacante tem no máximo 200 tentativas em 1 milhão por código.

## 9. Edge Function de avatar — [comando]

```bash
pnpm exec supabase functions deploy processar-avatar
```

- A função sobe com `verify_jwt = true` (vem do `config.toml`). **Não** use `--no-verify-jwt`.
- Depois de saber o endereço do app (passo 10), restrinja o CORS da função a ele:

  ```bash
  pnpm exec supabase secrets set ORIGEM_DO_APP=https://<projeto>.vercel.app
  pnpm exec supabase functions deploy processar-avatar
  ```

  O valor é a **origem inteira**: com `https://`, sem barra no fim, e do endereço que as pessoas realmente usam (se houver domínio próprio, é ele, não o `.vercel.app`). Confira como o navegador confere:

  ```bash
  curl -s -o /dev/null -D - -X OPTIONS https://<ref>.supabase.co/functions/v1/processar-avatar \
    -H "Origin: https://<projeto>.vercel.app" -H "Access-Control-Request-Method: POST" | grep -i access-control-allow-origin
  # esperado: access-control-allow-origin: https://<projeto>.vercel.app
  ```

  Se esse cabeçalho não for idêntico ao endereço do app, **todo envio de foto falha** com "Não foi possível processar a foto".

- Ela recebe `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` do próprio Supabase. Você não cadastra nenhum segredo.
- [ ] **[painel]** *Edge Functions*: `processar-avatar` aparece como ativa, com *Verify JWT* ligado.

## 9a. Notificações push — [comando] e [painel]

As notificações usam um par de chaves (VAPID). A pública vai para o navegador; a privada fica **só** como segredo da Edge Function.

- [ ] **[comando]** Gere o par. Ele é impresso na tela e não é gravado em arquivo:

  ```bash
  node scripts/gerar-vapid.mjs --mostrar
  ```

- [ ] **[comando]** Cadastre no Supabase e publique a função:

  ```bash
  pnpm exec supabase secrets set VAPID_PUBLIC_KEY=<pública> VAPID_PRIVATE_KEY=<privada> VAPID_SUBJECT=mailto:<seu e-mail de contato>
  pnpm exec supabase functions deploy notificar-mensagem
  ```

- [ ] **[painel, Vercel]** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = a chave **pública** (passo 10), e *Redeploy*.
- [ ] Guarde a chave privada no gerenciador de senhas. **Trocar o par desliga as notificações de todo mundo**: cada pessoa teria que ativar de novo.

O que saber:

- **A notificação nunca leva o conteúdo da mensagem.** Diz só "Nova mensagem de <nome>". Há um teste que decifra a notificação e confere.
- **iPhone e iPad:** só funciona com o Peripatos **instalado na tela de início** (Safari → Compartilhar → Adicionar à Tela de Início), a partir do iOS 16.4. No Safari comum a opção nem aparece; a tela de Configurações explica isso para a pessoa.
- A função só entrega para os serviços de push dos navegadores (lista em `private.push_hosts`). Se um navegador novo usar outro endereço, a inscrição é recusada com "Endereço de notificação não reconhecido": acrescente o padrão numa migration.
- Sem as chaves, o app funciona normalmente e a seção de Notificações diz que elas não estão configuradas.

## 10. Vercel — [painel]

- [ ] Importe o repositório. Framework: Next.js. Gerenciador: pnpm (detectado pelo `packageManager`).
- [ ] *Settings → Environment Variables*, só no ambiente **Production**:

| Variável | Tipo | Valor |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | **Pública** (vai para o navegador) | a Project URL do passo 1 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Pública** (vai para o navegador) | a chave publishable/anon do passo 1 |
| `GIPHY_API_KEY` | **Só servidor**; marque como *Sensitive* | a chave do Giphy |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | **Pública** (vai para o navegador) | a chave VAPID **pública** do passo 9a |

Regras:

- **Nada além dessas quatro.** A chave VAPID **privada** não vai para o Vercel: fica só no Supabase. A chave `secret`/`service_role`, a senha do banco e a senha de app do Gmail **não** vão para o Vercel: o app não usa nenhuma delas.
- **Não instale a integração Supabase do Vercel.** Ela cadastra sozinha a service role e a URL do banco como variáveis. Se já instalou, apague essas variáveis.
- Nunca dê o prefixo `NEXT_PUBLIC_` a um segredo: tudo com esse prefixo é embutido no JavaScript que o navegador baixa.
- As `NEXT_PUBLIC_` são gravadas no build. Mudou uma, faça *Redeploy*.
- Deixe *Preview* sem variáveis: um deploy de preview com as de produção seria um segundo app escrevendo no banco real.

- [ ] Faça o deploy e anote o endereço (`https://<projeto>.vercel.app` ou o domínio próprio).

## 11. Site URL — [painel]

- [ ] *Authentication → URL Configuration → Site URL*: o endereço do Vercel do passo 10.

## 12. Verificação pós-deploy — [comando]

Confere, de fora e só com a chave pública, que quem não está logado não consegue nada:

```bash
pnpm verificar:deploy https://<ref>.supabase.co <chave publishable>
```

O script:

- recusa rodar com a chave `secret`/`service_role`;
- confere que **a chave anon não lê nem escreve em nenhuma tabela** e não chama nenhuma função (as listas saem das migrations do repositório);
- confere que **o schema `private` não está exposto** e que nenhuma tabela dele aparece em `public`;
- confere que os buckets não são públicos e não listam arquivos;
- confere que as duas Edge Functions recusam quem não está logado, e que o CORS delas é uma origem válida;
- confere login anônimo, telefone e provedores sociais desligados, e confirmação de e-mail ligada.

Tem que terminar em `PASSOU: 0 falha(s)`. O mesmo script roda no CI contra o Supabase local.

- [ ] Passou.
- [ ] Rode uma vez também com `--testar-hook`. Ele tenta um cadastro com e-mail de domínio de fora e exige a recusa. **Atenção:** se o hook não estiver ligado, isso cria um usuário de teste; o script avisa, e você liga o hook e apaga o usuário em *Authentication → Users*.

O que o script **não** consegue ver de fora, e por isso você confere no painel: o template do e-mail, a expiração do código, os limites e o SMTP (passos 6 a 8).

## 13. Teste de fumaça — [painel, no app]

Com um e-mail institucional de verdade:

- [ ] Peça o código. O e-mail chega com **6 dígitos e sem link**.
- [ ] Um e-mail de fora (`@gmail.com`) é recusado com a mensagem do banco.
- [ ] Conclua o onboarding, publique um post, busque um GIF.
- [ ] Com duas contas que se seguem: mande uma mensagem e veja chegar na outra sem recarregar. Ative as notificações num celular e confira que o aviso diz só de quem é.
- [ ] Envie uma foto de avatar: ela fica pendente.
- [ ] **Primeiro admin**, no *SQL Editor*:

```sql
insert into public.staff_roles (user_id, institution_id, role)
select id, institution_id, 'admin' from public.profiles where username = '<seu username>';
```

- [ ] `/moderacao` pede para configurar o autenticador (verificação em duas etapas). Depois de confirmar o código, a fila abre e a foto aparece.
- [ ] Faça o primeiro backup e um ensaio de restauração num projeto de teste: `docs/backup.md`.

## 14. Evitar que o projeto pause

**O plano grátis pausa projetos inativos.** Segundo a documentação do Supabase:

- um projeto grátis é considerado inativo quando não recebe atividade de banco suficiente de usuários ao longo de **7 dias**;
- "algumas requisições de usuários ao banco por dia" bastam para não pausar;
- antes de pausar chega um **e-mail de aviso**; visitar o projeto no painel ou gerar requisições pela API evita a pausa;
- um projeto pausado pode ser restaurado pelo painel em até **1 ano**, com dados e configurações. Enquanto está pausado, o app fica fora do ar;
- **projetos em plano pago não pausam.**

Fontes: [Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing) e [Production Checklist](https://supabase.com/docs/guides/platform/going-into-prod), consultadas em 2026-10-06. Confira se continuam valendo.

**Um fim de semana sem uso não pausa**: a janela é de 7 dias. O risco real é uma semana inteira parada (recesso, feriado prolongado, o intervalo entre criar o projeto e abrir o beta).

O que fazer, em ordem de confiança:

1. **Plano pago (Pro) a partir do dia em que o beta abrir para outras pessoas.** É a única garantia.
2. **Enquanto estiver no grátis**, ligue a verificação diária: o workflow `.github/workflows/verificar-producao.yml` roda `verificar:deploy` contra produção todo dia. Para ligar, em *GitHub → Settings → Secrets and variables → Actions → Variables*, crie `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` (são valores públicos, por isso variáveis e não segredos). Sem as variáveis o workflow não faz nada.

   Ele serve a dois propósitos: gera dezenas de requisições ao banco por dia e avisa por e-mail do GitHub se a chave anon passar a enxergar alguma coisa.

   **Limite honesto:** a documentação não define o que conta como "atividade de usuário". As requisições do script chegam ao banco e são recusadas por falta de permissão; **não há garantia documentada de que requisições recusadas contem**. Trate como redução de risco, não como garantia.
3. **Não ignore o e-mail de aviso.** Confira que o e-mail da conta Supabase é um que você lê. Recebeu o aviso: entre no painel e abra o projeto. Se o aviso chegar mesmo com o workflow ligado, ele não está contando: passe para o plano pago.
4. O GitHub desliga workflows agendados depois de 60 dias sem atividade no repositório. Se o repositório ficar parado, reative em *Actions*.

## 15. Antes de abrir para outras pessoas

- [ ] `/termos` e `/privacidade` revisados (hoje são rascunhos, marcados como tal) e o e-mail de contato trocado.
- [ ] Chave de produção do Giphy pedida, se o uso passar do limite da de desenvolvimento.
- [ ] Limites do passo 8 revistos para o tamanho esperado do lançamento.
- [ ] Plano do Supabase decidido (passo 14). No grátis não há backup automático: o backup é o de `docs/backup.md`.
- [ ] `docs/incidentes.md` lido, e o e-mail da conta Supabase é um que você lê.
- [ ] Itens "precisa de decisão" de `docs/auditoria.md` resolvidos.
- [ ] `pnpm exec supabase config diff` lido: as diferenças esperadas são Site URL, limites e SMTP. Qualquer outra merece atenção.

## Atualizações depois do primeiro deploy

| Mudou | Faça |
| --- | --- |
| Uma migration nova | **[comando]** backup (`scripts/backup-criptografado.sh`), `pnpm exec supabase db push --dry-run`, depois `db push`, depois `pnpm verificar:deploy` |
| Os Termos ou a Política | Nova versão em `src/lib/legal.ts` **e** numa migration que troca `private.termos_versao_atual()`, na mesma entrega |
| A Edge Function | **[comando]** `pnpm exec supabase functions deploy processar-avatar` |
| O app | merge em `main`; o Vercel faz o deploy |
| App **e** migration na mesma entrega | merge em `main`, depois `git checkout main && git pull`, e só então o `db push`. Entre os dois há uma janela em que app e banco não combinam: faça em horário de pouco uso |
| Quem estava com o app aberto durante um deploy | vê "O Peripatos foi atualizado. Recarregue a página e tente de novo." ao enviar um formulário antigo. É esperado |
| `config.toml` (auth, limites, template) | **[painel]** replicar à mão, pela tabela do início |
