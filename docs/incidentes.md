# Incidentes

O que fazer quando algo dá errado em produção. Cada seção começa pelo que estanca o problema; investigar vem depois.

> As partes sobre a LGPD resumem a lei e a regulamentação da ANPD como eu as entendo. **Confirme prazos e obrigações com um advogado antes do lançamento**, e de novo se um incidente acontecer.

## Antes de qualquer coisa

1. **Anote a hora** em que você ficou sabendo e o que sabe até agora. O prazo legal de comunicação conta a partir daí.
2. **Estanque** (as seções abaixo).
3. **Não apague evidências**: logs, o deploy ruim, a migration ruim. Exporte antes de limpar.
4. Só depois investigue o alcance: quais dados, de quantas pessoas, por quanto tempo.

Onde olhar: *Supabase → Logs* (API, Auth, Postgres, Edge Functions), *Supabase → Authentication → Users*, *Vercel → Deployments* e *Logs*, e a tabela `public.moderation_actions` (toda ação de staff fica registrada, com quem e por quê).

## A chave secreta do Supabase (service role) vazou

É a pior das três: ela ignora o RLS e lê e escreve tudo, inclusive o schema `private`.

O app Next.js não usa essa chave e ela não deve existir no Vercel. Os lugares onde ela pode ter vazado são: alguém que a copiou do painel, um arquivo local (`.env`, saída de `supabase status`) ou um log.

1. **[painel]** *Project Settings → API Keys*: revogue a chave secreta e gere outra. Se o projeto ainda usa as chaves antigas em formato JWT (`service_role`), a troca é feita girando o *JWT secret*, o que **derruba todas as sessões** e troca também a chave `anon`: atualize `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no Vercel e faça *Redeploy*.
2. **[comando]** A Edge Function recebe a chave do próprio Supabase: `pnpm exec supabase functions deploy processar-avatar` para garantir que pegou a nova.
3. **[comando]** `pnpm verificar:deploy <URL> <chave publishable>`.
4. **Trate como incidente com dados pessoais** (última seção): quem teve a chave pôde ler e-mails, tags sensíveis e tudo o mais. Nos logs de API do Supabase, procure requisições com a chave secreta vindas de IPs que não são do Supabase.
5. Depois: `gitleaks` no repositório (o CI já roda) e procure a chave em históricos de terminal e de chat.

## A chave do Giphy vazou

Não dá acesso a nenhum dado do Peripatos. O risco é alguém gastar a cota, e a busca de GIFs parar.

1. **[painel, Giphy]** <https://developers.giphy.com/dashboard>: apague a chave (ou o app) e crie outra.
2. **[painel, Vercel]** troque `GIPHY_API_KEY` (*Sensitive*) e faça *Redeploy*.
3. Enquanto isso o app continua funcionando: sem chave válida, o seletor de GIF avisa que está indisponível.

Não é incidente com dados pessoais.

## A senha de app do Gmail (SMTP) vazou

Quem tem a senha consegue **mandar e-mail como o Peripatos** (phishing com cara de código de acesso) e, dependendo da conta, ler a caixa de entrada.

1. **[painel, Google]** *Conta → Segurança → Senhas de app*: revogue a senha. Confira os dispositivos conectados e a atividade recente da conta.
2. **[painel, Google]** crie uma senha de app nova.
3. **[painel, Supabase]** *Authentication → Emails → SMTP Settings*: cole a nova. Peça um código para testar.
4. Olhe os **Enviados** da conta: se saíram e-mails que não são códigos de acesso, as pessoas que receberam precisam ser avisadas. Aí é incidente com dados pessoais (os endereços foram usados por terceiros).
5. Entre a revogação e a troca ninguém consegue entrar no app. Faça os passos 1 a 3 em sequência.

## Deploy ruim no Vercel

1. **[painel]** *Deployments*: ache o último deploy bom, menu **⋯ → Instant Rollback** (ou *Promote to Production*). Leva segundos e não reconstrói nada.
2. Confirme no navegador, numa janela anônima.
3. O rollback **não desfaz migrations**. Se o deploy ruim veio junto com uma migration, o app antigo vai rodar contra o banco novo: veja a próxima seção.
4. Corrija no git (revert do commit) antes de liberar deploys de novo; enquanto o rollback estiver ativo, o Vercel não promove novos deploys sozinho.

## Migration ruim em produção

Não existe "desfazer migration". O caminho é **corrigir para a frente**.

**Antes de aplicar qualquer migration** (para o incidente não acontecer):

```bash
BACKUP_DESTINATARIO=<chave> scripts/backup-criptografado.sh   # backup de agora
pnpm exec supabase db push --dry-run                            # ler o que vai rodar
pnpm test:db                                                    # no local, com a migration nova
```

**Se já aplicou e deu errado:**

1. **Pare a sangria.** Se a migration está apagando ou corrompendo dados a cada uso, tire o app do ar: no Vercel, faça rollback para um deploy que não use o que quebrou, ou pause o projeto no Supabase (*Project Settings → General → Pause*).
2. **Não edite a migration que já rodou.** Escreva uma migration nova que corrige (recria a função, devolve a coluna, refaz a política). Teste com `pnpm test:db` e aplique com `db push`.
3. Se o histórico ficou inconsistente (a migration falhou no meio): `pnpm exec supabase migration list` para ver, e `pnpm exec supabase migration repair --status reverted <versão>` para marcar como não aplicada depois de desfazer à mão o que ela chegou a fazer.
4. **Se perdeu dados:** restaure o backup num projeto novo (`docs/backup.md`) e copie de lá só o que falta. Restaurar por cima do projeto atual apaga o que entrou depois do backup.
5. Rode `pnpm verificar:deploy`: uma migration ruim pode ter aberto uma permissão.

Migrations que **apagam coluna ou dado** (como a 13, que removeu a data de nascimento e o RA) não têm volta sem backup. Elas pedem backup conferido antes e, de preferência, duas etapas: primeiro parar de usar, depois apagar.

## Alguém da moderação perdeu o autenticador

Sem o segundo fator a pessoa não modera, e o app não tem recuperação por conta própria (de propósito: um caminho de recuperação fraco anula o segundo fator).

1. Confirme a identidade da pessoa por um canal que não seja o próprio app.
2. **[painel]** *SQL Editor*: `delete from auth.mfa_factors where user_id = '<id>';`
3. No próximo acesso a `/moderacao` ela cadastra o autenticador de novo.

Se houver suspeita de que o autenticador foi parar com outra pessoa, tire o cargo antes (`remover_cargo`) e revise `moderation_actions` desse usuário.

## Conta de moderação comprometida

1. Um admin remove o cargo em `/moderacao`, ou por SQL: `delete from public.staff_roles where user_id = '<id>';`
2. **[painel]** *Authentication → Users*: encerre as sessões do usuário.
3. Revise `select * from public.moderation_actions where actor_id = '<id>' order by created_at desc;` e desfaça o que for indevido (`restaurar_post`, `desbanir_usuario`).
4. A staff não lê e-mail nem tags sensíveis; o que ela vê são denúncias, posts ocultos e fotos pendentes. Avalie o incidente com isso em mente.

## Incidente com dados pessoais: o que a LGPD pede

**Quando é.** Qualquer acesso, perda, alteração ou vazamento indevido de dados pessoais. Exemplos aqui: a chave secreta vazou; um bug deixou alguém ler o que não devia; um backup em claro foi parar onde não devia; a conta do Gmail foi usada por terceiros.

**Quando precisa comunicar.** A LGPD (art. 48) manda o controlador comunicar à ANPD e aos titulares o incidente que **possa acarretar risco ou dano relevante**. O regulamento da ANPD (Resolução CD/ANPD nº 15/2024) trata como indício de risco relevante, entre outros, o envolvimento de **dados sensíveis** e de **dados de autenticação**. O Peripatos guarda os dois (tags de orientação sexual, identidade de gênero e religião; e-mails de login). Na dúvida, o incidente que tocou o banco deve ser tratado como comunicável.

**Prazo.** **3 dias úteis** a partir do momento em que o controlador toma conhecimento de que o incidente afetou dados pessoais, para a ANPD e para os titulares. Se ainda faltar informação, comunica-se o que se sabe e complementa-se depois (o regulamento prevê comunicação preliminar e complementação em até 20 dias úteis). Há prazos em dobro para agentes de tratamento de pequeno porte: **confirme com o advogado se o Peripatos se enquadra.**

**Para a ANPD.** Pelo formulário de comunicação de incidente no site da ANPD. O que ela pede, em resumo:

- a natureza e a categoria dos dados afetados, e quantos titulares;
- as medidas de segurança que existiam (RLS, MFA da staff, criptografia dos backups) e as tomadas depois;
- os riscos para os titulares;
- os motivos da demora, se não foi comunicado no prazo;
- a data do incidente e a de quando você soube;
- o contato do encarregado.

**Para os titulares.** Em linguagem simples, direto para cada pessoa afetada quando possível (um aviso dentro do app e um e-mail): o que aconteceu, quais dados, quais riscos, o que foi feito, o que a pessoa pode fazer para se proteger, e o contato do encarregado. No caso de tags sensíveis expostas, diga isso com todas as letras: é a informação que mais importa para quem foi afetado.

**Registro.** Todo incidente fica registrado, **mesmo os que não foram comunicados**, por no mínimo 5 anos: data, o que aconteceu, dados e titulares afetados, medidas tomadas, e por que foi (ou não foi) comunicado. Crie o arquivo `docs/registro-de-incidentes.md` no primeiro incidente; não ponha dados pessoais nele.

**Modelo de anotação**

```
Data e hora em que soube:
Como soube:
O que aconteceu:
Quando começou e quando foi estancado:
Dados afetados (categorias):
Titulares afetados (quantos, como foram identificados):
Dados sensíveis ou de autenticação envolvidos? (sim/não)
Medidas tomadas:
Comunicado à ANPD em:            Protocolo:
Comunicado aos titulares em:     Como:
Se não comunicou, por quê:
O que muda para não repetir:
```
