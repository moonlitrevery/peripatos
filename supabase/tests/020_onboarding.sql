-- =============================================================================
-- Onboarding e 18+: conta só fica ativa com onboarding completo e 18 anos
-- =============================================================================
begin;
\ir _helpers.psql
select plan(27);

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
  $$ select public.completar_onboarding('ana', 'Outro Nome', date '2000-05-05', null, private.termos_versao_atual()) $$, 'PT409', null,
  'username já usado na instituição é recusado'
);

select is(
  public.completar_onboarding('novo_user', 'Nome Social', date '2000-05-05', null, private.termos_versao_atual()) ->> 'ativo',
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
  $$ select public.completar_onboarding('novo_user2', 'Nome', date '1990-01-01', null, private.termos_versao_atual()) $$, 'PT409', null,
  'onboarding não pode ser refeito'
);

-- ---------------------------------------------------------------------------
-- Menor de 18: a conta é apagada na hora, nada fica guardado
-- ---------------------------------------------------------------------------
create temp table menor as select tests.uid('menor') as id, tests.email('menor') as email;
grant select on menor to authenticated;

select tests.login('menor');
select is(
  public.completar_onboarding(
    'menor_user', 'Menor',
    ((now() at time zone 'America/Sao_Paulo')::date - interval '18 years' + interval '1 day')::date,
    null, private.termos_versao_atual()
  ),
  '{"onboarding_completo": false, "ativo": false, "menor_de_idade": true, "conta_apagada": true}'::jsonb,
  'quem faz 18 só amanhã: a RPC avisa que é menor e que a conta foi apagada'
);
select throws_ok(
  $$ insert into public.posts (body) values ('oi') $$, null, null,
  'menor de 18: não posta (a conta nem existe mais)'
);
select throws_ok(
  format($$ insert into public.follows (followee_id) values (%L) $$, tests.uid('ana')), null, null,
  'menor de 18: não segue'
);
select is((select count(*) from public.profiles), 0::bigint, 'menor de 18: não enxerga nenhum perfil');

select tests.logout();
select is(
  (select (select count(*) from auth.users where id = (select id from menor))
        + (select count(*) from private.accounts where user_id = (select id from menor))
        + (select count(*) from public.profiles where id = (select id from menor))),
  0::bigint,
  'do menor não ficou nada: nem usuário do Auth, nem conta em private.accounts, nem perfil'
);
select is(
  (select count(*) from public.profiles where username = 'menor_user'), 0::bigint,
  'o username e o nome enviados no formulário não foram gravados'
);
select lives_ok(
  $$ insert into auth.users (id, email) select gen_random_uuid(), email from menor $$,
  'nenhum marcador ficou: o mesmo e-mail pode se cadastrar quando fizer 18'
);

-- quem faz 18 exatamente hoje já entra
select tests.mk_user('aniversariante', 'a.peripatos.test', false);
select tests.login('aniversariante');
select is(
  public.completar_onboarding(
    'aniversariante', 'Aniversariante',
    ((now() at time zone 'America/Sao_Paulo')::date - interval '18 years')::date,
    null, private.termos_versao_atual()
  ) ->> 'ativo',
  'true',
  'quem faz 18 hoje completa o onboarding e fica ativo'
);
select is(
  public.conta_status() - 'onboarding_completo' - 'termos_aceitos_em',
  '{"maior_de_idade": true, "banido": false, "ativo": true, "termos_versao": "2026-10-08-rascunho", "termos_em_dia": true, "sensiveis_consentido_em": null}'::jsonb,
  'conta_status não devolve a data, só o resultado'
);

-- username é único POR instituição: o mesmo nome pode existir em outra
select tests.logout();
select lives_ok(
  format($$ update public.profiles set username = 'ana' where id = %L $$, tests.uid('zeca')),
  'o mesmo username pode existir em outra instituição'
);

select * from finish();
rollback;
