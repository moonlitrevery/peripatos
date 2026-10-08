-- =============================================================================
-- Notificações: cada evento, quem lê, agrupamento, bloqueio, exclusão, push
-- =============================================================================
begin;
\ir _helpers.psql
select plan(99);

select tests.seed_world();

-- quantas notificações de um tipo a pessoa tem de verdade (sem RLS)
create function tests.notifs(p_alias text, p_tipo text) returns bigint language sql stable security definer set search_path = '' as
  $$ select count(*) from public.notifications n where n.user_id = tests.uid(p_alias) and n.type::text = p_tipo $$;
create function tests.notifs_de(p_alias text, p_tipo text, p_ator text) returns bigint language sql stable security definer set search_path = '' as
  $$ select count(*) from public.notifications n
     where n.user_id = tests.uid(p_alias) and n.type::text = p_tipo and n.actor_id = tests.uid(p_ator) $$;
create function tests.pedidos_de_push() returns bigint language sql stable security definer set search_path = '' as
  $$ select count(*) from net.http_request_queue q where convert_from(q.body, 'UTF8')::jsonb ? 'notificacaoId' $$;
grant execute on function tests.notifs(text, text), tests.notifs_de(text, text, text), tests.pedidos_de_push() to authenticated;

-- ---------------------------------------------------------------------------
-- Ninguém escreve notificação pela API
-- ---------------------------------------------------------------------------
select tests.login('ana');
select throws_ok(
  format($$ insert into public.notifications (user_id, type, actor_id) values (%L, 'mutuo', %L) $$, tests.uid('bia'), tests.uid('ana')),
  '42501', null, 'usuário logado não cria notificação para ninguém'
);
select throws_ok(
  format($$ insert into public.notifications (user_id, type) values (%L, 'termos_atualizados') $$, tests.uid('ana')),
  '42501', null, 'nem para si mesmo'
);
select throws_ok($$ update public.notifications set read_at = now() $$, '42501', null, 'não edita notificação direto na tabela');
select throws_ok($$ delete from public.notifications $$, '42501', null, 'nem apaga');

-- ---------------------------------------------------------------------------
-- Novo seguidor
-- ---------------------------------------------------------------------------
insert into public.follows (followee_id) values (tests.uid('bia'));
select tests.logout();
select is(tests.notifs_de('bia', 'novo_seguidor', 'ana'), 1::bigint, 'seguir alguém pela API gera "novo seguidor" para quem foi seguido');
select is(tests.notifs('ana', 'novo_seguidor') + tests.notifs('ana', 'mutuo'), 0::bigint, 'quem seguiu não recebe nada');
select is(tests.notifs('bia', 'mutuo'), 0::bigint, 'seguir de um lado só não é mútuo');

-- só o dono lê
select tests.login('bia');
select is((select count(*) from public.notifications where type = 'novo_seguidor'), 1::bigint, 'a dona lê a própria notificação');
select tests.login('ana');
select is(
  (select count(*) from public.notifications where user_id = tests.uid('bia')), 0::bigint,
  'outra pessoa não lê as notificações da bia, nem as que falam dela mesma'
);
select tests.login_mfa('adma');
select is(
  (select count(*) from public.notifications where user_id <> tests.uid('adma')), 0::bigint,
  'nem a administração, com o segundo fator, lê notificação de outra pessoa'
);
select tests.login('zeca');
select is((select count(*) from public.notifications where user_id <> tests.uid('zeca')), 0::bigint, 'nem alguém de outra instituição');
select tests.login_anon();
select throws_ok($$ select * from public.notifications $$, '42501', null, 'anon não lê notificações');

-- ---------------------------------------------------------------------------
-- Viraram mútuos
-- ---------------------------------------------------------------------------
select tests.login('bia');
insert into public.follows (followee_id) values (tests.uid('ana'));
select tests.logout();
select is(tests.notifs_de('ana', 'mutuo', 'bia'), 1::bigint, 'seguir de volta gera "viraram mútuos" para quem tinha seguido primeiro');
select is(tests.notifs_de('bia', 'mutuo', 'ana'), 1::bigint, 'e para quem seguiu de volta');
select is(tests.notifs('ana', 'novo_seguidor'), 0::bigint, 'quem virou mútuo não recebe também um "novo seguidor"');

-- seguir, deixar de seguir e seguir de novo não repete o aviso
select tests.login('ana');
delete from public.follows where follower_id = tests.uid('ana') and followee_id = tests.uid('bia');
insert into public.follows (followee_id) values (tests.uid('bia'));
select tests.logout();
select is(tests.notifs_de('bia', 'mutuo', 'ana'), 1::bigint, 'deixar de seguir e seguir de novo não gera outra notificação de mútuo');
select is(tests.notifs_de('bia', 'novo_seguidor', 'ana'), 1::bigint, 'nem outro "novo seguidor"');

-- ---------------------------------------------------------------------------
-- Agrupamento
-- ---------------------------------------------------------------------------
select tests.follow('caio', 'bia');
select tests.follow('davi', 'bia');
select tests.login('bia');
select is(
  (select quantidade from public.minhas_notificacoes() where tipo = 'novo_seguidor'), 3,
  'três seguidores novos viram um grupo só ("3 pessoas te seguiram")'
);
select is(
  (select count(*) from public.minhas_notificacoes() where tipo = 'novo_seguidor'), 1::bigint,
  'é uma linha, não três'
);
select is(
  (select jsonb_array_length(pessoas) from public.minhas_notificacoes() where tipo = 'novo_seguidor'), 3,
  'o grupo traz as pessoas'
);
select is(
  (select pessoas -> 0 ->> 'username' from public.minhas_notificacoes() where tipo = 'novo_seguidor'), 'davi',
  'da mais recente para a mais antiga'
);
select is(
  (select array_agg(quantidade) from public.minhas_notificacoes() where tipo = 'mutuo'), array[1],
  '"viraram mútuos" não é agrupado'
);
select is(
  (select count(*) from public.minhas_notificacoes() where tipo not in ('conquista', 'novo_seguidor', 'mutuo')), 0::bigint,
  'nada de curtidas nem de tipo que não existe'
);

-- contador e leitura
select is(
  public.total_notificacoes_nao_lidas(),
  (select count(*)::integer from public.minhas_notificacoes() where not lida),
  'o contador conta os grupos não lidos, o mesmo que a aba mostra'
);
select ok(public.total_notificacoes_nao_lidas() >= 2, 'há não lidas');
select lives_ok($$ select public.marcar_notificacoes_lidas() $$, 'a dona marca as próprias como lidas');
select is(public.total_notificacoes_nao_lidas(), 0, 'e o contador zera');
select tests.login('ana');
select ok(public.total_notificacoes_nao_lidas() > 0, 'marcar como lida não mexe nas notificações de outra pessoa');

select tests.logout();
select tests.follow('moda', 'bia');
select tests.login('bia');
select is(public.total_notificacoes_nao_lidas(), 1, 'um seguidor novo depois da leitura volta a contar');
select is(
  (select array_agg(quantidade order by lida) from public.minhas_notificacoes() where tipo = 'novo_seguidor'), array[1, 3],
  'e não se mistura com o grupo já lido'
);
select tests.login_anon();
select throws_ok($$ select public.total_notificacoes_nao_lidas() $$, '42501', null, 'anon não chama as RPCs de notificação');

-- ---------------------------------------------------------------------------
-- Avatar aprovado ou recusado
-- ---------------------------------------------------------------------------
select tests.logout();
insert into storage.objects (bucket_id, name) values ('avatars', tests.uid('caio') || '/foto.webp');
insert into storage.objects (bucket_id, name) values ('avatars', tests.uid('davi') || '/foto.webp');
select is(tests.notifs('caio', 'avatar_aprovado') + tests.notifs('caio', 'avatar_recusado'), 0::bigint, 'foto pendente ainda não notifica');
select tests.login_mfa('moda');
select public.moderar_avatar(tests.uid('caio'), true, 'foto adequada');
select public.moderar_avatar(tests.uid('davi'), false, 'foto inadequada');
select tests.logout();
select is(tests.notifs('caio', 'avatar_aprovado'), 1::bigint, 'avatar aprovado notifica o dono');
select is(tests.notifs('caio', 'avatar_recusado'), 0::bigint, 'só com o tipo certo');
select is(tests.notifs('davi', 'avatar_recusado'), 1::bigint, 'avatar recusado notifica o dono');
select is(
  (select count(*) from public.notifications where type in ('avatar_aprovado', 'avatar_recusado') and actor_id is not null), 0::bigint,
  'a notificação de avatar não diz quem moderou'
);

-- ---------------------------------------------------------------------------
-- Denúncia analisada, sem dizer o que foi feito com a outra pessoa
-- ---------------------------------------------------------------------------
select tests.login('ana');
insert into public.reports (profile_id, reason, details) values (tests.uid('caio'), 'assedio', 'detalhe da denúncia');
select tests.logout();
create temp table den as select id from public.reports where reporter_id = tests.uid('ana');
grant select on den to authenticated;

select tests.login_mfa('moda');
select public.resolver_denuncia((select id from den), 'em_analise', 'olhando com calma');
select tests.logout();
select is(tests.notifs('ana', 'denuncia_analisada'), 0::bigint, '"em análise" ainda não notifica');

select tests.login_mfa('moda');
select public.banir_usuario(tests.uid('caio'), 'assédio confirmado');
select public.resolver_denuncia((select id from den), 'resolvida', 'conta banida por assédio');
select tests.logout();
select is(tests.notifs('ana', 'denuncia_analisada'), 1::bigint, 'denúncia resolvida notifica quem denunciou');
select is(tests.notifs('caio', 'denuncia_analisada'), 0::bigint, 'o denunciado não recebe nada');
select is(
  (select to_jsonb(n) - 'id' - 'created_at' from public.notifications n
    where n.user_id = tests.uid('ana') and n.type = 'denuncia_analisada'),
  jsonb_build_object(
    'user_id', tests.uid('ana'), 'type', 'denuncia_analisada', 'actor_id', null,
    'achievement_slug', null, 'read_at', null, 'pushed_at', null, 'post_id', null),
  'a notificação não guarda quem foi denunciado, o resultado, a nota nem a medida tomada'
);
select tests.login('ana');
select is(
  (select count(*) from public.minhas_notificacoes() n
    where n.tipo = 'denuncia_analisada' and to_jsonb(n)::text ~ 'banid|assédio|resolvida|caio'),
  0::bigint, 'nem a RPC devolve qualquer coisa sobre a medida'
);

-- rejeitada também é "analisada", com o mesmo texto: não dá para distinguir
select tests.login('bia');
insert into public.reports (profile_id, reason) values (tests.uid('davi'), 'spam');
select tests.login_mfa('moda');
select public.resolver_denuncia((select id from public.reports where reporter_id = tests.uid('bia')), 'rejeitada', 'não procede');
select tests.logout();
select is(tests.notifs('bia', 'denuncia_analisada'), 1::bigint, 'denúncia rejeitada gera a mesma notificação, sem dizer que foi rejeitada');

-- ---------------------------------------------------------------------------
-- Conquista nova
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.notifications n where n.user_id = tests.uid('davi') and n.achievement_slug = 'peripatetico'),
  0::bigint, 'antes do primeiro post não há notificação de Peripatético'
);
select tests.login('davi');
insert into public.posts (body) values ('primeiro post do davi');
select tests.logout();
select is(
  (select count(*) from public.notifications n
    where n.user_id = tests.uid('davi') and n.type = 'conquista' and n.achievement_slug = 'peripatetico' and n.actor_id is null),
  1::bigint, 'ganhar uma conquista gera a notificação de conquista nova'
);

-- ---------------------------------------------------------------------------
-- Termos atualizados
-- ---------------------------------------------------------------------------
-- Notificações, conquistas e tags sensíveis fora da afinidade entraram juntas:
-- UMA versão nova, para ninguém passar pelo aceite duas vezes. (Ao publicar a
-- próxima versão, atualize estes dois testes, como o literal de 140_auditoria.)
select is(
  (select array_agg(versao order by publicada_em) from private.termos_versoes),
  array['2026-10-08-rascunho', '2026-10-09-rascunho'],
  'depois da versão das mensagens existe uma única versão nova dos Termos'
);
select is(private.termos_versao_atual(), '2026-10-09-rascunho', 'e é ela a vigente');
select is(tests.notifs('ana', 'termos_atualizados'), 0::bigint, 'sem versão nova, sem notificação de termos');
insert into private.termos_versoes (versao) values ('2099-01-01-teste');
select is(private.termos_versao_atual(), '2099-01-01-teste', 'a versão publicada por último é a vigente');
select is(tests.notifs('ana', 'termos_atualizados'), 1::bigint, 'publicar uma versão dos Termos notifica quem tinha aceitado a anterior');
select is(tests.notifs('zeca', 'termos_atualizados'), 1::bigint, 'em todas as instituições');
select is(tests.notifs('novo', 'termos_atualizados'), 0::bigint, 'quem nem concluiu o onboarding não recebe (vai aceitar a versão nova direto)');
insert into private.termos_versoes (versao) values ('2099-02-01-teste');
select is(tests.notifs('ana', 'termos_atualizados'), 1::bigint, 'uma segunda versão substitui a notificação anterior em vez de acumular');
select tests.login('ana');
select throws_ok(
  $$ insert into private.termos_versoes (versao) values ('2099-03-01-forjada') $$, '42501', null,
  'usuário logado não publica versão de Termos'
);
select tests.logout();
-- todo mundo aceita a versão de teste, para o resto do arquivo poder escrever
update private.accounts set termos_versao = private.termos_versao_atual(), termos_aceitos_em = now();

-- ---------------------------------------------------------------------------
-- Bloqueio: quem você bloqueou some das suas notificações
-- ---------------------------------------------------------------------------
select tests.login('bia');
select ok(
  (select count(*) from public.notifications where actor_id = tests.uid('davi')) > 0,
  'antes do bloqueio a bia vê a notificação que aponta para o davi'
);
insert into public.blocks (blocked_id) values (tests.uid('davi'));
select is(
  (select count(*) from public.notifications where actor_id = tests.uid('davi')), 0::bigint,
  'depois de bloquear, some'
);
select is(
  (select count(*) from public.minhas_notificacoes() n where n.pessoas::text ~ 'davi'), 0::bigint,
  'e some da aba'
);
select tests.logout();
select is(
  (select count(*) from public.notifications
    where (user_id = tests.uid('bia') and actor_id = tests.uid('davi')) or (user_id = tests.uid('davi') and actor_id = tests.uid('bia'))),
  0::bigint, 'as notificações entre os dois foram apagadas de verdade, nos dois sentidos'
);
select tests.login('bia');
delete from public.blocks where blocked_id = tests.uid('davi');
select is(
  (select count(*) from public.notifications where actor_id = tests.uid('davi')), 0::bigint,
  'desbloquear não traz as notificações de volta'
);
select tests.logout();

-- bloqueado não gera notificação nova: nem consegue seguir
select tests.login('ana');
insert into public.blocks (blocked_id) values (tests.uid('moda'));
select tests.login('moda');
select throws_ok(
  format($$ insert into public.follows (followee_id) values (%L) $$, tests.uid('ana')), '42501', null,
  'quem foi bloqueado não consegue seguir, então não gera notificação'
);
select tests.logout();
select is(tests.notifs_de('ana', 'novo_seguidor', 'moda'), 0::bigint, 'nenhuma notificação do bloqueado');

-- quem foi banido também some (a linha fica, a leitura esconde)
select tests.follow('caio', 'ana');
select is(tests.notifs_de('ana', 'novo_seguidor', 'caio'), 1::bigint, 'a linha de um seguidor banido existe no banco');
select tests.login('ana');
select is(
  (select count(*) from public.notifications where actor_id = tests.uid('caio')), 0::bigint,
  'mas a notificação que aponta para uma conta banida não aparece'
);
select is(
  (select count(*) from public.minhas_notificacoes() n where n.pessoas::text ~ 'caio'), 0::bigint,
  'nem na aba'
);
select tests.logout();

-- ---------------------------------------------------------------------------
-- Push opcional por tipo
-- ---------------------------------------------------------------------------
select is(tests.pedidos_de_push(), 0::bigint, 'sem escolha de push, nenhuma notificação pediu push até aqui');

select tests.login('ana');
select throws_ok(
  format($$ insert into public.push_preferences (user_id, mutuo) values (%L, true) $$, tests.uid('bia')), '42501', null,
  'não dá para escolher o push de outra pessoa'
);
select lives_ok($$ insert into public.push_preferences (mutuo, conquista) values (true, false) $$, 'a pessoa liga o push de um tipo');
select is((select count(*) from public.push_preferences), 1::bigint, 'e lê só a própria escolha');
select tests.login('bia');
select is((select count(*) from public.push_preferences), 0::bigint, 'ninguém lê a escolha dos outros');
update public.push_preferences set mutuo = false;
select tests.logout();
select is(
  (select mutuo from public.push_preferences where user_id = tests.uid('ana')), true,
  'nem altera a escolha dos outros'
);

-- ligado, mas sem aparelho inscrito: nada sai
select tests.follow('ana', 'adma');
select tests.follow('adma', 'ana');
select is(tests.notifs_de('ana', 'mutuo', 'adma'), 1::bigint, 'a notificação de mútuo existe');
select is(tests.pedidos_de_push(), 0::bigint, 'sem aparelho inscrito, o banco nem pede o push');

insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
values (tests.uid('ana'), 'https://fcm.googleapis.com/fcm/send/aparelho-de-teste-da-ana', repeat('A', 87), repeat('B', 22));

-- tipo desligado (novo seguidor): nada sai
select tests.follow('zeca', 'modb');
select tests.follow('davi', 'ana');
select is(tests.notifs_de('ana', 'novo_seguidor', 'davi'), 1::bigint, 'a notificação de seguidor existe');
select is(tests.pedidos_de_push(), 0::bigint, 'tipo desligado não pede push, mesmo com aparelho inscrito');

-- tipo ligado, com aparelho: sai um pedido, só com o id
select tests.follow('ana', 'davi');
select is(tests.notifs_de('ana', 'mutuo', 'davi'), 1::bigint, 'novo mútuo');
select is(tests.pedidos_de_push(), 1::bigint, 'tipo ligado e aparelho inscrito: o banco pede um push');
select is(
  (select array_agg(distinct k) from net.http_request_queue q, jsonb_object_keys(convert_from(q.body, 'UTF8')::jsonb) k
    where convert_from(q.body, 'UTF8')::jsonb ? 'notificacaoId'),
  array['notificacaoId'], 'o pedido leva só o id da notificação'
);
select is(
  (select count(*) from net.http_request_queue q
    where convert_from(q.body, 'UTF8') ~* 'davi|ana|mutuo' or q.url ~* 'davi|mutuo'),
  0::bigint, 'nem o nome de ninguém, nem o tipo'
);

create temp table alvo_push as
  select n.id from public.notifications n where n.user_id = tests.uid('ana') and n.type = 'mutuo' and n.actor_id = tests.uid('davi');
grant select on alvo_push to authenticated;

select ok(not has_function_privilege('authenticated', 'public.preparar_push_de_notificacao(uuid)', 'execute'), 'usuário logado não executa preparar_push_de_notificacao');
select ok(not has_function_privilege('anon', 'public.preparar_push_de_notificacao(uuid)', 'execute'), 'nem anon');
select ok(has_function_privilege('service_role', 'public.preparar_push_de_notificacao(uuid)', 'execute'), 'a service role (a Edge Function) executa');
select tests.login('ana');
select throws_ok(
  $$ select * from public.preparar_push_de_notificacao((select id from alvo_push)) $$, '42501', null,
  'a própria dona da notificação não consegue chamar'
);
select tests.logout();

select is(
  (select to_jsonb(p) from public.preparar_push_de_notificacao((select id from alvo_push)) p),
  jsonb_build_object('destinatario', tests.uid('ana'), 'tipo', 'mutuo'),
  'devolve quem recebe e o tipo: nada sobre quem é o mútuo'
);
select is(
  (select count(*) from public.preparar_push_de_notificacao((select id from alvo_push))), 0::bigint,
  'pedir de novo não envia de novo'
);
select is(
  (select count(*) from public.preparar_push_de_notificacao(
    (select n.id from public.notifications n where n.user_id = tests.uid('ana') and n.type = 'novo_seguidor' and n.actor_id = tests.uid('davi')))),
  0::bigint, 'notificação de tipo desligado não é enviada, mesmo que alguém peça'
);
select is((select count(*) from public.preparar_push_de_notificacao(gen_random_uuid())), 0::bigint, 'notificação inexistente não envia nada');

-- o push de mensagem respeita a mesma escolha
select tests.login('ana');
select public.abrir_conversa(tests.uid('bia'));
select tests.login('bia');
insert into public.messages (conversation_id, body)
select c.id, 'oi ana' from public.conversations c;
insert into public.messages (conversation_id, body)
select c.id, 'oi de novo' from public.conversations c;
select tests.logout();
select is(
  (select count(*) from public.preparar_notificacao((select id from public.messages where body = 'oi ana'))), 1::bigint,
  'por padrão, mensagem continua gerando push'
);
update public.push_preferences set mensagem = false where user_id = tests.uid('ana');
select is(
  (select count(*) from public.preparar_notificacao((select id from public.messages where body = 'oi de novo'))), 0::bigint,
  'com o tipo "mensagem" desligado, não gera'
);

-- ---------------------------------------------------------------------------
-- Mais de 60 dias: apagadas
-- ---------------------------------------------------------------------------
update public.notifications set created_at = now() - interval '61 days'
 where user_id = tests.uid('bia') and type = 'novo_seguidor';
update public.notifications set created_at = now() - interval '59 days'
 where user_id = tests.uid('bia') and type = 'mutuo';
select ok(tests.notifs('bia', 'novo_seguidor') > 0, 'há notificações com 61 dias');
select private.tarefas_diarias();
select is(tests.notifs('bia', 'novo_seguidor'), 0::bigint, 'o job diário apaga as notificações com mais de 60 dias');
select is(tests.notifs('bia', 'mutuo'), 1::bigint, 'e deixa as de 59');
select is(
  (select count(*) from cron.job where jobname = 'peripatos-tarefas-diarias' and command ~ 'private\.tarefas_diarias'),
  1::bigint, 'o job está agendado no pg_cron'
);
select tests.login('ana');
select throws_ok($$ select private.tarefas_diarias() $$, '42501', null, 'usuário logado não roda o job');
select tests.logout();

-- ---------------------------------------------------------------------------
-- Excluir conta: somem as da pessoa e as que apontam para ela
-- ---------------------------------------------------------------------------
create temp table saiu as select tests.uid('ana') as id;
select ok((select count(*) from public.notifications where user_id = (select id from saiu)) > 0, 'a ana tem notificações');
select ok((select count(*) from public.notifications where actor_id = (select id from saiu)) > 0, 'e há notificações de outros que apontam para ela');
create temp table das_outras as
  select count(*) as n from public.notifications
  where user_id <> (select id from saiu) and actor_id is distinct from (select id from saiu);

select tests.login('ana');
select lives_ok($$ select public.excluir_conta('EXCLUIR') $$, 'a ana exclui a conta');
select tests.logout();
select is((select count(*) from public.notifications where user_id = (select id from saiu)), 0::bigint, 'as notificações dela foram apagadas');
select is((select count(*) from public.notifications where actor_id = (select id from saiu)), 0::bigint, 'e as que apontavam para ela também');
select is((select count(*) from public.push_preferences where user_id = (select id from saiu)), 0::bigint, 'e a escolha de push');
select is(
  (select count(*) from public.notifications), (select n from das_outras),
  'as notificações que não tinham nada com ela continuam'
);

select * from finish();
rollback;
