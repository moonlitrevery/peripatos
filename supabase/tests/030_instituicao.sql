-- =============================================================================
-- Escopo por instituição: ninguém lê nem toca em nada de outra instituição
-- =============================================================================
begin;
\ir _helpers.psql
select plan(18);

select tests.seed_world();
select tests.add_tag('ana', 't-rock');
select tests.add_tag('zeca', 't-rock');
select tests.add_tag('bia', 't-rock');
select tests.mk_post('ana', 'post da instituição A', interval '1 hour');
select tests.mk_post('zeca', 'post da instituição B', interval '1 hour');

-- ---------------------------------------------------------------------------
-- zeca (instituição B) olhando para a instituição A
-- ---------------------------------------------------------------------------
select tests.login('zeca');

select is(
  (select count(*) from public.profiles p
   where p.institution_id <> (select institution_id from public.profiles where id = auth.uid())),
  0::bigint, 'não lê perfis de outra instituição'
);
select is(
  (select count(*) from public.profiles where id = tests.uid('ana')), 0::bigint,
  'não lê o perfil da ana nem pedindo pelo id'
);
select is(
  (select count(*) from public.posts where author_id = tests.uid('ana')), 0::bigint,
  'não lê posts de outra instituição'
);
select is(
  (select count(*) from public.profile_tags where user_id = tests.uid('ana')), 0::bigint,
  'não lê tags de perfil de outra instituição'
);
select is(
  (select count(*) from public.staff_roles where user_id = tests.uid('moda')), 0::bigint,
  'não lê os cargos de outra instituição'
);
select is(public.afinidade(tests.uid('ana')), null, 'afinidade com alguém de outra instituição é NULL');
select is(
  (select count(*) from public.pessoas_parecidas(50) where user_id = tests.uid('ana')), 0::bigint,
  'pessoas_parecidas não traz gente de outra instituição (mesmo com tag em comum)'
);
select is(
  (select count(*) from public.feed(null, 50) where author_id = tests.uid('ana')), 0::bigint,
  'feed não traz posts de outra instituição'
);
select throws_ok(
  format($$ insert into public.follows (followee_id) values (%L) $$, tests.uid('ana')), '42501', null,
  'não segue alguém de outra instituição'
);
select throws_ok(
  format($$ insert into public.blocks (blocked_id) values (%L) $$, tests.uid('ana')), '42501', null,
  'não bloqueia alguém de outra instituição'
);
select throws_ok(
  format($$ insert into public.reports (post_id, reason) values (%L, 'spam') $$,
         (select id from public.posts where author_id = tests.uid('ana'))), '42501', null,
  'não denuncia post de outra instituição'
);
select throws_ok(
  format($$ insert into public.reports (profile_id, reason) values (%L, 'spam') $$, tests.uid('ana')), '42501', null,
  'não denuncia perfil de outra instituição'
);

-- staff de B também não atravessa
select tests.login('modb');
select is(
  (select count(*) from public.posts where author_id = tests.uid('ana')), 0::bigint,
  'staff de outra instituição não lê posts'
);
select is(
  (select count(*) from public.profiles where id = tests.uid('ana')), 0::bigint,
  'staff de outra instituição não lê perfis'
);
select throws_ok(
  format($$ select public.banir_usuario(%L, 'tentativa cruzada') $$, tests.uid('ana')), 'PT403', null,
  'staff de outra instituição não bane'
);

-- ---------------------------------------------------------------------------
-- Controle positivo: dentro da mesma instituição funciona
-- ---------------------------------------------------------------------------
select tests.login('bia');
select is(
  (select count(*) from public.profiles where id = tests.uid('ana')), 1::bigint,
  'colega da mesma instituição lê o perfil'
);
select is(
  (select count(*) from public.posts where author_id = tests.uid('ana')), 1::bigint,
  'colega da mesma instituição lê o post'
);
select is(
  (select count(*) from public.profile_tags where user_id = tests.uid('ana')), 1::bigint,
  'colega da mesma instituição lê as tags comuns'
);

select * from finish();
rollback;
