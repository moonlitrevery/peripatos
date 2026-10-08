-- =============================================================================
-- Auditoria: MFA da staff, consentimentos, minimização, limite de GIF, alt
-- =============================================================================
begin;
\ir _helpers.psql
select plan(49);

select tests.seed_world();
select tests.mk_post('ana', 'post da ana');
create function tests.post_ana() returns uuid language sql stable security definer set search_path = '' as
  $$ select id from public.posts where body = 'post da ana' $$;
grant execute on function tests.post_ana() to authenticated;

-- uma denúncia na fila, para ter o que a staff ler
select tests.logout();
insert into public.reports (reporter_id, institution_id, post_id, reason)
select tests.uid('bia'), p.institution_id, tests.post_ana(), 'spam' from public.profiles p where p.id = tests.uid('bia');

-- ---------------------------------------------------------------------------
-- MFA: ter o cargo não basta, a sessão precisa ser aal2
-- ---------------------------------------------------------------------------
select tests.login('moda');  -- sessão aal1: só o código do e-mail
select throws_ok(
  format($$ select public.ocultar_post(%L, 'teste de mfa') $$, tests.post_ana()),
  'PT403', 'Confirme a verificação em duas etapas para agir como moderação.',
  'moderadora sem segundo fator não oculta post'
);
select throws_ok(
  format($$ select public.banir_usuario(%L, 'teste de mfa') $$, tests.uid('ana')),
  'PT403', 'Confirme a verificação em duas etapas para agir como moderação.',
  'moderadora sem segundo fator não bane'
);
select throws_ok(
  format($$ select public.moderar_avatar(%L, true, 'teste de mfa') $$, tests.uid('ana')),
  'PT403', null,
  'moderadora sem segundo fator não modera avatar'
);
select throws_ok(
  format($$ select public.resolver_denuncia((select id from public.reports limit 1), 'resolvida', 'teste de mfa') $$),
  'PT403', null,
  'moderadora sem segundo fator não resolve denúncia'
);
select is((select count(*) from public.reports), 0::bigint, 'sem segundo fator a fila de denúncias vem vazia');
select is((select count(*) from public.moderation_actions), 0::bigint, 'sem segundo fator o registro de moderação vem vazio');

select tests.login('adma');
select throws_ok(
  format($$ select public.definir_cargo(%L, 'moderador', 'teste de mfa') $$, tests.uid('ana')),
  'PT403', 'Confirme a verificação em duas etapas para agir como moderação.',
  'admin sem segundo fator não dá cargo'
);
select throws_ok(
  format($$ select public.remover_cargo(%L, 'teste de mfa') $$, tests.uid('moda')),
  'PT403', null,
  'admin sem segundo fator não tira cargo'
);
select throws_ok(
  format($$ select public.desbanir_usuario(%L, 'teste de mfa') $$, tests.uid('ana')),
  'PT403', null,
  'admin sem segundo fator não desbane'
);

-- o nível vem do claim "aal" do JWT, assinado pelo Auth; metadata não conta
select tests.login('moda', '{"user_metadata": {"aal": "aal2"}, "app_metadata": {"aal": "aal2"}, "amr": [{"method": "totp"}]}');
select throws_ok(
  format($$ select public.ocultar_post(%L, 'teste de mfa') $$, tests.post_ana()),
  'PT403', null,
  'aal2 escrito em user_metadata/app_metadata/amr não vale como segundo fator'
);
select tests.login('moda', '{"aal": "aal1"}');
select is((select count(*) from public.reports), 0::bigint, 'aal1 explícito: fila vazia');
select tests.login('moda', '{"aal": "AAL2"}');
select is((select count(*) from public.reports), 0::bigint, 'o valor do claim é comparado exatamente');

-- segundo fator sem cargo não dá nada
select tests.login('ana', '{"aal": "aal2"}');
select throws_ok(
  format($$ select public.ocultar_post(%L, 'teste de mfa') $$, tests.post_ana()),
  'PT403', 'Sem permissão para esta ação.',
  'usuária comum com aal2 continua sem permissão'
);
select is((select count(*) from public.reports), 0::bigint, 'usuária comum com aal2 não lê a fila');

-- com cargo E segundo fator, funciona
select tests.login_mfa('moda');
select is((select count(*) from public.reports), 1::bigint, 'moderadora com segundo fator lê a fila');
select lives_ok(
  format($$ select public.ocultar_post(%L, 'teste de mfa') $$, tests.post_ana()),
  'moderadora com segundo fator oculta o post'
);
select is((select count(*) from public.moderation_actions), 1::bigint, 'e a ação fica registrada');

-- o cargo continua visível como título do perfil, com ou sem segundo fator
select tests.login('moda');
select is(
  (select role::text from public.staff_roles where user_id = auth.uid()), 'moderador',
  'sem segundo fator a pessoa ainda vê o próprio cargo (a interface sabe pedir o código)'
);

-- ---------------------------------------------------------------------------
-- Tags sensíveis: consentimento específico, revogável
-- ---------------------------------------------------------------------------
select tests.login('caio');
select throws_ok(
  format($$ insert into public.profile_sensitive_tags (tag_id) values (%s) $$, tests.tag('t-sensivel')),
  'PT403', 'Para marcar identidade ou crenças é preciso dar o consentimento específico antes.',
  'sem consentimento o banco recusa a tag sensível'
);
select is(public.conta_status() ->> 'sensiveis_consentido_em', null, 'conta_status: sem consentimento registrado');
select ok(public.consentir_tags_sensiveis() is not null, 'consentir devolve o instante do consentimento');
select lives_ok(
  format($$ insert into public.profile_sensitive_tags (tag_id) values (%s) $$, tests.tag('t-sensivel')),
  'com consentimento a tag sensível é gravada'
);
select ok(public.conta_status() ->> 'sensiveis_consentido_em' is not null, 'conta_status mostra quando consentiu');
select is(
  public.consentir_tags_sensiveis()::text, public.consentir_tags_sensiveis()::text,
  'consentir de novo não troca a data do primeiro consentimento'
);
select lives_ok($$ select public.revogar_tags_sensiveis() $$, 'revogar funciona');
select tests.logout();
select is(
  (select count(*) from public.profile_sensitive_tags where user_id = tests.uid('caio')), 0::bigint,
  'revogar apaga todas as tags sensíveis da pessoa'
);
select is(
  (select sensivel_consentido_em from private.accounts where user_id = tests.uid('caio')), null,
  'revogar apaga o registro do consentimento'
);
select throws_ok(
  format($$ insert into public.profile_sensitive_tags (user_id, tag_id) values (%L, %s) $$, tests.uid('caio'), tests.tag('t-sensivel')),
  'PT403', null,
  'depois de revogar nem o superusuário grava tag sensível para a pessoa'
);
select tests.login('caio');
select lives_ok(
  format($$ insert into public.profile_tags (tag_id) values (%s) $$, tests.tag('t-rock')),
  'tags comuns não dependem desse consentimento'
);

-- ---------------------------------------------------------------------------
-- Termos: o aceite é registrado com versão e data, e só da versão vigente
-- ---------------------------------------------------------------------------
select tests.login('novo');
select throws_ok(
  $$ select public.completar_onboarding('novo_a', 'Novo', date '2000-05-05') $$,
  'PT400', null,
  'onboarding sem aceitar os termos é recusado'
);
select throws_ok(
  $$ select public.completar_onboarding('novo_a', 'Novo', date '2000-05-05', null, '2020-01-01') $$,
  'PT400', null,
  'aceite de uma versão que não é a vigente é recusado'
);
select is(
  public.completar_onboarding('novo_a', 'Novo', date '2000-05-05', null, private.termos_versao_atual()) ->> 'ativo',
  'true',
  'com o aceite da versão vigente o onboarding conclui'
);
select tests.logout();
select is(
  (select termos_versao || '|' || (termos_aceitos_em > now() - interval '1 minute')::text
   from private.accounts where user_id = tests.uid('novo')),
  '2026-10-16-rascunho|true',
  'a versão aceita e a data do aceite ficam registradas'
);

-- ---------------------------------------------------------------------------
-- Minimização: a data de nascimento e o RA não ficam guardados
-- ---------------------------------------------------------------------------
select hasnt_column('private', 'accounts', 'birth_date', 'private.accounts não tem mais a coluna da data de nascimento');
select hasnt_column('private', 'accounts', 'ra', 'private.accounts não tem mais a coluna do RA');
select is(
  (select position('2000-05-05' in to_jsonb(a)::text) + position('05-05' in to_jsonb(a)::text)
   from private.accounts a where a.user_id = tests.uid('novo')),
  0,
  'a data informada no onboarding não foi gravada em lugar nenhum da conta'
);
select ok(
  (select a.maioridade_verificada_em > now() - interval '1 minute' from private.accounts a where a.user_id = tests.uid('novo')),
  'fica só o instante em que a maioridade foi verificada'
);
select is(
  (select position(substring(split_part(u.email, '@', 1) from '\.([0-9]+)$') in to_jsonb(a)::text)
   from private.accounts a join tests.users u on u.id = a.user_id where u.alias = 'novo'),
  0,
  'o RA em claro não aparece na conta'
);
-- o que o RA garantia continua garantido: uma conta por RA na instituição
select throws_ok(
  format(
    $$ insert into auth.users (id, email) values (gen_random_uuid(), %L) $$,
    'outronome.' || substring(split_part(tests.email('ana'), '@', 1) from '\.([0-9]+)$') || '@a.peripatos.test'
  ),
  'PT403', 'Cadastro não permitido para este e-mail.',
  'outro nome com o mesmo RA na mesma instituição é recusado'
);
select lives_ok(
  format(
    $$ insert into auth.users (id, email) values (gen_random_uuid(), %L) $$,
    'outronome.' || substring(split_part(tests.email('ana'), '@', 1) from '\.([0-9]+)$') || '@b.peripatos.test'
  ),
  'o mesmo RA em outra instituição é outra pessoa'
);

-- ---------------------------------------------------------------------------
-- Limite de buscas de GIF
-- ---------------------------------------------------------------------------
select tests.login_anon();
select throws_ok($$ select public.registrar_busca_gif() $$, '42501', null, 'anon não registra busca de GIF');
select tests.login('davi');
select lives_ok(
  $$ select public.registrar_busca_gif() from generate_series(1, 30) $$,
  '30 buscas de GIF em um minuto passam'
);
select throws_ok(
  $$ select public.registrar_busca_gif() $$, 'PT429', 'Muitas buscas de GIF em pouco tempo. Espere um minuto.',
  'a 31ª busca no mesmo minuto é recusada'
);
select tests.login('bia');
select lives_ok($$ select public.registrar_busca_gif() $$, 'o limite é por pessoa');

-- ---------------------------------------------------------------------------
-- Texto alternativo do GIF
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.posts (body, gif_id, gif_alt) values ('', 'abc123', 'Gato comemorando') $$,
  'post com GIF e texto alternativo'
);
select throws_ok(
  $$ insert into public.posts (body, gif_alt) values ('texto', 'alt sem gif') $$, '23514', null,
  'texto alternativo sem GIF é recusado'
);
select throws_ok(
  $$ insert into public.posts (body, gif_id, gif_alt) values ('', 'abc123', repeat('a', 201)) $$, '23514', null,
  'texto alternativo com mais de 200 caracteres é recusado'
);
select throws_ok(
  $$ insert into public.posts (body, gif_id, gif_alt) values ('', 'abc123', E'linha\nquebrada') $$, '23514', null,
  'texto alternativo com caractere de controle é recusado'
);
select tests.login('ana');
select is(
  (select gif_alt from public.feed_para_voce(null, 50) where gif_id = 'abc123'),
  'Gato comemorando',
  'o feed devolve o texto alternativo do GIF'
);

select * from finish();
rollback;
