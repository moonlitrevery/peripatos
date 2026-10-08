-- =============================================================================
-- Mensagens: exclusão de conta, novo aceite dos termos, push pedido pelo banco
-- =============================================================================
begin;
\ir _helpers.psql
select plan(51);

select tests.seed_world();

create function tests.conv_de(p_alias text) returns uuid language sql stable security definer set search_path = '' as
  $$ select c.id from public.conversations c where tests.uid(p_alias) in (c.user_a, c.user_b) order by c.created_at limit 1 $$;
create function tests.msg(p_body text) returns uuid language sql stable security definer set search_path = '' as
  $$ select m.id from public.messages m where m.body = p_body and m.sender_id in (select u.id from tests.users u) $$;
create function tests.pedidos(p_mensagem uuid) returns bigint language sql stable security definer set search_path = '' as
  $$ select count(*) from net.http_request_queue q where convert_from(q.body, 'UTF8')::jsonb ->> 'mensagemId' = p_mensagem::text $$;
grant execute on function tests.conv_de(text), tests.msg(text), tests.pedidos(uuid) to authenticated;

select tests.follow('ana', 'bia');
select tests.follow('bia', 'ana');
select tests.follow('caio', 'davi');
select tests.follow('davi', 'caio');

-- ---------------------------------------------------------------------------
-- 3 · A notificação é pedida pelo banco, a cada mensagem, só com o id
-- ---------------------------------------------------------------------------
select tests.login('ana');
select public.abrir_conversa(tests.uid('bia'));
insert into public.messages (conversation_id, body) values (tests.conv_de('ana'), 'texto particular da ana');
select tests.login('bia');
insert into public.messages (conversation_id, body) values (tests.conv_de('ana'), 'resposta da bia');

select tests.logout();
select is(tests.pedidos(tests.msg('texto particular da ana')), 1::bigint, 'uma mensagem gravada direto na tabela gera um pedido de notificação');
select is(tests.pedidos(tests.msg('resposta da bia')), 1::bigint, 'cada mensagem gera o seu');
select is(
  (select count(*) from net.http_request_queue q
    where convert_from(q.body, 'UTF8') ~ 'particular|resposta' or q.headers::text ~ 'particular|resposta' or q.url ~ 'particular|resposta'),
  0::bigint, 'o pedido não leva o texto da mensagem em lugar nenhum'
);
select is(
  (select array_agg(distinct k order by k) from net.http_request_queue q, jsonb_object_keys(convert_from(q.body, 'UTF8')::jsonb) k),
  array['mensagemId'], 'o corpo do pedido tem só o id da mensagem'
);
select is(
  (select count(*) from net.http_request_queue q
    where q.url <> (select decrypted_secret from vault.decrypted_secrets where name = 'peripatos_push_url')
       or q.headers ->> 'x-peripatos-segredo' is distinct from (select decrypted_secret from vault.decrypted_secrets where name = 'peripatos_push_segredo')),
  0::bigint, 'o pedido vai para o endereço do Vault, com o segredo do Vault'
);

-- preparar_notificacao: só a service role chama
select ok(not has_function_privilege('authenticated', 'public.preparar_notificacao(uuid)', 'execute'), 'usuário logado não executa preparar_notificacao');
select ok(not has_function_privilege('anon', 'public.preparar_notificacao(uuid)', 'execute'), 'nem anon');
select ok(has_function_privilege('service_role', 'public.preparar_notificacao(uuid)', 'execute'), 'a service role (a Edge Function) executa');
select tests.login('ana');
select throws_ok(
  format($$ select * from public.preparar_notificacao(%L) $$, tests.msg('resposta da bia')), '42501', null,
  'participante da conversa não consegue chamar'
);
select tests.logout();

select is(
  (select to_jsonb(n) from public.preparar_notificacao(tests.msg('texto particular da ana')) n),
  jsonb_build_object('destinatario', tests.uid('bia'), 'remetente', 'Ana', 'conversa', tests.conv_de('ana')),
  'devolve quem recebe, o nome de quem enviou e a conversa, e nada do conteúdo'
);
select ok(
  (select notified_at is not null from public.messages where id = tests.msg('texto particular da ana')),
  'e marca a mensagem como notificada'
);
select is(
  (select count(*) from public.preparar_notificacao(tests.msg('texto particular da ana'))), 0::bigint,
  'pedir de novo não notifica de novo'
);
update public.messages set created_at = now() - interval '10 minutes' where id = tests.msg('resposta da bia');
select is(
  (select count(*) from public.preparar_notificacao(tests.msg('resposta da bia'))), 0::bigint,
  'mensagem antiga não gera notificação'
);
select is((select count(*) from public.preparar_notificacao(gen_random_uuid())), 0::bigint, 'mensagem inexistente não gera notificação');

-- conversa fechada: sem notificação, mesmo que alguém peça
select tests.login('ana');
insert into public.messages (conversation_id, body) values (tests.conv_de('ana'), 'antes de deixar de seguir');
select tests.logout();
delete from public.follows where follower_id = tests.uid('bia') and followee_id = tests.uid('ana');
select is(
  (select count(*) from public.preparar_notificacao(tests.msg('antes de deixar de seguir'))), 0::bigint,
  'depois que deixam de se seguir, uma mensagem pendente não notifica'
);
select is(
  (select notified_at from public.messages where id = tests.msg('antes de deixar de seguir')), null,
  'e nem é marcada como notificada'
);
select tests.follow('bia', 'ana');

-- ---------------------------------------------------------------------------
-- 2 · Quem não aceitou a versão vigente dos termos não posta nem manda mensagem
-- ---------------------------------------------------------------------------
select tests.login('caio');
select public.abrir_conversa(tests.uid('davi'));
select lives_ok($$ insert into public.posts (body) values ('post com os termos em dia') $$, 'com os termos em dia, posta');
select lives_ok(
  format($$ insert into public.messages (conversation_id, body) values (%L, 'mensagem com os termos em dia') $$, tests.conv_de('caio')),
  'e manda mensagem'
);

select tests.logout();
update private.accounts set termos_versao = '2020-01-01-antiga' where user_id = tests.uid('caio');

select tests.login('caio');
select is(public.conta_status() ->> 'termos_em_dia', 'false', 'conta_status avisa que os termos não estão em dia');
select throws_ok($$ insert into public.posts (body) values ('sem aceitar') $$, '42501', null, 'sem o aceite da versão vigente não posta');
select throws_ok(
  format($$ insert into public.messages (conversation_id, body) values (%L, 'sem aceitar') $$, tests.conv_de('caio')),
  '42501', null, 'nem manda mensagem'
);
select ok((select count(*) from public.messages) > 0, 'continua lendo as conversas');
select ok((select count(*) from public.profiles) > 0, 'e vendo os perfis: o bloqueio é só para publicar');
select is(private.is_active(tests.uid('caio')), true, 'a conta não fica inativa nem some para os outros');

select tests.login('davi');
select lives_ok(
  format($$ insert into public.messages (conversation_id, body) values (%L, 'davi está em dia') $$, tests.conv_de('caio')),
  'a outra pessoa, que está em dia, continua escrevendo normalmente'
);

select tests.login('caio');
select throws_ok($$ select public.aceitar_termos('2020-01-01-antiga') $$, 'PT400', null, 'não dá para "aceitar" uma versão que não é a vigente');
select throws_ok($$ select public.aceitar_termos(null) $$, 'PT400', null, 'nem sem dizer a versão');
select throws_ok($$ update private.accounts set termos_versao = private.termos_versao_atual() $$, '42501', null, 'nem escrevendo direto na conta');
select lives_ok($$ select public.aceitar_termos(private.termos_versao_atual()) $$, 'aceitar a versão vigente funciona');
select is(public.conta_status() ->> 'termos_em_dia', 'true', 'e a conta fica em dia');
select lives_ok($$ insert into public.posts (body) values ('aceitei') $$, 'depois do aceite, volta a postar');
select lives_ok(
  format($$ insert into public.messages (conversation_id, body) values (%L, 'aceitei') $$, tests.conv_de('caio')),
  'e a mandar mensagem'
);
select tests.logout();
select ok(
  (select termos_versao = private.termos_versao_atual() and termos_aceitos_em > now() - interval '1 minute'
   from private.accounts where user_id = tests.uid('caio')),
  'a versão e a data do novo aceite ficam registradas'
);
select tests.login_anon();
select throws_ok($$ select public.aceitar_termos('x') $$, '42501', null, 'anon não aceita termos');

-- ---------------------------------------------------------------------------
-- 1 · Excluir a conta apaga só as mensagens de quem saiu
-- ---------------------------------------------------------------------------
-- A bia denuncia uma mensagem da ana antes de a ana sair.
select tests.login('bia');
select public.denunciar_mensagem(tests.msg('texto particular da ana'), 'assedio', 'denúncia antes da exclusão');
create temp table antes as
  select tests.conv_de('ana') as conversa, tests.uid('ana') as ana, tests.uid('bia') as bia;
grant select on antes to authenticated;

select tests.login('ana');
select lives_ok($$ select public.excluir_conta('EXCLUIR') $$, 'ana exclui a conta');

select tests.logout();
select is(
  (select count(*) from public.messages where conversation_id = (select conversa from antes) and sender_id = (select ana from antes)),
  0::bigint, 'as mensagens de quem saiu foram apagadas'
);
select is(
  (select array_agg(body order by created_at) from public.messages where conversation_id = (select conversa from antes)),
  array['resposta da bia'], 'as da outra pessoa ficaram'
);
select is(
  (select num_nulls(user_a, user_b) from public.conversations where id = (select conversa from antes)), 1,
  'a conversa continua existindo, com o lugar de quem saiu vazio'
);
select is(
  (select message_body || '|' || (message_sender_id is null)::text || '|' || details
   -- só a denúncia deste teste: num banco que já rodou o e2e existem outras
   from public.reports where message_id is not null and reporter_id = (select bia from antes)),
  'texto particular da ana|true|denúncia antes da exclusão',
  'a cópia na denúncia continua como está, só sem a ligação com a conta'
);

select tests.login('bia');
select is(
  (select to_jsonb(c) - 'ultima_em' - 'conversa_id' from public.minhas_conversas() c),
  '{"outro_id": null, "outro_excluido": true, "username": null, "display_name": null, "avatar_path": null, "avatar_preset": null,
    "previa": "resposta da bia", "previa_minha": true, "nao_lidas": 0, "aberta": false}'::jsonb,
  'para quem ficou, a conversa aparece como sendo com uma conta excluída, e fechada'
);
select is((select count(*) from public.messages), 1::bigint, 'ela continua lendo as próprias mensagens');
select throws_ok(
  format($$ insert into public.messages (conversation_id, body) values (%L, 'tem alguém aí?') $$, (select conversa from antes)),
  '42501', null, 'mas não envia para uma conta que não existe mais'
);
select lives_ok(format($$ select public.marcar_conversa_lida(%L) $$, (select conversa from antes)), 'e ainda marca como lida');
delete from public.messages where body = 'resposta da bia';
select tests.logout();
select is(
  (select count(*) from public.messages where conversation_id = (select conversa from antes)), 0::bigint,
  'ela ainda pode apagar as próprias mensagens'
);

select tests.login('caio');
select is(
  (select count(*) from public.conversations where id = (select conversa from antes)), 0::bigint,
  'um terceiro continua sem ver a conversa'
);
select tests.login_mfa('moda');
select is(
  (select count(*) from public.conversations) + (select count(*) from public.messages), 0::bigint,
  'e a staff também'
);
select is(
  (select message_body from public.reports where message_id is not null), 'texto particular da ana',
  'a staff continua vendo só a cópia da denúncia'
);

-- quando a segunda pessoa também sai, não sobra nada
select tests.login('bia');
select lives_ok($$ select public.excluir_conta('EXCLUIR') $$, 'bia também exclui a conta');
select tests.logout();
select is(
  (select count(*) from public.conversations where id = (select conversa from antes)), 0::bigint,
  'sem ninguém, a conversa é apagada'
);
select is(
  (select count(*) from public.conversation_reads where conversation_id = (select conversa from antes)), 0::bigint,
  'junto com os marcadores de leitura'
);
-- a outra conversa do teste, de quem não saiu, está intacta
select is(
  (select count(*) from public.messages where conversation_id = tests.conv_de('caio')), 3::bigint,
  'a conversa de quem não excluiu a conta não foi tocada'
);

select * from finish();
rollback;
