-- =============================================================================
-- Conquistas novas: Eco, Eureka, Hefesto, Nóstos e Panateneia
-- =============================================================================
-- As regras gerais (só o banco concede, permanente, catálogo fechado) estão em
-- 180_conquistas.sql. Aqui, a regra de cada uma e, de novo para cada uma, que
-- ninguém se dá a conquista pela API.
-- Dentro da transação now() é fixo, então as idades são exatas.
-- =============================================================================
begin;
\ir _helpers.psql
select plan(105);

select tests.seed_world();

create function tests.tem(p_alias text, p_slug text) returns boolean language sql stable security definer set search_path = '' as
  $$ select exists (select 1 from public.user_achievements ua where ua.user_id = tests.uid(p_alias) and ua.achievement_slug = p_slug) $$;
-- um follow com idade escolhida, como superusuário (sem rate limit)
create function tests.seguiu(p_de text, p_para text, p_ha interval default interval '0') returns void language sql as
  $$ insert into public.follows (follower_id, followee_id, created_at)
     values (tests.uid(p_de), tests.uid(p_para), now() - p_ha) $$;
grant execute on function tests.tem(text, text) to authenticated;

-- Contas antigas: Xênia e Panateneia só entram em cena onde o teste quer.
update public.profiles set created_at = now() - interval '60 days';
update private.accounts set maioridade_verificada_em = now() - interval '60 days' where maioridade_verificada_em is not null;

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------
select is(
  (select array_agg(slug order by position) from public.achievements where position between 15 and 19),
  array['eco', 'eureka', 'hefesto', 'nostos', 'panateneia'], 'as cinco conquistas novas estão no catálogo'
);
select is(
  (select count(*) from public.achievements
    where slug in ('eco', 'eureka', 'hefesto', 'nostos', 'panateneia') and (is_secret or private_by_default)),
  0::bigint, 'nenhuma é secreta nem nasce oculta: visíveis por padrão'
);
select is(
  (select array_agg(slug) from public.achievements where is_manual and position between 15 and 19),
  array['hefesto'], 'das novas, só Hefesto é concedida à mão'
);
select is(
  (select count(*) from public.achievements a
    where a.position between 15 and 19
      and (exists (select 1 from public.achievements b where b.slug <> a.slug and b.color = a.color)
        or exists (select 1 from public.achievements b where b.slug <> a.slug and b.emoji = a.emoji)
        or btrim(a.emoji_label) = '')),
  0::bigint, 'cada uma tem emoji e cor só seus, e o emoji tem descrição para leitor de tela'
);
select tests.login('ana');
select is(
  (select count(*) from public.achievements where position between 15 and 19), 5::bigint,
  'e aparecem no catálogo de quem ainda não ganhou nenhuma'
);

-- ---------------------------------------------------------------------------
-- Ninguém se dá nenhuma delas pela API
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$ insert into public.user_achievements (achievement_slug) values (%L) $$, s), '42501', null,
  s || ': usuário logado não insere para si'
) from unnest(array['eco', 'eureka', 'hefesto', 'nostos', 'panateneia']) s;
select throws_ok(
  format($$ insert into public.user_achievements (user_id, achievement_slug) values (%L, %L) $$, tests.uid('ana'), s),
  '42501', null, s || ': nem informando o próprio id'
) from unnest(array['eco', 'eureka', 'hefesto', 'nostos', 'panateneia']) s;
select throws_ok(
  format($$ update public.user_achievements set achievement_slug = %L where achievement_slug = 'fundador' $$, s),
  '42501', null, s || ': nem trocando uma que tem por ela'
) from unnest(array['eco', 'eureka', 'hefesto', 'nostos', 'panateneia']) s;
select throws_ok(
  format($$ select private.conceder(auth.uid(), %L) $$, s), '42501', null,
  s || ': nem chamando a função interna que concede'
) from unnest(array['eco', 'eureka', 'hefesto', 'nostos', 'panateneia']) s;
select throws_ok(
  format($$ select public.conceder_conquista(auth.uid(), %L, 'eu mereço') $$, s), 'PT403', null,
  s || ': nem pela RPC de admin'
) from unnest(array['eco', 'eureka', 'hefesto', 'nostos', 'panateneia']) s;
-- os atalhos de cada regra
select throws_ok(
  format($$ insert into public.follows (follower_id, followee_id) values (%L, %L) $$, tests.uid('bia'), tests.uid('ana')),
  '42501', null, 'Eco: ninguém cria o follow de volta em nome de outra pessoa'
);
select throws_ok(
  format($$ insert into public.follows (followee_id, created_at) values (%L, now() - interval '10 minutes') $$, tests.uid('bia')),
  '42501', null, 'Eco: nem escolhe a data do próprio follow'
);
select throws_ok(
  $$ insert into public.tag_requests (name, status) values ('Já aprovada', 'aprovada') $$, '42501', null,
  'Eureka: ninguém cria um pedido de tag já aprovado'
);
select throws_ok(
  $$ insert into public.posts (body, created_at) values ('post antigo', now() - interval '40 days') $$, '42501', null,
  'Nóstos: ninguém escolhe a data do próprio post'
);
select throws_ok(
  $$ insert into private.config (chave, valor) values ('panateneia_inicio', now()::text) $$, '42501', null,
  'Panateneia: a janela não se define pela API'
);
select throws_ok($$ select * from private.config $$, '42501', null, 'nem se lê');
select tests.logout();
select is(
  (select count(*) from public.user_achievements
    where achievement_slug in ('eco', 'eureka', 'hefesto', 'nostos', 'panateneia')
      and user_id in (select id from tests.users)),
  0::bigint, 'nenhuma das tentativas deu conquista'
);

-- ---------------------------------------------------------------------------
-- Eco
-- ---------------------------------------------------------------------------
-- pela API, como acontece de verdade: a ana segue, o caio segue de volta
select tests.login('ana');
select lives_ok(format($$ insert into public.follows (followee_id) values (%L) $$, tests.uid('caio')), 'a ana segue o caio');
select tests.logout();
select is(tests.tem('ana', 'eco'), false, 'seguir, sem ser seguida de volta, não dá o Eco');
select tests.login('caio');
select lives_ok(format($$ insert into public.follows (followee_id) values (%L) $$, tests.uid('ana')), 'o caio segue de volta na hora');
select tests.logout();
select is(tests.tem('ana', 'eco'), true, 'quem seguiu primeiro ganha o Eco');
select is(tests.tem('caio', 'eco'), false, 'quem seguiu de volta não ganha');
select is(
  (select count(*) from public.notifications
    where user_id = tests.uid('ana') and type = 'conquista' and achievement_slug = 'eco' and actor_id is null),
  1::bigint, 'o Eco gera a notificação de conquista nova, que não aponta para ninguém'
);
select is(
  (select hidden from public.user_achievements where user_id = tests.uid('ana') and achievement_slug = 'eco'), false,
  'e nasce à mostra'
);

select tests.seguiu('bia', 'davi', interval '59 minutes');
select tests.seguiu('davi', 'bia');
select is(tests.tem('bia', 'eco'), true, 'follow de volta 59 minutos depois: Eco');
select tests.seguiu('moda', 'davi', interval '1 hour');
select tests.seguiu('davi', 'moda');
select is(tests.tem('moda', 'eco'), false, 'uma hora exata depois: não é "menos de uma hora"');
select tests.seguiu('adma', 'davi', interval '3 days');
select tests.seguiu('davi', 'adma');
select is(tests.tem('adma', 'eco'), false, 'três dias depois: não');
select is(tests.tem('davi', 'eco'), false, 'o davi só seguiu de volta: nenhum Eco para ele');

delete from public.follows where follower_id = tests.uid('caio') and followee_id = tests.uid('ana');
select is(tests.tem('ana', 'eco'), true, 'o caio deixou de seguir: o Eco da ana fica (é permanente)');

-- ---------------------------------------------------------------------------
-- Eureka
-- ---------------------------------------------------------------------------
select tests.login('ana');
select lives_ok($$ insert into public.tag_requests (name, category) values ('Capoeira', 'esportes') $$, 'a ana pede uma tag');
select lives_ok($$ insert into public.tag_requests (name) values ('Tag que vai ser recusada') $$, 'e outra');
select throws_ok($$ update public.tag_requests set status = 'aprovada' $$, '42501', null, 'quem pediu não aprova o próprio pedido');
select throws_ok(
  format($$ select public.resolver_pedido_tag(%L, true, 'eu aprovo') $$,
         (select id from public.tag_requests where name = 'Capoeira')),
  'PT403', null, 'nem pela RPC da staff'
);
select tests.login('bia');
select lives_ok($$ insert into public.tag_requests (name) values ('Pedido da bia') $$, 'a bia também pede uma');
select tests.logout();
select is(tests.tem('ana', 'eureka'), false, 'pedir não dá a Eureka');

select tests.login_mfa('adma');
select lives_ok(
  format($$ select public.resolver_pedido_tag(%L, false, 'já existe uma parecida') $$,
         (select id from public.tag_requests where name = 'Tag que vai ser recusada')),
  'a admin recusa um pedido da ana'
);
select lives_ok(
  format($$ select public.resolver_pedido_tag(%L, false, 'fora do escopo') $$,
         (select id from public.tag_requests where name = 'Pedido da bia')),
  'e o da bia'
);
select tests.logout();
select is(tests.tem('ana', 'eureka'), false, 'pedido recusado não dá a Eureka');
select tests.login_mfa('adma');
select lives_ok(
  format($$ select public.resolver_pedido_tag(%L, true, 'boa ideia') $$,
         (select id from public.tag_requests where name = 'Capoeira')),
  'a admin aprova o outro pedido da ana'
);
select tests.logout();
select is(tests.tem('ana', 'eureka'), true, 'pedido aprovado: Eureka para quem pediu');
select is(tests.tem('bia', 'eureka'), false, 'a bia, com o pedido recusado, não');
select is(tests.tem('adma', 'eureka'), false, 'nem a admin que aprovou');
select is(
  (select count(*) from public.notifications
    where user_id = tests.uid('ana') and type = 'conquista' and achievement_slug = 'eureka'),
  1::bigint, 'com a notificação de conquista nova'
);

-- ---------------------------------------------------------------------------
-- Hefesto: só admin, sempre registrado (como o Héracles)
-- ---------------------------------------------------------------------------
select tests.login('bia');
select throws_ok(
  format($$ select public.conceder_conquista(%L, 'hefesto', 'sugeriu o menu') $$, tests.uid('caio')), 'PT403', null,
  'usuário comum não concede Hefesto'
);
select tests.login_mfa('moda');
select throws_ok(
  format($$ select public.conceder_conquista(%L, 'hefesto', 'sugeriu o menu') $$, tests.uid('caio')), 'PT403', null,
  'moderador não concede: só admin'
);
select tests.login('adma');
select throws_ok(
  format($$ select public.conceder_conquista(%L, 'hefesto', 'sugeriu o menu') $$, tests.uid('caio')), 'PT403', null,
  'admin sem o segundo fator não concede'
);
select tests.login_mfa('adma');
select throws_ok(
  format($$ select public.conceder_conquista(%L, 'hefesto', '  ') $$, tests.uid('caio')), 'PT400', null,
  'sem motivo não concede'
);
select throws_ok(
  $$ select public.conceder_conquista(auth.uid(), 'hefesto', 'a ideia foi minha') $$, 'PT400', null,
  'nem a si mesma'
);
select throws_ok(
  format($$ select public.conceder_conquista(%L, 'hefesto', 'sugeriu o menu') $$, tests.uid('zeca')), 'PT403', null,
  'nem a alguém de outra instituição'
);
select throws_ok(
  format($$ select public.conceder_conquista(%L, %L, 'porque sim') $$, tests.uid('caio'), s), 'PT400', null,
  s || ': não é das que a admin concede à mão'
) from unnest(array['eco', 'eureka', 'nostos', 'panateneia']) s;
select lives_ok(
  format($$ select public.conceder_conquista(%L, 'hefesto', 'sugeriu o menu de mais ações no post') $$, tests.uid('caio')),
  'admin com o segundo fator concede Hefesto'
);
select throws_ok(
  format($$ select public.conceder_conquista(%L, 'hefesto', 'de novo') $$, tests.uid('caio')), 'PT409', null,
  'duas vezes não'
);
select tests.logout();
select is(tests.tem('caio', 'hefesto'), true, 'o caio tem Hefesto');
select is(
  (select hidden from public.user_achievements where user_id = tests.uid('caio') and achievement_slug = 'hefesto'), false,
  'à mostra por padrão'
);
select is(
  (select jsonb_agg(jsonb_build_object('ator', actor_id, 'alvo', target_user_id, 'motivo', reason, 'meta', metadata))
     from public.moderation_actions where action = 'conceder_conquista'),
  jsonb_build_array(jsonb_build_object(
    'ator', tests.uid('adma'), 'alvo', tests.uid('caio'),
    'motivo', 'sugeriu o menu de mais ações no post', 'meta', jsonb_build_object('conquista', 'hefesto'))),
  'a concessão ficou registrada em moderation_actions, uma vez só, com quem, para quem e por quê'
);
select is(
  (select count(*) from public.user_achievements
    where achievement_slug = 'hefesto' and user_id in (select id from tests.users)), 1::bigint,
  'e ninguém mais ganhou Hefesto'
);

-- ---------------------------------------------------------------------------
-- Nóstos
-- ---------------------------------------------------------------------------
-- pela API: a ana tinha um post de 45 dias atrás e volta a publicar
select tests.mk_post('ana', 'antes do sumiço', interval '45 days');
select is(tests.tem('ana', 'nostos'), false, 'o primeiro post é o Peripatético, não o Nóstos');
select tests.login('ana');
select lives_ok($$ insert into public.posts (body) values ('voltei') $$, 'a ana publica 45 dias depois');
select tests.logout();
select is(tests.tem('ana', 'nostos'), true, 'post depois de 30 dias ou mais sem publicar: Nóstos');
select is(
  (select count(*) from public.notifications
    where user_id = tests.uid('ana') and type = 'conquista' and achievement_slug = 'nostos'),
  1::bigint, 'com a notificação de conquista nova'
);

select tests.mk_post('bia', 'há 30 dias', interval '30 days');
select tests.mk_post('bia', 'hoje');
select is(tests.tem('bia', 'nostos'), true, '30 dias exatos já contam');

select tests.mk_post('caio', 'há quase 30 dias', interval '29 days 23 hours 59 minutes');
select tests.mk_post('caio', 'hoje');
select is(tests.tem('caio', 'nostos'), false, '29 dias, 23 horas e 59 minutos: ainda não');

select tests.mk_post('davi', 'há 20 dias', interval '20 days');
select tests.mk_post('davi', 'há 10 dias', interval '10 days');
select tests.mk_post('davi', 'hoje');
select is(tests.tem('davi', 'nostos'), false, 'três posts em 20 dias: nunca ficou 30 dias sem publicar');

-- o anterior foi apagado pelo autor: a pessoa publicou do mesmo jeito
select tests.mk_post('moda', 'há 40 dias, apagado', interval '40 days');
update public.posts set deleted_at = now() - interval '39 days' where author_id = tests.uid('moda');
select tests.mk_post('moda', 'hoje');
select is(tests.tem('moda', 'nostos'), true, 'o post anterior conta mesmo apagado');

select tests.mk_post('adma', 'meu primeiro e único post');
select is(tests.tem('adma', 'nostos'), false, 'quem nunca tinha publicado não "voltou"');

select tests.login('ana');
select lives_ok($$ insert into public.posts (body) values ('de novo, no mesmo dia') $$, 'a ana publica outra vez');
select tests.logout();
select is(
  (select count(*) from public.user_achievements where user_id = tests.uid('ana') and achievement_slug = 'nostos'),
  1::bigint, 'continua com um Nóstos só'
);

-- ---------------------------------------------------------------------------
-- Panateneia
-- ---------------------------------------------------------------------------
select tests.mk_user('p_sem_janela');
select is(tests.tem('p_sem_janela', 'panateneia'), false, 'sem janela configurada, ninguém ganha a Panateneia');

insert into private.config (chave, valor) values ('panateneia_inicio', (now() - interval '1 hour')::text);
select tests.mk_user('p_so_inicio');
select is(tests.tem('p_so_inicio', 'panateneia'), false, 'só com o início (sem o fim), também não');

insert into private.config (chave, valor) values ('panateneia_fim', (now() + interval '1 hour')::text);
select tests.mk_user('p_dentro');
select is(tests.tem('p_dentro', 'panateneia'), true, 'concluiu o onboarding dentro da janela: Panateneia');
select is(
  (select hidden from public.user_achievements where user_id = tests.uid('p_dentro') and achievement_slug = 'panateneia'), false,
  'à mostra por padrão'
);

-- pelo caminho de verdade: a conta já existia, o onboarding é que cai na janela
select tests.mk_user('p_rpc', 'a.peripatos.test', false);
update public.profiles set created_at = now() - interval '90 days' where id = tests.uid('p_rpc');
select is(tests.tem('p_rpc', 'panateneia'), false, 'conta criada, onboarding por fazer: ainda não');
select tests.login('p_rpc');
select lives_ok(
  $$ select public.completar_onboarding('p_rpc', 'P Rpc', date '2000-01-01', null, private.termos_versao_atual()) $$,
  'conclui o onboarding pela RPC, durante a janela'
);
select tests.logout();
select is(tests.tem('p_rpc', 'panateneia'), true, 'vale a data em que concluiu o onboarding, não a da conta');

-- quem já estava aqui antes da janela não ganha por mexer no perfil
update public.profiles set bio = 'bio nova' where id = tests.uid('ana');
select is(tests.tem('ana', 'panateneia'), false, 'quem concluiu o onboarding antes da janela não ganha');

-- as pontas: o início conta, o fim não
update private.config set valor = now()::text where chave = 'panateneia_inicio';
select tests.mk_user('p_no_inicio');
select is(tests.tem('p_no_inicio', 'panateneia'), true, 'no instante do início: ganha');
update private.config set valor = (now() - interval '1 hour')::text where chave = 'panateneia_inicio';
update private.config set valor = now()::text where chave = 'panateneia_fim';
select tests.mk_user('p_no_fim');
select is(tests.tem('p_no_fim', 'panateneia'), false, 'no instante do fim: não ganha');

-- a janela já passou
update private.config set valor = (now() - interval '8 days')::text where chave = 'panateneia_inicio';
update private.config set valor = (now() - interval '1 day')::text where chave = 'panateneia_fim';
select tests.mk_user('p_depois');
select is(tests.tem('p_depois', 'panateneia'), false, 'depois da janela: não');
select is(tests.tem('p_dentro', 'panateneia'), true, 'mudar a janela não tira a conquista de quem já tinha');

-- janela definida depois do fato: vale na próxima vez em que o perfil é conferido
update private.config set valor = (now() + interval '1 hour')::text where chave = 'panateneia_fim';
select is(tests.tem('p_so_inicio', 'panateneia'), false, 'definir a janela depois não concede sozinho');
update public.profiles set bio = 'cheguei na abertura' where id = tests.uid('p_so_inicio');
select is(tests.tem('p_so_inicio', 'panateneia'), true, 'mas quem concluiu dentro dela ganha quando o perfil é conferido de novo');
delete from private.config where chave like 'panateneia_%';

-- ---------------------------------------------------------------------------
-- Excluir a conta leva as novas também
-- ---------------------------------------------------------------------------
delete from auth.users where id = tests.uid('ana');
select is(
  (select count(*) from public.user_achievements ua
    where not exists (select 1 from public.profiles p where p.id = ua.user_id)),
  0::bigint, 'conta excluída não deixa conquista para trás'
);

select * from finish();
rollback;
