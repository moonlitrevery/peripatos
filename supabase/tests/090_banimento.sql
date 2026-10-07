-- =============================================================================
-- Banimento: some de tudo, perde acesso e o e-mail não volta
-- =============================================================================
begin;
\ir _helpers.psql
select plan(29);

select tests.seed_world();
select tests.add_tag('ana', 't-rock');
select tests.add_tag('bia', 't-rock');
select tests.mk_post('bia', 'post da bia', interval '1 hour');

-- antes
select tests.login('ana');
select is((select count(*) from public.profiles where id = tests.uid('bia')), 1::bigint, 'antes: perfil visível');
select is((select count(*) from public.feed(null, 50) where author_id = tests.uid('bia')), 1::bigint, 'antes: aparece no feed');
select is(
  (select count(*) from public.pessoas_parecidas(50) where user_id = tests.uid('bia')), 1::bigint,
  'antes: aparece em pessoas_parecidas'
);

-- ---------------------------------------------------------------------------
-- Quem pode banir
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$ select public.banir_usuario(%L, 'não fui com a cara') $$, tests.uid('bia')),
  'PT403', null, 'usuária comum não bane'
);
select tests.login_mfa('modb');
select throws_ok(
  format($$ select public.banir_usuario(%L, 'cruzando instituição') $$, tests.uid('bia')),
  'PT403', null, 'staff de outra instituição não bane'
);
select tests.login_mfa('moda');
select throws_ok(
  $$ select public.banir_usuario(auth.uid(), 'auto') $$,
  'PT400', null, 'ninguém bane a si mesmo'
);
select throws_ok(
  format($$ select public.banir_usuario(%L, 'golpe') $$, tests.uid('adma')),
  'PT403', null, 'moderador não bane admin'
);
select throws_ok(
  format($$ select public.banir_usuario(%L, null) $$, tests.uid('bia')),
  'PT400', null, 'banir exige motivo'
);
select lives_ok(
  format($$ select public.banir_usuario(%L, 'assédio reiterado') $$, tests.uid('bia')),
  'moderador da instituição bane'
);

-- ---------------------------------------------------------------------------
-- Banida some para os outros
-- ---------------------------------------------------------------------------
select tests.login('ana');
select is((select count(*) from public.profiles where id = tests.uid('bia')), 0::bigint, 'banida some dos perfis');
select is((select count(*) from public.posts where author_id = tests.uid('bia')), 0::bigint, 'os posts da banida somem');
select is((select count(*) from public.profile_tags where user_id = tests.uid('bia')), 0::bigint, 'as tags da banida somem');
select is((select count(*) from public.feed(null, 50) where author_id = tests.uid('bia')), 0::bigint, 'banida some do feed');
select is(
  (select count(*) from public.pessoas_parecidas(50) where user_id = tests.uid('bia')), 0::bigint,
  'banida some de pessoas_parecidas'
);
select is(public.afinidade(tests.uid('bia')), null, 'afinidade com banida é NULL');

-- ---------------------------------------------------------------------------
-- A banida perde o acesso
-- ---------------------------------------------------------------------------
select tests.login('bia');
select is(
  (select array_agg(id) from public.profiles), array[tests.uid('bia')],
  'banida só enxerga o próprio perfil'
);
select is((select count(*) from public.posts), 0::bigint, 'banida não lê posts');
select throws_ok(
  $$ insert into public.posts (body) values ('voltei') $$, '42501', null,
  'banida não posta'
);
update public.profiles set bio = 'injustiça' where id = auth.uid();
select is(
  (select bio from public.profiles where id = auth.uid()), null,
  'banida não edita o próprio perfil'
);
select throws_ok(
  format($$ insert into public.profile_tags (tag_id) values (%s) $$, tests.tag('t-rpg')), '42501', null,
  'banida não mexe nas tags'
);

-- ---------------------------------------------------------------------------
-- Registro e bloqueio do e-mail
-- ---------------------------------------------------------------------------
select tests.logout();
select is(
  (select count(*) from public.moderation_actions
   where action = 'banir_usuario' and target_user_id = tests.uid('bia')
     and actor_id = tests.uid('moda') and reason = 'assédio reiterado'),
  1::bigint, 'o banimento ficou em moderation_actions com quem fez e por quê'
);
select is(
  (select count(*) from private.banned_emails where email_hmac = private.email_hmac(tests.email('bia'))),
  1::bigint, 'o HMAC do e-mail entrou em private.banned_emails'
);
select is(
  (select banned_until = 'infinity' from auth.users where id = tests.uid('bia')), true,
  'o login da conta foi bloqueado no Auth'
);
select is(
  private.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', tests.email('bia'))))
    #>> '{error,http_code}',
  '403', 'o hook passa a recusar o e-mail banido'
);

-- mesmo apagando a conta, o e-mail não se cadastra de novo
create temp table bia_email as select tests.email('bia') as email;
delete from auth.users where id = tests.uid('bia');
select throws_ok(
  $$ insert into auth.users (id, email) select gen_random_uuid(), email from bia_email $$,
  'PT403', null, 'conta apagada: o e-mail banido continua sem poder se cadastrar'
);

-- ---------------------------------------------------------------------------
-- Desbanir: só admin
-- ---------------------------------------------------------------------------
select tests.login_mfa('adma');
select lives_ok(
  format($$ select public.banir_usuario(%L, 'spam em massa') $$, tests.uid('caio')),
  'admin bane'
);
select tests.login_mfa('moda');
select throws_ok(
  format($$ select public.desbanir_usuario(%L, 'pediu desculpas') $$, tests.uid('caio')),
  'PT403', null, 'moderador não desbane'
);
select tests.login_mfa('adma');
select lives_ok(
  format($$ select public.desbanir_usuario(%L, 'recurso aceito') $$, tests.uid('caio')),
  'admin desbane'
);
select tests.login('ana');
select is(
  (select count(*) from public.profiles where id = tests.uid('caio')), 1::bigint,
  'desbanido volta a aparecer'
);

select * from finish();
rollback;
