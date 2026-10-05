-- =============================================================================
-- Feed e pessoas_parecidas
-- =============================================================================
-- Leitora: ana (t-rock, t-rpg). Instituição A tem 6 contas ativas.
--   bia  (t-rock)   -> tag em comum: fluxo "afinidade"   6 posts (1h a 6h atrás)
--   caio (t-xadrez) -> nada em comum: fluxo "descoberta" 3 posts (10, 20, 30 min)
--   zeca (instituição B, t-rock)                         1 post
-- Dentro da transação now() é fixo, então as idades são exatas.
-- =============================================================================
begin;
\ir _helpers.psql
select plan(22);

select tests.seed_world();
select tests.add_tag('ana', 't-rock');
select tests.add_tag('ana', 't-rpg');
select tests.add_tag('bia', 't-rock');
select tests.add_tag('davi', 't-rock');
select tests.add_tag('caio', 't-xadrez');
select tests.add_tag('zeca', 't-rock');

select tests.mk_post('bia', 'bia ' || h, make_interval(hours => h)) from generate_series(1, 6) h;
select tests.mk_post('caio', 'caio ' || m, make_interval(mins => m * 10)) from generate_series(1, 3) m;
select tests.mk_post('zeca', 'zeca', interval '5 minutes');
select tests.mk_post('ana', 'meu próprio post', interval '5 minutes');

-- ---------------------------------------------------------------------------
-- pessoas_parecidas
-- ---------------------------------------------------------------------------
select tests.login('ana');

select is(
  (select array_agg(username order by ord)
   from (select username, row_number() over () as ord from public.pessoas_parecidas(2)) t),
  array['bia', 'davi']::text[] ,
  'pessoas_parecidas ordena por afinidade (bia e davi têm t-rock) e respeita o limite'
) where tests.uid('bia') < tests.uid('davi')
union all
select is(
  (select array_agg(username order by ord)
   from (select username, row_number() over () as ord from public.pessoas_parecidas(2)) t),
  array['davi', 'bia']::text[],
  'pessoas_parecidas ordena por afinidade (bia e davi têm t-rock) e respeita o limite'
) where tests.uid('bia') > tests.uid('davi');

select is(
  (select count(*) from public.pessoas_parecidas(50) where user_id = auth.uid()), 0::bigint,
  'pessoas_parecidas exclui a própria pessoa'
);
-- t-rock: 3 de 6 ativos (ana, bia, davi) -> ln 2; t-rpg: 1 de 6 -> ln 6
select is(
  (select afinidade from public.pessoas_parecidas(50) where user_id = tests.uid('bia')),
  round((ln(2::float8) / (ln(2::float8) + ln(6::float8)))::numeric, 4),
  'afinidade = soma dos pesos IDF em comum / soma dos pesos das tags da leitora'
);
select is(
  (select afinidade from public.pessoas_parecidas(50) where user_id = tests.uid('caio')), 0::numeric,
  'sem tag em comum: afinidade 0 (mas a pessoa ainda é listada)'
);
select is((select count(*) from public.pessoas_parecidas(1000)), 5::bigint, 'limite absurdo é contido; vêm os 5 colegas ativos');

-- ---------------------------------------------------------------------------
-- feed: composição
-- ---------------------------------------------------------------------------
create temp table f as select row_number() over () as pos, * from public.feed(null, 50);
grant select on f to authenticated;

select is(
  (select array_agg(body order by pos) from f),
  array['bia 1', 'bia 2', 'bia 3', 'caio 1', 'bia 4', 'bia 5', 'bia 6', 'caio 2', 'caio 3'],
  'a cada 4 posts, 1 vem de fora da afinidade; quando um fluxo acaba, o outro preenche'
);
select is(
  (select array_agg(origem order by pos) from f),
  array['afinidade', 'afinidade', 'afinidade', 'descoberta', 'afinidade', 'afinidade', 'afinidade', 'descoberta', 'descoberta'],
  'cada item diz de qual fluxo veio'
);
select is(
  (select score from f where body = 'bia 1'),
  round((0.6 * ln(2::float8) / (ln(2::float8) + ln(6::float8)) + 0.4 * exp(-1 / 24.0::float8))::numeric, 6),
  'score = 0.6 * afinidade + 0.4 * exp(-horas / 24)'
);
select is((select count(*) from f where body = 'zeca'), 0::bigint, 'feed não traz post de outra instituição');
select is((select count(*) from f where body = 'meu próprio post'), 0::bigint, 'feed não traz os próprios posts');
select is((select count(distinct next_cursor) from f), 0::bigint, 'última página: next_cursor é NULL');

-- ---------------------------------------------------------------------------
-- feed: paginação estável
-- ---------------------------------------------------------------------------
create temp table pg1 as select row_number() over () as pos, * from public.feed(null, 4);
grant select on pg1 to authenticated;
select is((select count(*) from pg1), 4::bigint, 'página 1 respeita o limite');
select isnt((select max(next_cursor) from pg1), null, 'página 1 devolve cursor');

-- entre a página 1 e a 2 chega um post novo (mais recente que o cursor)
select tests.logout();
insert into public.posts (author_id, institution_id, body, created_at)
select id, institution_id, 'bia novíssimo', now() + interval '1 second'
from public.profiles where id = tests.uid('bia');
select tests.login('ana');

create temp table pg2 as
  select row_number() over () as pos, * from public.feed((select max(next_cursor) from pg1), 4);
grant select on pg2 to authenticated;
create temp table pg3 as
  select row_number() over () as pos, * from public.feed((select max(next_cursor) from pg2), 4);
grant select on pg3 to authenticated;

select is(
  (select array_agg(body order by pg, pos)
   from (select 1 as pg, pos, body from pg1
         union all select 2, pos, body from pg2
         union all select 3, pos, body from pg3) t),
  (select array_agg(body order by pos) from f),
  'as páginas, concatenadas, são exatamente a lista inteira: sem repetir, sem pular, sem o post novo'
);
select is((select max(next_cursor) from pg3), null, 'a última página não devolve cursor');

select throws_ok($$ select * from public.feed('1; drop table posts', 4) $$, 'PT400', null, 'cursor malformado é recusado');
select throws_ok($$ select * from public.feed('1000:0', 4) $$, 'PT400', null, 'cursor velho demais é recusado');
select is((select count(*) from public.feed(null, 100000)), 9::bigint, 'limite absurdo é contido (máximo 50 por página)');

-- ---------------------------------------------------------------------------
-- feed: apagados e ocultados somem
-- ---------------------------------------------------------------------------
select tests.logout();
update public.posts set deleted_at = now() where body = 'bia 2';
update public.posts set hidden_at = now() where body = 'bia 3';
select tests.login('ana');
select is(
  (select count(*) from public.feed(null, 50) where body in ('bia 2', 'bia 3', 'bia novíssimo')), 0::bigint,
  'post apagado, post ocultado e post "do futuro" não entram'
);

-- ---------------------------------------------------------------------------
-- feed: sem nenhuma tag em comum com ninguém, não fica vazio
-- ---------------------------------------------------------------------------
select tests.login('caio');
select is(
  (select array_agg(distinct origem) from public.feed(null, 50)), array['descoberta'],
  'quem não tem tag em comum com ninguém recebe o fluxo de descoberta'
);
select is(
  (select array_agg(body order by pos) from (select row_number() over () as pos, body from public.feed(null, 3)) t),
  array['meu próprio post', 'bia 1', 'bia 4'],
  '...do mais recente para o mais antigo'
);

-- janela: só os 500 posts mais recentes são ranqueados
select tests.logout();
select tests.mk_post('davi', 'carga ' || g, make_interval(secs => g)) from generate_series(1, 600) g;
select tests.login('caio');
select is(
  (select count(*) from (
     select c.next_cursor from public.feed(null, 50) c limit 1) x
   where split_part(x.next_cursor, ':', 2) = '50'),
  1::bigint,
  'com muitos posts o feed pagina (cursor aponta para o offset 50)'
);

select * from finish();
rollback;
