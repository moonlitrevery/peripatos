-- =============================================================================
-- Bloqueio: invisibilidade nas duas direções e follows apagados
-- =============================================================================
begin;
\ir _helpers.psql
select plan(24);

select tests.seed_world();
select tests.add_tag('ana', 't-rock');
select tests.add_tag('bia', 't-rock');
select tests.add_tag('ana', 't-sensivel');
select tests.add_tag('bia', 't-sensivel');
select tests.follow('ana', 'bia');
select tests.follow('bia', 'ana');
select tests.follow('ana', 'caio');
select tests.mk_post('ana', 'post da ana', interval '1 hour');
select tests.mk_post('bia', 'post da bia', interval '1 hour');

-- antes do bloqueio
select tests.login('bia');
select is(
  (select count(*) from public.posts where author_id = tests.uid('ana')), 1::bigint,
  'antes: bia vê o post da ana'
);

-- ana bloqueia bia
select tests.login('ana');
select lives_ok(
  format($$ insert into public.blocks (blocked_id) values (%L) $$, tests.uid('bia')),
  'ana bloqueia bia'
);

select tests.logout();
select is(
  (select count(*) from public.follows
   where (follower_id = tests.uid('ana') and followee_id = tests.uid('bia'))
      or (follower_id = tests.uid('bia') and followee_id = tests.uid('ana'))),
  0::bigint,
  'o bloqueio apagou os follows nos dois sentidos'
);
select is(
  (select count(*) from public.follows where follower_id = tests.uid('ana') and followee_id = tests.uid('caio')),
  1::bigint,
  'follows com outras pessoas continuam'
);

-- ---------------------------------------------------------------------------
-- Lado de quem foi bloqueada
-- ---------------------------------------------------------------------------
select tests.login('bia');
select is((select count(*) from public.posts where author_id = tests.uid('ana')), 0::bigint, 'bloqueada não vê os posts');
select is((select count(*) from public.profiles where id = tests.uid('ana')), 0::bigint, 'bloqueada não vê o perfil');
select is((select count(*) from public.profile_tags where user_id = tests.uid('ana')), 0::bigint, 'bloqueada não vê as tags');
select is(
  (select count(*) from public.profile_sensitive_tags where user_id = tests.uid('ana')), 0::bigint,
  'bloqueada não vê as tags sensíveis (eram mutuals)'
);
select is((select count(*) from public.blocks), 0::bigint, 'bloqueada não vê a linha do bloqueio');
select is((select count(*) from public.meus_bloqueios()), 0::bigint, 'meus_bloqueios não revela quem bloqueou a pessoa');

select is(public.afinidade(tests.uid('ana')), null, 'bloqueada: afinidade NULL');
select is(
  (select count(*) from public.pessoas_parecidas(50) where user_id = tests.uid('ana')), 0::bigint,
  'bloqueada: some de pessoas_parecidas'
);
select is(
  (select count(*) from public.feed_para_voce(null, 50) where author_id = tests.uid('ana')), 0::bigint,
  'bloqueada: some do feed'
);
select throws_ok(
  format($$ insert into public.follows (followee_id) values (%L) $$, tests.uid('ana')), '42501', null,
  'bloqueada não consegue seguir de novo'
);
select throws_ok(
  format($$ insert into public.reports (profile_id, reason) values (%L, 'outro') $$, tests.uid('ana')), '42501', null,
  'bloqueada não consegue denunciar (retaliação) quem a bloqueou'
);

-- ---------------------------------------------------------------------------
-- Lado de quem bloqueou: também deixa de ver (qualquer direção)
-- ---------------------------------------------------------------------------
select tests.login('ana');
select is((select count(*) from public.posts where author_id = tests.uid('bia')), 0::bigint, 'quem bloqueou não vê os posts');
select is((select count(*) from public.profiles where id = tests.uid('bia')), 0::bigint, 'quem bloqueou não vê o perfil');
select is(
  (select count(*) from public.feed_para_voce(null, 50) where author_id = tests.uid('bia')), 0::bigint,
  'quem bloqueou: some do feed'
);
select is((select count(*) from public.blocks), 1::bigint, 'quem bloqueou vê a própria lista de bloqueios');
select results_eq(
  $$ select username, display_name from public.meus_bloqueios() $$,
  $$ values ('bia', 'Bia') $$,
  'meus_bloqueios devolve o nome de quem EU bloqueei (o perfil em si continua invisível)'
);


-- terceiros não são afetados
select tests.login('caio');
select is(
  (select count(*) from public.posts where author_id in (tests.uid('ana'), tests.uid('bia'))), 2::bigint,
  'terceiros continuam vendo as duas'
);

-- ---------------------------------------------------------------------------
-- follows: constraints
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.follows (followee_id) values (auth.uid()) $$, '23514', null,
  'self-follow é recusado'
);
select lives_ok(
  format($$ insert into public.follows (followee_id) values (%L) $$, tests.uid('ana')),
  'caio segue ana'
);
select throws_ok(
  format($$ insert into public.follows (followee_id) values (%L) $$, tests.uid('ana')), '23505', null,
  'follow é único por par'
);

select * from finish();
rollback;
