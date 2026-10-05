-- =============================================================================
-- Onboarding e 18+: conta só fica ativa com onboarding completo e 18 anos
-- =============================================================================
begin;
\ir _helpers.psql
select plan(24);

select tests.seed_world();
select tests.mk_user('menor', 'a.peripatos.test', false);
select tests.mk_post('ana', 'post da ana');

-- ---------------------------------------------------------------------------
-- Sem onboarding
-- ---------------------------------------------------------------------------
select tests.login('novo');

select is(
  (select array_agg(id) from public.profiles),
  array[tests.uid('novo')],
  'sem onboarding: só enxerga o próprio perfil'
);
select is((select count(*) from public.posts), 0::bigint, 'sem onboarding: não lê posts');
select is((select count(*) from public.profile_tags), 0::bigint, 'sem onboarding: não lê tags dos outros');

select throws_ok(
  $$ insert into public.posts (body) values ('oi') $$, '42501', null,
  'sem onboarding: não posta'
);
select throws_ok(
  format($$ insert into public.follows (followee_id) values (%L) $$, tests.uid('ana')), '42501', null,
  'sem onboarding: não segue'
);
select is((select count(*) from public.pessoas_parecidas()), 0::bigint, 'sem onboarding: pessoas_parecidas vazio');
select is((select count(*) from public.feed()), 0::bigint, 'sem onboarding: feed vazio');

-- quem é ativo não vê quem não terminou o onboarding
select tests.login('ana');
select is(
  (select count(*) from public.profiles where id = tests.uid('novo')), 0::bigint,
  'perfil sem onboarding não aparece para os outros'
);

-- ---------------------------------------------------------------------------
-- O cliente não consegue "se ativar" escrevendo direto nas colunas
-- ---------------------------------------------------------------------------
select tests.login('novo');
select throws_ok(
  $$ update public.profiles set onboarding_completo = true where id = auth.uid() $$, '42501', null,
  'não dá para marcar onboarding_completo direto na tabela'
);
select throws_ok(
  $$ update public.profiles set banned_at = null where id = auth.uid() $$, '42501', null,
  'não dá para mexer em banned_at direto na tabela'
);
select throws_ok(
  $$ update public.profiles set institution_id = gen_random_uuid() where id = auth.uid() $$, '42501', null,
  'não dá para trocar de instituição'
);
select throws_ok(
  $$ update public.profiles set avatar_status = 'aprovado' where id = auth.uid() $$, '42501', null,
  'não dá para aprovar o próprio avatar'
);

-- ---------------------------------------------------------------------------
-- Onboarding de adulto
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.completar_onboarding('ana', 'Outro Nome', date '2000-05-05') $$, 'PT409', null,
  'username já usado na instituição é recusado'
);

select is(
  public.completar_onboarding('novo_user', 'Nome Social', date '2000-05-05') ->> 'ativo',
  'true',
  'adulto que completa o onboarding fica ativo'
);
select lives_ok(
  $$ insert into public.posts (body) values ('primeiro post') $$,
  'depois do onboarding: posta'
);
select lives_ok(
  format($$ insert into public.follows (followee_id) values (%L) $$, tests.uid('ana')),
  'depois do onboarding: segue'
);
select throws_ok(
  $$ select public.completar_onboarding('novo_user2', 'Nome', date '1990-01-01') $$, 'PT409', null,
  'onboarding não pode ser refeito (data de nascimento trava)'
);

-- ---------------------------------------------------------------------------
-- Menor de 18
-- ---------------------------------------------------------------------------
select tests.login('menor');

select is(
  public.completar_onboarding(
    'menor_user', 'Menor',
    ((now() at time zone 'America/Sao_Paulo')::date - interval '18 years' + interval '1 day')::date
  ) ->> 'ativo',
  'false',
  'quem faz 18 só amanhã completa o onboarding mas NÃO fica ativo'
);
select throws_ok(
  $$ insert into public.posts (body) values ('oi') $$, '42501', null,
  'menor de 18: não posta'
);
select throws_ok(
  format($$ insert into public.follows (followee_id) values (%L) $$, tests.uid('ana')), '42501', null,
  'menor de 18: não segue'
);
select is(
  (select array_agg(id) from public.profiles),
  array[tests.uid('menor')],
  'menor de 18: só enxerga o próprio perfil'
);
select is(
  public.conta_status(),
  '{"onboarding_completo": true, "data_nascimento_informada": true, "maior_de_idade": false, "banido": false, "ativo": false}'::jsonb,
  'conta_status explica por que a conta não está ativa, sem devolver a data'
);

select tests.login('ana');
select is(
  (select count(*) from public.profiles where id = tests.uid('menor')), 0::bigint,
  'menor de 18 não aparece para os outros'
);

-- username é único POR instituição: o mesmo nome pode existir em outra
select tests.logout();
select lives_ok(
  format($$ update public.profiles set username = 'ana' where id = %L $$, tests.uid('zeca')),
  'o mesmo username pode existir em outra instituição'
);

select * from finish();
rollback;
