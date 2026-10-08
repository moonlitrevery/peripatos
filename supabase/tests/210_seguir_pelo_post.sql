-- =============================================================================
-- Seguir pelo post: a origem do follow e o que a notificação mostra
-- =============================================================================
-- Posts da bia: um longo (com espaços e quebras sobrando), um curto, um só
-- com GIF, um que ela vai apagar e um que a moderação vai ocultar.
-- =============================================================================
begin;
\ir _helpers.psql
select plan(61);

select tests.seed_world();

create table tests.posts (alias text primary key, id uuid not null);
grant select on tests.posts to authenticated;
create function tests.post(p_alias text) returns uuid language sql stable security definer set search_path = '' as
  $$ select p.id from tests.posts p where p.alias = p_alias $$;
-- a origem gravada no follow e na notificação, sem RLS
create function tests.origem(p_de text, p_para text) returns uuid language sql stable security definer set search_path = '' as
  $$ select f.via_post_id from public.follows f where f.follower_id = tests.uid(p_de) and f.followee_id = tests.uid(p_para) $$;
create function tests.post_da_notificacao(p_dono text, p_ator text) returns uuid language sql stable security definer set search_path = '' as
  $$ select n.post_id from public.notifications n
     where n.user_id = tests.uid(p_dono) and n.actor_id = tests.uid(p_ator) and n.type = 'novo_seguidor' $$;
create function tests.follows_de(p_alias text) returns bigint language sql stable security definer set search_path = '' as
  $$ select count(*) from public.follows f where f.follower_id = tests.uid(p_alias) $$;
create function tests.limite_gasto(p_alias text) returns bigint language sql stable security definer set search_path = '' as
  $$ select count(*) from private.rate_limit_events e where e.user_id = tests.uid(p_alias) and e.action = 'follow' $$;
grant execute on function tests.post(text), tests.origem(text, text), tests.post_da_notificacao(text, text),
  tests.follows_de(text), tests.limite_gasto(text) to authenticated;

-- só as linhas de novo seguidor da aba de quem chama (as contas de teste
-- também têm notificações de conquista)
create view tests.seguidores as select * from public.minhas_notificacoes() where tipo = 'novo_seguidor';
grant select on tests.seguidores to authenticated;
insert into tests.posts values
  ('longo', tests.mk_post('bia', E'  Alguém   topa\n jogar RPG de mesa na quinta?  Estou montando uma mesa de Chamado de Cthulhu para quem nunca jogou.  ')),
  ('curto', tests.mk_post('bia', 'Café novo no bloco B.')),
  ('apagado', tests.mk_post('bia', 'este a bia vai apagar')),
  ('oculto', tests.mk_post('bia', 'este a moderação vai ocultar')),
  ('do_caio', tests.mk_post('caio', 'post do caio')),
  ('do_davi', tests.mk_post('davi', 'post do davi')),
  ('do_zeca', tests.mk_post('zeca', 'post do zeca, na instituição B'));
insert into public.posts (author_id, institution_id, body, gif_id)
select p.id, p.institution_id, '', 'abc123' from public.profiles p where p.id = tests.uid('bia');
insert into tests.posts select 'gif', id from public.posts where gif_id = 'abc123';
update public.posts set deleted_at = now() where id = tests.post('apagado');
update public.posts set hidden_at = now(), hidden_by = tests.uid('moda') where id = tests.post('oculto');

-- ---------------------------------------------------------------------------
-- Seguir pelo post registra a origem, e a notificação mostra o trecho
-- ---------------------------------------------------------------------------
select tests.login('ana');
select lives_ok(
  format($$ insert into public.follows (followee_id, via_post_id) values (%L, %L) $$, tests.uid('bia'), tests.post('longo')),
  'a ana segue a bia a partir de um post da bia'
);
select is(tests.origem('ana', 'bia'), tests.post('longo'), 'o follow guarda de qual post veio');
select is(tests.post_da_notificacao('bia', 'ana'), tests.post('longo'), 'e a notificação de novo seguidor também');

select tests.login('bia');
select is(
  (select jsonb_build_object('tipo', tipo, 'quantidade', quantidade, 'pelo_post', pelo_post, 'trecho', post_trecho,
                             'quem', pessoas -> 0 ->> 'username')
     from tests.seguidores),
  jsonb_build_object('tipo', 'novo_seguidor', 'quantidade', 1, 'pelo_post', true,
                     'trecho', 'Alguém topa jogar RPG de mesa na quinta? Estou montando uma mesa de Chamado de C…',
                     'quem', 'ana'),
  'a bia vê quem seguiu e o trecho do post: até 80 caracteres, espaços juntados, com reticências'
);

-- ---------------------------------------------------------------------------
-- Só a pessoa seguida vê, e só pela aba de notificações
-- ---------------------------------------------------------------------------
select throws_ok($$ select via_post_id from public.follows $$, '42501', null, 'nem a pessoa seguida lê a origem direto na tabela');
select throws_ok($$ select * from public.follows $$, '42501', null, 'nem com select *');
select throws_ok(
  format($$ select count(*) from public.follows where via_post_id = %L $$, tests.post('longo')), '42501', null,
  'nem conta quantos follows um post trouxe'
);
select is((select count(*) from public.follows where followee_id = auth.uid()), 1::bigint, 'ela continua vendo quem a segue');
select tests.login('ana');
select throws_ok($$ select via_post_id from public.follows $$, '42501', null, 'quem seguiu também não lê a coluna');
select is((select count(*) from tests.seguidores), 0::bigint, 'quem seguiu não recebe nada');
select is((select count(*) from public.notifications where type = 'novo_seguidor'), 0::bigint, 'nem lê a notificação da bia');
select throws_ok($$ update public.follows set via_post_id = null $$, '42501', null, 'e ninguém altera a origem depois');
select tests.login('caio');
select is((select count(*) from public.follows), 0::bigint, 'um terceiro não vê o follow');
select is((select count(*) from public.notifications where type = 'novo_seguidor'), 0::bigint, 'nem a notificação');
select tests.login_anon();
select throws_ok($$ select follower_id from public.follows $$, '42501', null, 'anon não lê follows');
select throws_ok($$ select * from public.minhas_notificacoes() $$, '42501', null, 'nem chama a RPC');

-- ---------------------------------------------------------------------------
-- A origem não se forja
-- ---------------------------------------------------------------------------
select tests.login('caio');
select throws_ok(
  format($$ insert into public.follows (followee_id, via_post_id) values (%L, %L) $$, tests.uid('davi'), tests.post('longo')),
  'PT422', 'Este post não pode ser a origem deste follow.', 'seguir o davi dizendo que veio de um post da bia: recusado'
);
select throws_ok(
  format($$ insert into public.follows (followee_id, via_post_id) values (%L, %L) $$, tests.uid('bia'), tests.post('do_caio')),
  'PT422', 'Este post não pode ser a origem deste follow.', 'nem apontando para o próprio post'
);
select throws_ok(
  format($$ insert into public.follows (followee_id, via_post_id) values (%L, %L) $$, tests.uid('bia'), tests.post('do_zeca')),
  'PT422', 'Este post não pode ser a origem deste follow.', 'nem para um post de outra instituição'
);
select throws_ok(
  format($$ insert into public.follows (followee_id, via_post_id) values (%L, %L) $$, tests.uid('zeca'), tests.post('do_zeca')),
  '42501', null, 'seguir alguém de outra instituição pelo post dela continua impossível'
);
select throws_ok(
  format($$ insert into public.follows (followee_id, via_post_id) values (%L, %L) $$, tests.uid('bia'), gen_random_uuid()),
  'PT422', 'Este post não pode ser a origem deste follow.', 'post que não existe: a mesma recusa'
);
select throws_ok(
  format($$ insert into public.follows (followee_id, via_post_id) values (%L, %L) $$, tests.uid('bia'), tests.post('apagado')),
  'PT422', 'Este post não pode ser a origem deste follow.', 'post apagado: a mesma recusa'
);
select throws_ok(
  format($$ insert into public.follows (followee_id, via_post_id) values (%L, %L) $$, tests.uid('bia'), tests.post('oculto')),
  'PT422', 'Este post não pode ser a origem deste follow.', 'post ocultado pela moderação: a mesma recusa'
);
select throws_ok(
  format($$ insert into public.follows (follower_id, followee_id, via_post_id) values (%L, %L, %L) $$,
         tests.uid('davi'), tests.uid('bia'), tests.post('longo')),
  '42501', null, 'e ninguém segue em nome de outra pessoa'
);
select is(tests.follows_de('caio'), 0::bigint, 'nenhuma das tentativas criou follow');
select is(tests.limite_gasto('caio'), 0::bigint, 'nem gastou o limite de follows');
select is(
  (select count(*) from public.notifications n where n.actor_id = tests.uid('caio')), 0::bigint,
  'nem gerou notificação'
) from (select tests.logout()) x;

-- ---------------------------------------------------------------------------
-- A origem é opcional; quem segue sem post entra no grupo de sempre
-- ---------------------------------------------------------------------------
select tests.login('caio');
select lives_ok(format($$ insert into public.follows (followee_id) values (%L) $$, tests.uid('bia')), 'o caio segue a bia pelo perfil');
select tests.login('davi');
select lives_ok(format($$ insert into public.follows (followee_id) values (%L) $$, tests.uid('bia')), 'o davi também');
select is(tests.origem('davi', 'bia'), null, 'sem post, o follow não tem origem');
select is(tests.post_da_notificacao('bia', 'davi'), null, 'nem a notificação');

select tests.login('bia');
select is(
  (select jsonb_agg(jsonb_build_object('n', quantidade, 'pelo_post', pelo_post, 'trecho', post_trecho is not null) order by quantidade)
     from tests.seguidores),
  jsonb_build_array(
    jsonb_build_object('n', 1, 'pelo_post', true, 'trecho', true),
    jsonb_build_object('n', 2, 'pelo_post', false, 'trecho', false)),
  'quem veio por um post tem uma linha só dele; os outros dois viram "2 pessoas te seguiram"'
);
select is((select count(*) from tests.seguidores where not lida), 2::bigint, 'e são duas linhas não lidas, não três');

-- post curto e post só com GIF
select tests.login('moda');
select lives_ok(
  format($$ insert into public.follows (followee_id, via_post_id) values (%L, %L) $$, tests.uid('bia'), tests.post('curto')),
  'a moda segue por um post curto'
);
select tests.login('adma');
select lives_ok(
  format($$ insert into public.follows (followee_id, via_post_id) values (%L, %L) $$, tests.uid('bia'), tests.post('gif')),
  'a adma segue por um post que é só um GIF'
);
select tests.login('bia');
select is(
  (select post_trecho from tests.seguidores where pessoas -> 0 ->> 'username' = 'moda'),
  'Café novo no bloco B.', 'post curto vem inteiro, sem reticências'
);
select is(
  (select jsonb_build_object('pelo_post', pelo_post, 'trecho', post_trecho)
     from tests.seguidores where pessoas -> 0 ->> 'username' = 'adma' and quantidade = 1),
  jsonb_build_object('pelo_post', true, 'trecho', null),
  'post só com GIF: "pelo seu post", sem trecho'
);

-- ---------------------------------------------------------------------------
-- Post apagado ou ocultado: a notificação fica, sem o trecho
-- ---------------------------------------------------------------------------
select lives_ok(format($$ select public.apagar_post(%L) $$, tests.post('longo')), 'a bia apaga o post');
select is(
  (select count(*) from tests.seguidores where post_trecho like 'Alguém topa%'), 0::bigint,
  'o trecho do post apagado some'
);
select is(
  (select jsonb_build_object('n', quantidade, 'pelo_post', pelo_post, 'trecho', post_trecho)
     from tests.seguidores where quantidade > 1),
  jsonb_build_object('n', 3, 'pelo_post', false, 'trecho', null),
  'e a ana continua lá, agora no grupo dos novos seguidores (3 pessoas)'
);
select tests.logout();
select is(tests.origem('ana', 'bia'), tests.post('longo'), 'o follow continua existindo');

update public.posts set hidden_at = now(), hidden_by = tests.uid('moda') where id = tests.post('curto');
select tests.login('bia');
select is(
  (select count(*) from tests.seguidores where post_trecho is not null), 0::bigint,
  'post ocultado pela moderação: o trecho também some'
);
select is((select quantidade from tests.seguidores where quantidade > 1), 4, 'e a moda vai para o grupo');
select tests.logout();

-- o post some de vez (é o que a exclusão de conta faz): nada quebra
delete from public.posts where id = tests.post('gif');
select is(tests.origem('adma', 'bia'), null, 'post removido do banco: o follow fica, sem origem');
select is(
  (select count(*) from public.notifications n where n.user_id = tests.uid('bia') and n.actor_id = tests.uid('adma') and n.post_id is null),
  1::bigint, 'e a notificação também, sem post'
);

-- ---------------------------------------------------------------------------
-- Virar mútuo por um post: a notificação é a de mútuo, sem trecho
-- ---------------------------------------------------------------------------
select tests.login('davi');
select lives_ok(format($$ insert into public.follows (followee_id) values (%L) $$, tests.uid('caio')), 'o davi segue o caio');
select tests.login('caio');
select lives_ok(
  format($$ insert into public.follows (followee_id, via_post_id) values (%L, %L) $$, tests.uid('davi'), tests.post('do_davi')),
  'e o caio segue de volta por um post do davi'
);
select tests.logout();
select is(
  (select jsonb_agg(jsonb_build_object('tipo', n.type, 'post', n.post_id) order by n.type)
     from public.notifications n where n.user_id = tests.uid('davi') and n.actor_id = tests.uid('caio')),
  jsonb_build_array(jsonb_build_object('tipo', 'mutuo', 'post', null)),
  'o davi recebe "viraram mútuos", sem post'
);
select throws_ok(
  format($$ insert into public.notifications (user_id, type, actor_id, post_id) values (%L, 'mutuo', %L, %L) $$,
         tests.uid('ana'), tests.uid('caio'), tests.post('do_caio')),
  '23514', null, 'o banco não aceita post em notificação que não é de novo seguidor'
);

-- ---------------------------------------------------------------------------
-- Bloqueio
-- ---------------------------------------------------------------------------
select tests.mk_user('eva');
insert into tests.posts values ('da_eva', tests.mk_post('eva', 'post da eva'));
select tests.login('ana');
select lives_ok(
  format($$ insert into public.follows (followee_id, via_post_id) values (%L, %L) $$, tests.uid('eva'), tests.post('da_eva')),
  'a ana segue a eva por um post'
);
select tests.login('eva');
select is(
  (select post_trecho from tests.seguidores), 'post da eva',
  'a eva vê a notificação com o trecho'
);
select lives_ok(format($$ insert into public.blocks (blocked_id) values (%L) $$, tests.uid('ana')), 'e bloqueia a ana');
select is(
  (select count(*) from tests.seguidores), 0::bigint,
  'a notificação some'
);
select tests.logout();
select is(
  (select count(*) from public.notifications n where n.user_id = tests.uid('eva') and n.actor_id = tests.uid('ana')), 0::bigint,
  'foi apagada de verdade, com o post e tudo'
);
select is(
  (select count(*) from public.follows f where f.follower_id = tests.uid('ana') and f.followee_id = tests.uid('eva')), 0::bigint,
  'e o follow, com a origem, também'
);
select tests.login('ana');
select throws_ok(
  format($$ insert into public.follows (followee_id, via_post_id) values (%L, %L) $$, tests.uid('eva'), tests.post('da_eva')),
  null, null, 'bloqueada, a ana não segue de novo, com ou sem post'
);
select tests.logout();

-- ---------------------------------------------------------------------------
-- Exclusão de conta
-- ---------------------------------------------------------------------------
select tests.login('moda');
select lives_ok(
  format($$ insert into public.follows (followee_id, via_post_id) values (%L, %L) $$, tests.uid('caio'), tests.post('do_caio')),
  'a moda segue o caio por um post'
);
select tests.logout();
select is(tests.post_da_notificacao('caio', 'moda'), tests.post('do_caio'), 'a notificação do caio tem o post');
-- quem seguiu exclui a conta
delete from auth.users where id = tests.uid('moda');
select is(
  (select count(*) from public.notifications n where n.user_id = tests.uid('caio') and n.post_id is not null), 0::bigint,
  'quem seguiu excluiu a conta: a notificação some, e o post dela na notificação junto'
);
-- quem foi seguido exclui a conta
select lives_ok(format($$ delete from auth.users where id = %L $$, tests.uid('bia')), 'a bia exclui a conta (posts, follows e notificações vão junto)');
select is(
  (select count(*) from public.follows f where f.via_post_id is not null and not exists (select 1 from public.posts p where p.id = f.via_post_id))
  + (select count(*) from public.notifications n where n.post_id is not null and not exists (select 1 from public.posts p where p.id = n.post_id)),
  0::bigint, 'não sobra origem nem notificação apontando para post que não existe'
);

select * from finish();
rollback;
