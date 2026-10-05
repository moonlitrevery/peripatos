-- =============================================================================
-- Rate limit por trigger: vale mesmo chamando a API direto
-- =============================================================================
begin;
\ir _helpers.psql
select plan(12);

select tests.seed_world();
select tests.mk_post('bia', 'post denunciável', interval '1 hour');

-- ---------------------------------------------------------------------------
-- 15 posts por hora
-- ---------------------------------------------------------------------------
select tests.login('ana');
select lives_ok(
  $$ insert into public.posts (body) select 'post ' || g from generate_series(1, 15) g $$,
  'os 15 primeiros posts da hora passam'
);
select throws_ok(
  $$ insert into public.posts (body) values ('post 16') $$,
  'PT429', 'Limite de 15 posts por hora atingido.',
  'o 16º post da hora é recusado, com mensagem clara (PT429 -> HTTP 429)'
);

-- apagar não devolve cota
select public.apagar_post((select id from public.posts where body = 'post 1'));
select throws_ok(
  $$ insert into public.posts (body) values ('post 16') $$, 'PT429', null,
  'apagar um post não libera cota'
);

-- o limite é por usuário
select tests.login('bia');
select lives_ok(
  $$ insert into public.posts (body) values ('post da bia') $$,
  'o limite de uma pessoa não afeta outra'
);

-- passada a hora, libera
select tests.logout();
update private.rate_limit_events
   set created_at = created_at - interval '61 minutes'
 where user_id = tests.uid('ana') and action = 'post';
select tests.login('ana');
select lives_ok(
  $$ insert into public.posts (body) values ('post depois de uma hora') $$,
  'depois de uma hora a cota volta'
);

-- ---------------------------------------------------------------------------
-- 200 follows por dia (contando eventos: seguir/desseguir em loop não zera)
-- ---------------------------------------------------------------------------
select lives_ok(
  format($$ insert into public.follows (followee_id) values (%L) $$, tests.uid('bia')),
  'follow 1 passa'
);
select lives_ok(
  $$ delete from public.follows where follower_id = auth.uid() $$,
  'unfollow'
);
select tests.logout();
select is(
  (select count(*) from private.rate_limit_events where user_id = tests.uid('ana') and action = 'follow'),
  1::bigint,
  'o unfollow não apaga o evento contado'
);
insert into private.rate_limit_events (user_id, action)
select tests.uid('ana'), 'follow' from generate_series(1, 199);

select tests.login('ana');
select throws_ok(
  format($$ insert into public.follows (followee_id) values (%L) $$, tests.uid('bia')),
  'PT429', 'Limite de 200 follows por dia atingido.',
  'o 201º follow do dia é recusado'
);

-- ---------------------------------------------------------------------------
-- 20 denúncias por dia
-- ---------------------------------------------------------------------------
select lives_ok(
  format($$ insert into public.reports (post_id, reason) values (%L, 'spam') $$,
         (select id from public.posts where body = 'post denunciável')),
  'denúncia 1 passa'
);
select tests.logout();
insert into private.rate_limit_events (user_id, action)
select tests.uid('ana'), 'report' from generate_series(1, 19);

select tests.login('ana');
select throws_ok(
  format($$ insert into public.reports (profile_id, reason) values (%L, 'spam') $$, tests.uid('caio')),
  'PT429', 'Limite de 20 denúncias por dia atingido.',
  'a 21ª denúncia do dia é recusada'
);

-- escritas internas (sem usuário) não são limitadas
select tests.logout();
select lives_ok(
  $$ select tests.mk_post('davi', 'carga ' || g) from generate_series(1, 30) g $$,
  'cargas internas (seed, service_role) não passam pelo rate limit'
);

select * from finish();
rollback;
