-- =============================================================================
-- Tags sensíveis: só dono e mutuals VEEM. E não são gostos: nunca entram na
-- afinidade nem nas tags em comum, para ninguém (nem entre mutuals).
-- =============================================================================
-- Instituição A tem 6 contas ativas (ana, bia, caio, davi, moda, adma).
--   t-rock:     ana, bia, caio  -> peso ln(6/3) = ln 2
--   t-rpg:      ana             -> peso ln(6/1) = ln 6
--   t-sensivel: ana, bia, caio  -> não pesa nada
-- ana <-> bia são mutuals. ana segue caio, mas caio NÃO segue de volta.
-- =============================================================================
begin;
\ir _helpers.psql
select plan(24);

select tests.seed_world();
select tests.add_tag('ana', 't-rock');
select tests.add_tag('ana', 't-rpg');
select tests.add_tag('bia', 't-rock');
select tests.add_tag('caio', 't-rock');
select tests.add_tag('ana', 't-sensivel');
select tests.add_tag('bia', 't-sensivel');
select tests.add_tag('caio', 't-sensivel');
select tests.follow('ana', 'bia');
select tests.follow('bia', 'ana');
select tests.follow('ana', 'caio');

-- ---------------------------------------------------------------------------
-- Leitura direta da tabela
-- ---------------------------------------------------------------------------
select tests.login('ana');
select is(
  (select count(*) from public.profile_sensitive_tags where user_id = auth.uid()), 1::bigint,
  'dono vê a própria tag sensível'
);
select is(
  (select count(*) from public.profile_sensitive_tags where user_id = tests.uid('bia')), 1::bigint,
  'mutual vê a tag sensível'
);
select is(
  (select count(*) from public.profile_sensitive_tags where user_id = tests.uid('caio')), 0::bigint,
  'não-mutual (sigo, mas não sou seguida de volta) NÃO vê a tag sensível'
);

select tests.login('caio');
select is(
  (select count(*) from public.profile_sensitive_tags where user_id = tests.uid('ana')), 0::bigint,
  'não-mutual (sou seguido, mas não sigo de volta) NÃO vê a tag sensível'
);

select tests.login_mfa('adma');
select is(
  (select count(*) from public.profile_sensitive_tags), 0::bigint,
  'nem admin da instituição lê tags sensíveis dos outros'
);

-- ---------------------------------------------------------------------------
-- pessoas_parecidas: tag sensível NUNCA é "em comum", nem entre mutuals
-- ---------------------------------------------------------------------------
select tests.login('ana');
select ok(
  (select not tags_em_comum @> '[{"slug": "t-sensivel"}]'::jsonb
          and tags_em_comum @> '[{"slug": "t-rock"}]'::jsonb
   from public.pessoas_parecidas(50) where user_id = tests.uid('bia')),
  'mutual: a tag sensível NÃO aparece nas tags em comum (a comum aparece)'
);
select ok(
  (select not tags_em_comum @> '[{"slug": "t-sensivel"}]'::jsonb
          and tags_em_comum @> '[{"slug": "t-rock"}]'::jsonb
   from public.pessoas_parecidas(50) where user_id = tests.uid('caio')),
  'não-mutual: também não'
);
select is(
  (select count(*) from public.pessoas_parecidas(50) p, jsonb_array_elements(p.tags_em_comum) t
    where (t ->> 'sensivel')::boolean
       or (t ->> 'id')::integer in (select id from public.tags where is_sensitive)),
  0::bigint, 'nenhuma tag sensível em "em comum", para ninguém'
);

-- ---------------------------------------------------------------------------
-- afinidade: tag sensível não entra, para ninguém
-- ---------------------------------------------------------------------------
select is(
  public.afinidade(tests.uid('caio')),
  round((ln(2::float8) / (ln(2::float8) + ln(6::float8)))::numeric, 4),
  'não-mutual: afinidade = só tags comuns (IDF), sem a sensível no numerador nem no denominador'
);
select is(
  public.afinidade(tests.uid('bia')),
  round((ln(2::float8) / (ln(2::float8) + ln(6::float8)))::numeric, 4),
  'mutual: a mesma conta. A tag sensível em comum NÃO entra'
);
select is(
  public.afinidade(tests.uid('bia')), public.afinidade(tests.uid('caio')),
  'mutual com a mesma tag sensível não fica acima de quem não é mutual'
);

-- Ninguém ganhar ou perder tag sensível muda coisa alguma no que a leitora recebe.
create temp table antes as
  select user_id, afinidade, tags_em_comum from public.pessoas_parecidas(50);
grant select on antes to authenticated;

select tests.logout();
delete from public.profile_sensitive_tags where user_id = tests.uid('caio');
select tests.login('ana');
select is(
  (select jsonb_agg(to_jsonb(p) order by p.user_id)
   from (select user_id, afinidade, tags_em_comum from public.pessoas_parecidas(50)) p),
  (select jsonb_agg(to_jsonb(a) order by a.user_id) from antes a),
  'não-mutual ganhar/perder tag sensível não muda NADA no que a leitora recebe (valores, ordem, tags)'
);

select tests.logout();
delete from public.profile_sensitive_tags where user_id = tests.uid('bia');
select tests.login('ana');
select is(
  (select jsonb_agg(to_jsonb(p) order by p.user_id)
   from (select user_id, afinidade, tags_em_comum from public.pessoas_parecidas(50)) p),
  (select jsonb_agg(to_jsonb(a) order by a.user_id) from antes a),
  'MUTUAL ganhar/perder tag sensível também não muda nada'
);

select tests.logout();
delete from public.profile_sensitive_tags where user_id = tests.uid('ana');
select tests.login('ana');
select is(
  (select jsonb_agg(to_jsonb(p) order by p.user_id)
   from (select user_id, afinidade, tags_em_comum from public.pessoas_parecidas(50)) p),
  (select jsonb_agg(to_jsonb(a) order by a.user_id) from antes a),
  'e a própria leitora tirar as dela também não: tag sensível não é gosto'
);

-- muita gente com a tag sensível: nada muda
select tests.logout();
select tests.add_tag('ana', 't-sensivel');
select tests.add_tag('bia', 't-sensivel');
select tests.add_tag('davi', 't-sensivel');
select tests.add_tag('moda', 't-sensivel');
select tests.login('ana');
select is(
  public.afinidade(tests.uid('bia')),
  round((ln(2::float8) / (ln(2::float8) + ln(6::float8)))::numeric, 4),
  'a afinidade não revela quantas pessoas marcaram a tag sensível'
);

-- ---------------------------------------------------------------------------
-- Virando mutual, passa a ver; desfazendo, deixa de ver
-- ---------------------------------------------------------------------------
select tests.logout();
select tests.add_tag('caio', 't-sensivel');
select tests.login('caio');
select lives_ok(
  format($$ insert into public.follows (followee_id) values (%L) $$, tests.uid('ana')),
  'caio segue de volta'
);
select is(
  (select count(*) from public.profile_sensitive_tags where user_id = tests.uid('ana')), 1::bigint,
  'agora mutual: caio vê a tag sensível da ana'
);

select tests.login('ana');
select is(
  public.afinidade(tests.uid('caio')), public.afinidade(tests.uid('bia')),
  'agora mutual: a afinidade com caio continua a mesma (a tag sensível não conta)'
);
-- ana remove caio dos seguidores: é assim que se revoga o acesso sem bloquear
select lives_ok(
  format($$ delete from public.follows where follower_id = %L and followee_id = auth.uid() $$, tests.uid('caio')),
  'ana remove caio dos seguidores'
);
select tests.login('caio');
select is(
  (select count(*) from public.profile_sensitive_tags where user_id = tests.uid('ana')), 0::bigint,
  'deixou de ser mutual: caio não vê mais'
);

-- ---------------------------------------------------------------------------
-- Integridade: cada tag na sua tabela, e ninguém escreve no perfil alheio
-- ---------------------------------------------------------------------------
select tests.login('davi');
select throws_ok(
  format($$ insert into public.profile_tags (tag_id) values (%s) $$, tests.tag('t-sensivel')), 'PT400', null,
  'tag sensível não entra em profile_tags (onde seria pública)'
);
select throws_ok(
  format($$ insert into public.profile_sensitive_tags (tag_id) values (%s) $$, tests.tag('t-rock')), 'PT400', null,
  'tag comum não entra em profile_sensitive_tags'
);
select throws_ok(
  format($$ insert into public.profile_tags (user_id, tag_id) values (%L, %s) $$, tests.uid('ana'), tests.tag('t-xadrez')),
  '42501', null,
  'não dá para colocar tag no perfil de outra pessoa'
);
select throws_ok(
  $$ insert into public.tags (category, slug, name) values ('x', 'tag-livre', 'Tag livre') $$, '42501', null,
  'usuário não cria tag: o vocabulário é controlado'
);

select * from finish();
rollback;
