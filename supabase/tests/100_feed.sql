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
select plan(55);

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
-- Para você: quem aparece é a afinidade (e quem eu sigo); a ordem é a hora
-- ---------------------------------------------------------------------------
create temp table f as select row_number() over () as pos, * from public.feed_para_voce(null, 50);
grant select on f to authenticated;

select is(
  (select array_agg(body order by pos) from f),
  array['bia 1', 'bia 2', 'bia 3', 'caio 1', 'bia 4', 'bia 5', 'bia 6', 'caio 2', 'caio 3'],
  'a cada 4 posts, 1 vem de fora do círculo; quando um fluxo acaba, o outro preenche'
);
select is(
  (select array_agg(origem order by pos) from f),
  array['circulo', 'circulo', 'circulo', 'descoberta', 'circulo', 'circulo', 'circulo', 'descoberta', 'descoberta'],
  'cada item diz de qual fluxo veio'
);
select ok(
  (select bool_and(created_at > prox) from (
     select created_at, lead(created_at) over (order by pos) as prox from f where origem = 'circulo') t
   where prox is not null),
  'dentro do círculo, a ordem é a hora: do mais recente para o mais antigo'
);
select ok(
  (select bool_and(created_at > prox) from (
     select created_at, lead(created_at) over (order by pos) as prox from f where origem = 'descoberta') t
   where prox is not null),
  'fora do círculo, também'
);
select is((select count(*) from f where body = 'zeca'), 0::bigint, 'não traz post de outra instituição');
select is((select count(*) from f where body = 'meu próprio post'), 0::bigint, 'não traz os próprios posts');
select is((select count(distinct next_cursor) from f), 0::bigint, 'última página: next_cursor é NULL');
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('feed_para_voce', 'feed_seguindo')
      and ('score' = any (p.proargnames) or 'afinidade' = any (p.proargnames))),
  0::bigint, 'as RPCs do feed não devolvem score nem afinidade: nada é ranqueado'
);

-- A afinidade não reordena: davi tem MAIS afinidade do que bia para a ana
-- (ganha t-rpg), e mesmo assim o post dele, mais antigo, vem depois.
select tests.logout();
select tests.add_tag('davi', 't-rpg');
select tests.mk_post('davi', 'davi antigo', interval '90 minutes');
select tests.login('ana');
select ok(public.afinidade(tests.uid('davi')) > public.afinidade(tests.uid('bia')), 'davi tem mais afinidade com a ana do que a bia');
select is(
  (select array_agg(body order by pos)
     from (select row_number() over () as pos, body from public.feed_para_voce(null, 3)) t),
  array['bia 1', 'davi antigo', 'bia 2'],
  'mesmo assim a ordem é a hora: o post de quem tem mais afinidade não fura a fila'
);
select tests.logout();
delete from public.posts where body = 'davi antigo';
delete from public.profile_tags where user_id = tests.uid('davi') and tag_id = tests.tag('t-rpg');

-- Quem eu sigo entra no círculo mesmo sem gosto em comum.
select tests.follow('ana', 'caio');
select tests.login('ana');
select is(
  (select array_agg(distinct origem) from public.feed_para_voce(null, 50) where author_id = tests.uid('caio')),
  array['circulo'], 'post de quem eu sigo é do círculo, mesmo sem nenhum gosto em comum'
);
select is(
  (select array_agg(body order by pos)
     from (select row_number() over () as pos, body from public.feed_para_voce(null, 4)) t),
  array['caio 1', 'caio 2', 'caio 3', 'bia 1'],
  'e entra na mesma fila, pela hora'
);
select tests.logout();
delete from public.follows where follower_id = tests.uid('ana') and followee_id = tests.uid('caio');
select tests.login('ana');

-- ---------------------------------------------------------------------------
-- Para você: paginação por (created_at, id)
-- ---------------------------------------------------------------------------
create temp table pg1 as select row_number() over () as pos, * from public.feed_para_voce(null, 4);
grant select on pg1 to authenticated;
select is((select count(*) from pg1), 4::bigint, 'página 1 respeita o limite');
select isnt((select max(next_cursor) from pg1), null, 'página 1 devolve cursor');
select ok(
  (select max(next_cursor) ~ '^[0-9]+_[0-9a-f-]{36}_[0-9]+_[0-9a-f-]{36}_[0-3]$' from pg1),
  'o cursor é (created_at, id) de cada fluxo, sem offset'
);
select is(
  (select split_part(max(next_cursor), '_', 2) from pg1), (select post_id::text from pg1 where body = 'bia 3'),
  'e aponta para o último post do círculo que saiu'
);

-- entre a página 1 e a 2: chega um post novo, e um post JÁ VISTO é apagado
select tests.logout();
insert into public.posts (author_id, institution_id, body, created_at)
select id, institution_id, 'bia novíssimo', now() + interval '1 second'
from public.profiles where id = tests.uid('bia');
update public.posts set deleted_at = now() where body = 'bia 1';
select tests.login('ana');

create temp table pg2 as
  select row_number() over () as pos, * from public.feed_para_voce((select max(next_cursor) from pg1), 4);
grant select on pg2 to authenticated;
create temp table pg3 as
  select row_number() over () as pos, * from public.feed_para_voce((select max(next_cursor) from pg2), 4);
grant select on pg3 to authenticated;

select is(
  (select array_agg(body order by pg, pos)
   from (select 1 as pg, pos, body from pg1
         union all select 2, pos, body from pg2
         union all select 3, pos, body from pg3) t),
  (select array_agg(body order by pos) from f),
  'as páginas, concatenadas, são a lista inteira: sem repetir e sem pular, mesmo com um post novo e um já visto apagado no meio'
);
select is((select max(next_cursor) from pg3), null, 'a última página não devolve cursor');
select tests.logout();
update public.posts set deleted_at = null where body = 'bia 1';
select tests.login('ana');

-- dois posts no MESMO instante: o id desempata e nenhum se perde
select tests.logout();
insert into public.posts (author_id, institution_id, body, created_at)
select id, institution_id, 'gêmeo ' || g, now() - interval '7 hours'
from public.profiles, generate_series(1, 3) g where id = tests.uid('bia');
select tests.login('ana');
select is(
  (with recursive pag as (
     select 1 as n, (select array_agg(body) from public.feed_para_voce(null, 2)) as corpos,
            (select max(next_cursor) from public.feed_para_voce(null, 2)) as cur
     union all
     select n + 1, (select array_agg(body) from public.feed_para_voce(pag.cur, 2)),
            (select max(next_cursor) from public.feed_para_voce(pag.cur, 2))
     from pag where pag.cur is not null and n < 20
   )
   select count(*) from (select unnest(corpos) as b from pag) x where b like 'gêmeo %'),
  3::bigint, 'posts com a mesma hora: paginando de 2 em 2, os três aparecem, uma vez cada'
);
select tests.logout();
delete from public.posts where body like 'gêmeo %';
select tests.login('ana');

select throws_ok($$ select * from public.feed_para_voce('1; drop table posts', 4) $$, 'PT400', null, 'cursor malformado é recusado');
select throws_ok($$ select * from public.feed_para_voce('1000:0', 4) $$, 'PT400', null, 'o cursor antigo (instante:offset) não vale mais');
select throws_ok(
  $$ select * from public.feed_para_voce('1_zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz_1_00000000-0000-0000-0000-000000000000_0', 4) $$,
  'PT400', null, 'cursor com id que não é uuid é recusado'
);
select is((select count(*) from public.feed_para_voce(null, 100000)), 9::bigint, 'limite absurdo é contido (máximo 50 por página)');

-- ---------------------------------------------------------------------------
-- Para você: regras
-- ---------------------------------------------------------------------------
select tests.logout();
update public.posts set deleted_at = now() where body = 'bia 2';
update public.posts set hidden_at = now() where body = 'bia 3';
select tests.login('ana');
select is(
  (select count(*) from public.feed_para_voce(null, 50) where body in ('bia 2', 'bia 3', 'bia novíssimo')), 0::bigint,
  'post apagado, post ocultado e post "do futuro" não entram'
);
select tests.logout();
update public.posts set deleted_at = null, hidden_at = null where body in ('bia 2', 'bia 3');

select tests.login('caio');
select is(
  (select array_agg(distinct origem) from public.feed_para_voce(null, 50)), array['descoberta'],
  'quem não tem gosto em comum com ninguém nem segue ninguém recebe o fluxo de fora, e não um feed vazio'
);
select is(
  (select array_agg(body order by pos) from (select row_number() over () as pos, body from public.feed_para_voce(null, 3)) t),
  array['meu próprio post', 'bia 1', 'bia 2'],
  '...do mais recente para o mais antigo'
);

-- ---------------------------------------------------------------------------
-- Seguindo: só quem eu sigo, pela hora, sem nada intercalado
-- ---------------------------------------------------------------------------
select tests.login('ana');
select is((select count(*) from public.feed_seguindo(null, 50)), 0::bigint, 'sem seguir ninguém, a aba Seguindo fica vazia');
select tests.logout();
select tests.follow('ana', 'bia');
select tests.follow('ana', 'caio');
select tests.follow('ana', 'zeca');   -- outra instituição (só existe aqui porque o teste escreve direto)
select tests.follow('davi', 'ana');   -- me segue, mas eu não sigo
select tests.mk_post('davi', 'davi não seguido', interval '15 minutes');
select tests.login('ana');

create temp table s as select row_number() over () as pos, * from public.feed_seguindo(null, 50);
grant select on s to authenticated;
select is(
  (select array_agg(body order by pos) from s),
  array['caio 1', 'caio 2', 'caio 3', 'bia 1', 'bia 2', 'bia 3', 'bia 4', 'bia 5', 'bia 6'],
  'Seguindo: os posts de quem eu sigo, do mais recente para o mais antigo'
);
select is((select array_agg(distinct origem) from s), array['seguindo'], 'sem "fora do seu círculo": nada é intercalado');
select is(
  (select count(*) from s where body in ('davi não seguido', 'zeca', 'meu próprio post', 'bia novíssimo')), 0::bigint,
  'não traz quem eu não sigo (mesmo que me siga), outra instituição, os meus, nem post do futuro'
);
select is((select count(distinct next_cursor) from s), 0::bigint, 'última página: sem cursor');

-- paginação
create temp table s1 as select row_number() over () as pos, * from public.feed_seguindo(null, 4);
grant select on s1 to authenticated;
select ok((select max(next_cursor) ~ '^[0-9]+_[0-9a-f-]{36}$' from s1), 'o cursor de Seguindo é (created_at, id)');
select tests.logout();
select tests.mk_post('caio', 'caio novo', interval '1 minute');
update public.posts set deleted_at = now() where body = 'caio 2';
select tests.login('ana');
create temp table s2 as select row_number() over () as pos, * from public.feed_seguindo((select max(next_cursor) from s1), 4);
grant select on s2 to authenticated;
create temp table s3 as select row_number() over () as pos, * from public.feed_seguindo((select max(next_cursor) from s2), 4);
grant select on s3 to authenticated;
select is(
  (select array_agg(body order by pg, pos)
   from (select 1 as pg, pos, body from s1 union all select 2, pos, body from s2 union all select 3, pos, body from s3) t),
  (select array_agg(body order by pos) from s),
  'as páginas, concatenadas, são a lista inteira, mesmo com um post novo e um já visto apagado no meio'
);
select is((select max(next_cursor) from s3), null, 'a última página não devolve cursor');
select throws_ok($$ select * from public.feed_seguindo('1000:0', 4) $$, 'PT400', null, 'cursor malformado é recusado');
select throws_ok(
  format($$ select * from public.feed_seguindo(%L, 4) $$, (select max(next_cursor) from pg1)), 'PT400', null,
  'o cursor de uma aba não serve na outra'
);

-- regras
select tests.logout();
update public.posts set deleted_at = null where body = 'caio 2';
update public.posts set deleted_at = now() where body = 'bia 2';
update public.posts set hidden_at = now() where body = 'bia 3';
select tests.login('ana');
select is(
  (select count(*) from public.feed_seguindo(null, 50) where body in ('bia 2', 'bia 3')), 0::bigint,
  'Seguindo: post apagado e post ocultado não entram'
);
select tests.logout();
update public.profiles set banned_at = now() where id = tests.uid('caio');
select tests.login('ana');
select is(
  (select count(*) from public.feed_seguindo(null, 50) where author_id = tests.uid('caio')), 0::bigint,
  'Seguindo: quem foi banido some'
);
select is(
  (select count(*) from public.feed_para_voce(null, 50) where author_id = tests.uid('caio')), 0::bigint,
  'Para você: também'
);
select tests.logout();
update public.profiles set banned_at = null where id = tests.uid('caio');
-- bloqueio (o trigger apaga os follows; aqui o follow é recriado à força para
-- provar que a RPC confere o bloqueio por conta própria)
insert into public.blocks (blocker_id, blocked_id) values (tests.uid('bia'), tests.uid('ana'));
insert into public.follows (follower_id, followee_id) values (tests.uid('ana'), tests.uid('bia'));
select tests.login('ana');
select is(
  (select count(*) from public.feed_seguindo(null, 50) where author_id = tests.uid('bia')), 0::bigint,
  'Seguindo: quem me bloqueou não aparece, nem com um follow sobrando'
);
select is(
  (select count(*) from public.feed_para_voce(null, 50) where author_id = tests.uid('bia')), 0::bigint,
  'Para você: também'
);

-- termos: quem não aceitou a versão vigente lê as duas abas e não publica
select tests.logout();
delete from public.blocks;
update private.accounts set termos_versao = '2020-01-01-antiga' where user_id = tests.uid('ana');
select tests.login('ana');
select ok(
  (select count(*) from public.feed_para_voce(null, 50)) > 0 and (select count(*) from public.feed_seguindo(null, 50)) > 0,
  'sem o aceite da versão vigente dos termos, as duas abas continuam legíveis'
);
select throws_ok($$ insert into public.posts (body) values ('sem aceitar') $$, '42501', null, 'e publicar continua barrado');

-- inativo e anon
select tests.login('novo');
select is(
  (select count(*) from public.feed_para_voce()) + (select count(*) from public.feed_seguindo()), 0::bigint,
  'sem onboarding: as duas abas vazias'
);
select tests.login_anon();
select throws_ok($$ select * from public.feed_para_voce() $$, '42501', null, 'anon não chama feed_para_voce');
select throws_ok($$ select * from public.feed_seguindo() $$, '42501', null, 'nem feed_seguindo');

-- ---------------------------------------------------------------------------
-- A função de score antiga fica guardada, sem uso
-- ---------------------------------------------------------------------------
select tests.logout();
select has_function('private', 'feed_por_score', array['text', 'integer'], 'o feed por score continua existindo, em private');
select hasnt_function('public', 'feed', 'e não existe mais public.feed');
select ok(
  not has_function_privilege('authenticated', 'private.feed_por_score(text, integer)', 'execute')
  and not has_function_privilege('anon', 'private.feed_por_score(text, integer)', 'execute'),
  'nenhum papel da API a executa'
);
select ok(
  obj_description('private.feed_por_score(text, integer)'::regprocedure) ~ 'SEM USO',
  'e está documentada como sem uso'
);

select * from finish();
rollback;
