-- =============================================================================
-- recem_chegados: quem concluiu o onboarding nos últimos 14 dias
-- =============================================================================
-- Leitora: ana (t-rock, t-rpg). Quando cada um concluiu o onboarding:
--   bia  1 dia    caio 3 dias    davi 13 dias    -> dentro da janela
--   moda 14 dias e 1 minuto      adma 20 dias    -> fora
--   novo: não concluiu           zeca: 1 dia, mas é da instituição B (modb: 20 dias)
-- Dentro da transação now() é fixo, então as idades são exatas.
-- =============================================================================
begin;
\ir _helpers.psql
select plan(30);

select tests.seed_world();

create function tests.chegou(p_alias text, p_ha interval) returns void language sql as
  $$ update private.accounts set maioridade_verificada_em = now() - p_ha where user_id = tests.uid(p_alias) $$;
-- os usernames que a RPC devolve, na ordem em que vieram
create function tests.recem(p_limite integer default 20) returns text[] language sql as
  $$ select coalesce(array_agg(r.username order by r.ord), '{}')
     from (select username, row_number() over () as ord from public.recem_chegados(p_limite)) r $$;

select tests.chegou('ana', interval '2 days');
select tests.chegou('bia', interval '1 day');
select tests.chegou('caio', interval '3 days');
select tests.chegou('davi', interval '13 days');
select tests.chegou('moda', interval '14 days 1 minute');
select tests.chegou('adma', interval '20 days');
select tests.chegou('zeca', interval '1 day');
select tests.chegou('modb', interval '20 days');
grant execute on function tests.recem(integer) to authenticated, anon;

select tests.add_tag('ana', 't-rock');
select tests.add_tag('ana', 't-rpg');
select tests.add_tag('bia', 't-rock');
select tests.add_tag('bia', 't-rpg');
select tests.add_tag('bia', 't-xadrez');
select tests.add_tag('caio', 't-xadrez');
-- ana e bia são mútuas e têm a mesma tag sensível
select tests.follow('ana', 'bia');
select tests.follow('bia', 'ana');
select tests.add_tag('ana', 't-sensivel');
select tests.add_tag('bia', 't-sensivel');

-- ---------------------------------------------------------------------------
-- Quem entra, e em que ordem
-- ---------------------------------------------------------------------------
select tests.login('ana');
select is(tests.recem(), array['bia', 'caio', 'davi'], 'só quem concluiu o onboarding há 14 dias ou menos, mais novos primeiro');
select is((select count(*) from public.recem_chegados(20) where user_id = auth.uid()), 0::bigint, 'quem lê não entra na própria lista');
select is(
  (select count(*) from public.recem_chegados(20) where user_id in (tests.uid('zeca'), tests.uid('modb'))), 0::bigint,
  'ninguém de outra instituição'
);
select is(
  (select count(*) from public.recem_chegados(20) where user_id = tests.uid('novo')), 0::bigint,
  'quem não concluiu o onboarding não aparece'
);
select is(tests.recem(2), array['bia', 'caio'], 'respeita o limite');
select is((select count(*) from public.recem_chegados()), 3::bigint, 'sem limite informado, usa o padrão');
select is((select count(*) from public.recem_chegados(null)), 3::bigint, 'limite nulo também');
select is(tests.recem(0), array['bia'], 'limite menor que 1 vira 1');
select tests.logout();

-- o teto: 25 pessoas chegaram hoje, a RPC devolve no máximo 20
select tests.mk_user('extra' || n) from generate_series(1, 25) n;
select tests.login('ana');
select is((select count(*) from public.recem_chegados(1000)), 20::bigint, 'limite absurdo é contido em 20');
select tests.logout();
delete from auth.users where id in (select id from tests.users where alias like 'extra%');

-- ---------------------------------------------------------------------------
-- Tags em comum: só gostos, sem contagem e sem data
-- ---------------------------------------------------------------------------
select tests.login('ana');
select is(
  (select array(select jsonb_array_elements(tags_em_comum) ->> 'slug') from public.recem_chegados(20) where username = 'bia'),
  array['t-rock', 't-rpg'], 'as tags em comum vêm com o perfil, em ordem de nome'
);
select is(
  (select tags_em_comum from public.recem_chegados(20) where username = 'caio'), '[]'::jsonb,
  'sem nada em comum, a lista vem vazia (e a pessoa aparece do mesmo jeito)'
);
select is(
  (select count(*) from public.recem_chegados(20) r, jsonb_array_elements(r.tags_em_comum) t
    where t ->> 'slug' = 't-sensivel' or (t ->> 'sensivel')::boolean),
  0::bigint, 'tag sensível nunca é "em comum", nem entre mútuos'
);
select is(
  (select seguindo from public.recem_chegados(20) where username = 'bia'), true,
  'quem a pessoa já segue continua na lista, marcado como seguindo'
);
select is((select seguindo from public.recem_chegados(20) where username = 'caio'), false, 'e quem ela não segue, não');
select tests.logout();
select is(
  (select p.proargnames::text[] from pg_proc p where p.oid = 'public.recem_chegados(integer)'::regprocedure),
  array['p_limite', 'user_id', 'username', 'display_name', 'avatar_path', 'avatar_preset', 'seguindo', 'tags_em_comum'],
  'a RPC não devolve data nem contagem: só o perfil, o estado do botão e as tags em comum'
);

-- foto pendente não sai
update public.profiles set avatar_path = 'x/pendente.webp', avatar_status = 'pendente' where id = tests.uid('caio');
select tests.login('ana');
select is(
  (select avatar_path from public.recem_chegados(20) where username = 'caio'), null,
  'avatar ainda não aprovado não é devolvido'
);
select tests.logout();

-- ---------------------------------------------------------------------------
-- Bloqueio, nas duas direções
-- ---------------------------------------------------------------------------
insert into public.blocks (blocker_id, blocked_id) values (tests.uid('ana'), tests.uid('bia'));
select tests.login('ana');
select is(tests.recem(), array['caio', 'davi'], 'quem a pessoa bloqueou some da lista');
select tests.login('bia');
select is(
  (select count(*) from public.recem_chegados(20) where username = 'ana'), 0::bigint,
  'e quem foi bloqueado também não vê quem bloqueou'
);
select is(tests.recem(), array['caio', 'davi'], 'mas continua vendo os outros');
select tests.logout();
delete from public.blocks;
select tests.login('ana');
select is(tests.recem(), array['bia', 'caio', 'davi'], 'desfeito o bloqueio, volta');
select tests.logout();

-- ---------------------------------------------------------------------------
-- Banimento
-- ---------------------------------------------------------------------------
update public.profiles set banned_at = now() where id = tests.uid('caio');
select tests.login('ana');
select is(tests.recem(), array['bia', 'davi'], 'conta banida não aparece');
select tests.login('caio');
select is((select count(*) from public.recem_chegados(20)), 0::bigint, 'e quem está banido não recebe a lista');
select tests.logout();
update public.profiles set banned_at = null where id = tests.uid('caio');

-- ---------------------------------------------------------------------------
-- Aceite dos Termos
-- ---------------------------------------------------------------------------
update private.accounts set termos_versao = '2020-01-01' where user_id = tests.uid('davi');
select tests.login('ana');
select is(tests.recem(), array['bia', 'caio'], 'quem não aceitou a versão vigente dos Termos não aparece');
select tests.logout();

-- sai uma versão nova: ninguém aceitou ainda
insert into private.termos_versoes (versao, publicada_em) values ('2099-01-01', now() + interval '1 second');
select tests.login('ana');
select is((select count(*) from public.recem_chegados(20)), 0::bigint, 'versão nova dos Termos: a lista esvazia até cada um aceitar');
select tests.login('bia');
select lives_ok($$ select public.aceitar_termos('2099-01-01') $$, 'a bia aceita a versão nova');
select tests.login('ana');
select is(tests.recem(), array['bia'], 'e volta a aparecer, mesmo para quem ainda não aceitou (ler não depende do aceite)');
select tests.logout();

-- ---------------------------------------------------------------------------
-- Quem pode chamar
-- ---------------------------------------------------------------------------
select tests.login('novo');
select is((select count(*) from public.recem_chegados(20)), 0::bigint, 'conta sem onboarding recebe zero linhas');
select tests.login('zeca');
select is(tests.recem(), '{}'::text[], 'na instituição B só o próprio zeca chegou agora: lista vazia, e ninguém da A');
select tests.login_anon();
select throws_ok($$ select * from public.recem_chegados(5) $$, '42501', null, 'anon não executa a RPC');
select tests.logout();
select is(
  (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p where p.oid = 'public.recem_chegados(integer)'::regprocedure),
  true, 'security definer com search_path vazio'
);

select * from finish();
rollback;
