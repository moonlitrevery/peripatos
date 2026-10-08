# Notificações e conquistas

O que o marco 3 acrescentou e o que precisa de uma decisão sua em produção.
Tudo aqui mora no banco: `supabase/migrations/20261009000002_notificacoes_e_conquistas.sql`
(e, para Eco, Eureka, Hefesto, Nóstos e Panateneia, `20261012000001_recem_chegados_e_conquistas.sql`).

## O que você precisa configurar

Os valores abaixo ficam em `private.config`, uma tabela que a API não
alcança. Mudam por ambiente e **não vão para o git nem para uma migration**.
Rode no SQL Editor do painel do Supabase (ou com `psql`), como `postgres`.

As três datas (`fundador_ate`, `panateneia_inicio`, `panateneia_fim`) também
podem ser mudadas pela administração, sem SQL, com a RPC
`public.definir_configuracao(p_chave, p_valor, p_motivo)`: só admin com o
segundo fator, com o motivo registrado em `moderation_actions`
(`alterar_configuracao`). `public.configuracoes()` devolve os valores atuais.
Ainda não há tela para isso. A resposta do enigma continua só por SQL.

### 1. Fim do beta (conquista Fundador)

Fundador é de quem criou a conta **antes** da data de corte. Enquanto a data
não existe, o beta está aberto e todo mundo que conclui o onboarding ganha.

```sql
insert into private.config (chave, valor)
values ('fundador_ate', '2027-03-01 00:00:00-03')
on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
```

Defina a data **antes ou no dia** em que o beta acabar. Conquista é
permanente: quem ganhou enquanto a data não existia continua Fundador, mesmo
que a data que você escolher seja anterior à conta da pessoa.

### 2. A resposta do enigma (conquista Minotauro)

O banco guarda só um hash bcrypt da resposta. **O projeto sobe com o enigma
fechado**: a migration `20261011000001_enigma_fechado.sql` grava o hash de uma
resposta aleatória de 256 bits, gerada dentro do banco e descartada na mesma
instrução. Ninguém a conhece (nem eu, nem você, nem está em arquivo algum), e
até você trocar a conquista é impossível. Para definir a resposta de verdade,
ou trocá-la depois:

```sql
select private.definir_resposta_do_enigma('a resposta aqui');
```

- Maiúsculas, espaços nas pontas e espaços repetidos não contam (`"  Fio  DE ariadne"`
  e `"fio de ariadne"` são a mesma resposta). Acento conta. Até 72 caracteres.
- Trocar a resposta não tira o Minotauro de quem já resolveu.
- Para fechar o enigma de novo: `select private.definir_resposta_do_enigma(encode(extensions.gen_random_bytes(32), 'hex'));`
- A resposta aparece no comando que você roda. Não a ponha em migration, em
  `seed.sql`, em issue nem em commit; o histórico do SQL Editor é seu, mas apague
  a consulta salva se o projeto tiver outros administradores.

**A tela do enigma não existe ainda.** A mecânica é a RPC
`public.responder_enigma(p_resposta text) returns boolean`: `true` se acertou
(e concede a conquista), `false` se errou. Quando você escrever o enigma, a
tela só precisa de uma server action que chame essa RPC; a resposta nunca
passa pelo código do cliente.

Limite de tentativas, por pessoa: **5 por hora e 20 por dia**. Toda tentativa
conta, certa ou errada, e acima do limite a RPC responde 429 mesmo que a
resposta esteja certa. Quem já resolveu não gasta tentativa.

### 3. A semana de abertura pública (conquista Panateneia)

Panateneia é de quem **concluiu o onboarding** dentro da janela. Enquanto
faltar uma das duas datas, ninguém ganha. O início conta, o fim não.

```sql
insert into private.config (chave, valor) values
  ('panateneia_inicio', '2027-03-01 00:00:00-03'),
  ('panateneia_fim',    '2027-03-08 00:00:00-03')
on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
```

Defina **antes** de a semana começar: a conquista é conferida na hora em que
a pessoa conclui o onboarding. Se a janela for definida (ou corrigida) depois,
quem concluiu dentro dela só ganha na próxima vez em que o perfil for
conferido (ao mexer na bio, no avatar ou nos gostos). Para conceder de uma vez
a todo mundo que se encaixa:

```sql
select private.conquistas_do_perfil(p.id) from public.profiles p where p.onboarding_completo;
```

Mudar ou apagar a janela não tira a conquista de quem já ganhou.

## Notificações

| Evento | Quem recebe | Como nasce |
| --- | --- | --- |
| Novo seguidor | quem foi seguido | trigger em `follows`. Se o follow veio de um post (`follows.via_post_id`), a notificação guarda o post e diz "te seguiu pelo seu post" |
| Vocês viraram mútuos | os dois | trigger em `follows` |
| Avatar aprovado / recusado | o dono da foto | trigger em `profiles` (pendente → aprovado/recusado) |
| Denúncia analisada | quem denunciou | trigger em `reports` (resolvida ou rejeitada) |
| Termos atualizados | quem tinha aceitado a versão anterior | trigger em `private.termos_versoes` |
| Conquista nova | quem ganhou | trigger em `user_achievements` |

- Nenhum papel da API tem INSERT, UPDATE ou DELETE em `notifications`.
- Só o dono lê. A que aponta para alguém que ele não pode ver (bloqueio,
  banimento) não aparece; bloquear apaga as notificações entre os dois.
- "Denúncia analisada" não guarda qual denúncia, o resultado nem a nota.
- Seguidores novos do mesmo dia viram um grupo ("3 pessoas te seguiram"), e o
  contador da aba conta grupos. "Viraram mútuos" nunca é agrupado.
- O mesmo aviso sobre a mesma pessoa não se repete em 7 dias (seguir, deixar
  de seguir e seguir de novo não gera outra notificação).
- Mais de 60 dias: apagadas pelo job diário.
- **Seguir pelo post** (`20261013000001_seguir_pelo_post.sql`): a origem é
  opcional, tem de ser um post de quem está sendo seguido e que esteja no ar, e
  nenhum papel da API lê `follows.via_post_id` (a leitura de `follows` é por
  coluna). Só a pessoa seguida fica sabendo, pela aba de notificações, com até
  80 caracteres do post. Quem veio por um post tem uma linha só dele, fora do
  grupo "3 pessoas te seguiram". Post apagado ou ocultado: a notificação volta
  a ser um novo seguidor comum, sem o trecho.

### Push por tipo

A escolha fica em `push_preferences` (uma linha por conta). Sem linha valem os
padrões: mensagens sim, o resto não. O banco só pede o push se o tipo está
ligado **e** existe aparelho inscrito, e o pedido vai para a mesma Edge
Function das mensagens (`notificar-mensagem`), com o mesmo endereço e segredo
do Vault: **não há segredo novo para configurar**, mas a função precisa ser
publicada de novo (`supabase functions deploy notificar-mensagem`).

O texto do push é fixo por tipo e não cita ninguém: nem quem seguiu, nem qual
conquista (pode ser secreta), nem se a foto foi aprovada ou recusada.

### Termos: como publicar uma versão agora

A versão vigente deixou de ser o corpo de `private.termos_versao_atual()` e
passou a ser a linha mais recente de `private.termos_versoes`. Para mudar os
Termos, uma migration nova faz:

```sql
insert into private.termos_versoes (versao) values ('2027-01-15');
```

e `src/lib/legal.ts` muda na mesma entrega. O INSERT dispara a notificação de
termos atualizados.

## Conquistas

| Conquista | Regra | Quando é conferida |
| --- | --- | --- |
| Fundador | conta criada antes de `fundador_ate` | ao concluir o onboarding |
| Peripatético | primeiro post | trigger em `posts` |
| Conhece-te a ti mesmo | bio, avatar aprovado ou pronto, e ao menos um gosto comum | triggers em `profiles` e `profile_tags` |
| Hermes | primeira mensagem enviada | trigger em `messages` |
| Xênia | ser o primeiro mútuo de alguém com conta de até 14 dias | ao virar mútuo |
| Ponte | virar mútuo de alguém sem tag de curso em comum, os dois com tag de curso | ao virar mútuo |
| Polímata | gostos comuns em 5 categorias ou mais | trigger em `profile_tags` |
| Simpósio | dez mútuos ao mesmo tempo | ao virar mútuo |
| Koinonia | trio em que os três são mútuos | ao virar mútuo (os três ganham) |
| Philia | mútuo da mesma pessoa há 6 meses sem interrupção | job diário |
| Odisseia | um ano de conta | job diário |
| Héracles | reportou um bug confirmado | RPC `conceder_conquista`, só admin com 2FA, registrada em `moderation_actions` |
| Coruja de Atena (secreta, privada) | post ou mensagem entre 01:00 e 04:30, horário de Brasília | triggers em `posts` e `messages` |
| Minotauro (secreta) | resolver o enigma | RPC `responder_enigma` |
| Eco | alguém seguiu de volta menos de uma hora depois de você seguir (ganha quem seguiu primeiro) | trigger em `follows`, ao virar mútuo |
| Eureka | pediu uma tag nova e o pedido foi aprovado | trigger em `tag_requests` (status → aprovada) |
| Hefesto | deu uma sugestão que virou funcionalidade | RPC `conceder_conquista`, só admin com 2FA, registrada em `moderation_actions` |
| Nóstos | publicou um post 30 dias ou mais depois do post anterior | trigger em `posts` |
| Panateneia | concluiu o onboarding entre `panateneia_inicio` e `panateneia_fim` | ao concluir o onboarding |

- **Só o banco concede.** Não existe INSERT nem DELETE em `user_achievements`
  para nenhum papel da API. A única coluna que a pessoa altera é `hidden`, e só
  na própria linha.
- **Permanente.** Perder os mútuos, apagar o post ou trocar a data de corte
  não tira conquista. Ela só some com a exclusão da conta.
- **Secreta** não aparece no catálogo de quem nunca viu ninguém com ela.
  **Privada por padrão** nasce com `hidden = true`.
- **A Coruja não registra nada de novo.** Usa `posts.created_at` e
  `messages.created_at`, que já existiam. Não há tabela nem coluna de acesso,
  presença ou atividade (o teste `180_conquistas.sql` confere).
- **A Koinonia não diz com quem.** A linha tem só dono, conquista e
  visibilidade; a notificação não aponta para ninguém; e a data em que cada um
  ganhou fica em `private.achievement_dates`, fora da API (três pessoas ganham
  no mesmo instante, e a data igual entregaria o trio). O que não dá para
  esconder: quem está no trio vê a conquista aparecer no perfil dos outros
  dois, se eles a deixarem à mostra.
- **Philia** não precisou de tabela nova: o mútuo começa quando o segundo dos
  dois follows foi criado, e deixar de seguir apaga a linha.

### Job diário

`private.tarefas_diarias()` roda pelo pg_cron todo dia às 03:23 (Brasília):
apaga notificações com mais de 60 dias e concede Odisseia e Philia. Para
conferir em produção:

```sql
select jobname, schedule, active from cron.job;
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
```

### Quem já tinha conta

A migration concede, na hora em que roda, o que os dados existentes
justificam (Fundador, Peripatético, Hermes, Coruja, Polímata, Conhece-te, e as
de mútuo), e cada uma gera a notificação de conquista nova.

## Decisões que tomei e que você pode querer rever

- **Eco** é de quem seguiu primeiro, e usa `follows.created_at`, que já
  existia. Deixar de seguir e seguir de novo cria um follow com data nova.
- **Nóstos** conta o post anterior mesmo apagado ou ocultado (a pessoa
  publicou), e o primeiro post de alguém nunca é Nóstos.
- **Panateneia** usa a data em que o onboarding foi concluído
  (`accounts.maioridade_verificada_em`), não a da criação da conta.
- **Quem já tinha conta** recebeu, na migration
  `20261012000001_recem_chegados_e_conquistas.sql`, Eco, Eureka e Nóstos que os
  dados existentes justificam, com a notificação de conquista nova.

- **Fundador sem data = beta aberto.** A alternativa era inventar uma data.
- **Xênia** usa "tem exatamente um mútuo agora" como "primeiro mútuo": não há
  histórico de mútuos desfeitos, e eu não quis começar a guardar um.
- **"Tags escolhidas"** em Conhece-te a ti mesmo conta só tags comuns. Com as
  sensíveis, a conquista pública denunciaria que alguém tem tag sensível.
- **Secreta que você ainda não ganhou** pode aparecer no perfil de quem a
  ganhou e escolheu mostrar (é o caso do Minotauro). Ela não aparece na sua
  lista de conquistas, e a página dela só abre para quem já viu alguém com ela.
- **Os Termos ganharam UMA versão nova** (`2026-10-09-rascunho`), que cobre
  de uma vez as notificações, as conquistas e as tags sensíveis fora da
  afinidade. No deploy, quem já tem conta passa pela tela de novo aceite uma
  vez só. O teste `170_notificacoes.sql` confere que existe uma única linha
  nova em `private.termos_versoes`.
