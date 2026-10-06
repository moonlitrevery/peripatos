-- =============================================================================
-- Excluir conta (LGPD): apaga tudo da pessoa; fica só o que a segurança exige
-- =============================================================================
begin;
\ir _helpers.psql
select plan(31);

select tests.seed_world();
select tests.add_tag('ana', 't-rock');
select tests.add_tag('ana', 't-sensivel');
select tests.follow('ana', 'bia');
select tests.follow('bia', 'ana');
select tests.mk_post('ana', 'post da ana', interval '1 hour');
select tests.mk_post('bia', 'post da bia', interval '1 hour');
insert into public.blocks (blocker_id, blocked_id) values (tests.uid('ana'), tests.uid('caio'));
insert into public.blocks (blocker_id, blocked_id) values (tests.uid('davi'), tests.uid('ana'));
insert into public.reports (reporter_id, institution_id, post_id, reason)
select p.id, p.institution_id, (select id from public.posts where body = 'post da bia'), 'spam'
from public.profiles p where p.id = tests.uid('ana');
insert into public.reports (reporter_id, institution_id, profile_id, reason)
select p.id, p.institution_id, tests.uid('ana'), 'assedio'
from public.profiles p where p.id = tests.uid('bia');
insert into public.tag_requests (user_id, institution_id, name)
select p.id, p.institution_id, 'Tag pedida' from public.profiles p where p.id = tests.uid('ana');

create temp table alvo as select tests.uid('ana') as id, tests.email('ana') as email;
grant select on alvo to authenticated;

-- a moderação agiu sobre a ana antes
select tests.login('moda');
select public.ocultar_post((select id from public.posts where body = 'post da ana'), 'conteúdo inadequado');

-- ana tem um avatar processado e um original ainda no bucket de entrada
select tests.logout();
insert into storage.objects (bucket_id, name) values ('avatars', tests.uid('ana') || '/foto.webp');
select tests.login('ana');
insert into storage.objects (bucket_id, name) values ('avatar-uploads', auth.uid() || '/original.jpg');

-- ---------------------------------------------------------------------------
-- Travas
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.excluir_conta('sim') $$, 'PT400', null,
  'sem a confirmação exata a conta não é excluída'
);
select throws_ok(
  $$ select public.excluir_conta(null) $$, 'PT400', null,
  'confirmação nula também não'
);
select throws_ok(
  $$ select public.excluir_conta('EXCLUIR') $$, 'PT409', null,
  'com arquivo de avatar ainda no storage a exclusão é recusada (não deixa arquivo órfão)'
);
select tests.logout();
select is((select count(*) from auth.users where id = (select id from alvo)), 1::bigint, 'as recusas não apagaram nada');

-- a própria pessoa apaga o arquivo (o que a Storage API faz com a sessão dela)
select tests.login('ana');
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'avatars' and name = auth.uid() || '/foto.webp';
select throws_ok(
  $$ select public.excluir_conta('EXCLUIR') $$, 'PT409', null,
  'um original esquecido no bucket de entrada também trava a exclusão'
);
delete from storage.objects where bucket_id = 'avatar-uploads' and name = auth.uid() || '/original.jpg';

select lives_ok(
  $$ select public.excluir_conta('EXCLUIR') $$,
  'com os arquivos apagados, a pessoa exclui a própria conta'
);

-- ---------------------------------------------------------------------------
-- Sumiu tudo
-- ---------------------------------------------------------------------------
select tests.logout();
select is((select count(*) from auth.users where id = (select id from alvo)), 0::bigint, 'usuário do Auth apagado');
select is((select count(*) from auth.identities where user_id = (select id from alvo)), 0::bigint, 'identidades do Auth apagadas');
select is((select count(*) from auth.sessions where user_id = (select id from alvo)), 0::bigint, 'sessões apagadas');
select is((select count(*) from private.accounts where user_id = (select id from alvo)), 0::bigint, 'conta privada (RA, nascimento) apagada');
select is((select count(*) from public.profiles where id = (select id from alvo)), 0::bigint, 'perfil apagado');
select is((select count(*) from public.posts where author_id = (select id from alvo)), 0::bigint, 'posts apagados (de verdade, não soft delete)');
select is((select count(*) from public.profile_tags where user_id = (select id from alvo)), 0::bigint, 'tags comuns apagadas');
select is((select count(*) from public.profile_sensitive_tags where user_id = (select id from alvo)), 0::bigint, 'tags sensíveis apagadas');
select is(
  (select count(*) from public.follows where (select id from alvo) in (follower_id, followee_id)), 0::bigint,
  'follows apagados nos dois sentidos'
);
select is(
  (select count(*) from public.blocks where (select id from alvo) in (blocker_id, blocked_id)), 0::bigint,
  'blocks apagados nos dois sentidos'
);
select is(
  (select count(*) from public.reports where (select id from alvo) in (reporter_id, profile_id)), 0::bigint,
  'denúncias feitas por ela e contra o perfil dela apagadas'
);
select is((select count(*) from public.reports), 0::bigint, '...inclusive a que ela fez contra o post de outra pessoa');
select is((select count(*) from public.tag_requests where user_id = (select id from alvo)), 0::bigint, 'pedidos de tag apagados');
select is(
  (select count(*) from storage.objects where name like (select id from alvo) || '/%'), 0::bigint,
  'nenhum arquivo de avatar restou'
);
select is((select count(*) from private.rate_limit_events where user_id = (select id from alvo)), 0::bigint, 'contadores de rate limit apagados');
select is((select count(*) from public.posts where body = 'post da bia'), 1::bigint, 'o conteúdo dos outros continua');

-- ---------------------------------------------------------------------------
-- O que fica
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.moderation_actions where action = 'ocultar_post' and reason = 'conteúdo inadequado'),
  1::bigint, 'o registro de moderação continua'
);
select is(
  (select target_user_id is null and target_post_id is null from public.moderation_actions where action = 'ocultar_post'),
  true, '...sem apontar para a conta nem para o post apagados'
);
select is(
  (select metadata ->> 'alvo_excluido_hmac' from public.moderation_actions where action = 'ocultar_post'),
  encode(private.email_hmac((select email from alvo)), 'hex'),
  '...e com o HMAC do e-mail, para reconhecer reincidência sem guardar o e-mail'
);
select ok(
  (select position((select email from alvo) in string_agg(to_jsonb(m)::text, ' ')) = 0 from public.moderation_actions m),
  'o e-mail em si não fica em lugar nenhum da trilha'
);
select is((select count(*) from private.banned_emails), 0::bigint, 'quem não estava banido não entra em banned_emails');
select lives_ok(
  $$ insert into auth.users (id, email) select gen_random_uuid(), email from alvo $$,
  'quem excluiu a conta (sem banimento) pode se cadastrar de novo'
);

-- ---------------------------------------------------------------------------
-- Excluir a conta não desfaz um banimento
-- ---------------------------------------------------------------------------
create temp table banido as select tests.uid('caio') as id, tests.email('caio') as email;
grant select on banido to authenticated;
select tests.login('moda');
select public.banir_usuario(tests.uid('caio'), 'spam em massa');

select tests.login('caio');
select lives_ok(
  $$ select public.excluir_conta('EXCLUIR') $$,
  'conta banida também pode ser excluída (o direito de exclusão continua valendo)'
);
select tests.logout();
select is(
  (select count(*) from private.banned_emails where email_hmac = private.email_hmac((select email from banido))),
  1::bigint, 'o HMAC de banimento permanece depois da exclusão'
);
select throws_ok(
  $$ insert into auth.users (id, email) select gen_random_uuid(), email from banido $$, 'PT403', null,
  'e o e-mail banido continua sem poder se cadastrar'
);

select * from finish();
rollback;
