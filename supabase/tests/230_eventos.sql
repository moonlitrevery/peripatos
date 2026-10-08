-- =============================================================================
-- Eventos: privacidade, fluxo com aprovação, vagas, limites, exclusão de conta,
-- moderação, lembrete e conquistas
-- =============================================================================
-- Instituição A: ana, bia, caio, davi (comuns), moda (moderação), adma (admin)
--   e mais eva, fabi e gil. Instituição B: zeca.
-- A concorrência na última vaga (duas conexões de verdade) está em
-- 240_eventos_concorrencia.sql.
-- =============================================================================
begin;
\ir _helpers.psql
select plan(223);

select tests.seed_world();
select tests.mk_user(a) from unnest(array['eva', 'fabi', 'gil']) a;
select tests.add_tag('ana', 't-rock');
select tests.add_tag('ana', 't-rpg');

create table tests.eventos (nome text primary key, id uuid not null);
grant select on tests.eventos to authenticated;
create function tests.ev(p_nome text) returns uuid language sql stable security definer set search_path = '' as
  $$ select e.id from tests.eventos e where e.nome = p_nome $$;
-- um evento pronto, como superusuário (sem limite e sem passar pela RPC)
create function tests.mk_evento(
  p_nome text, p_org text, p_tipo public.event_kind default 'aberto', p_vagas integer default null,
  p_modalidade public.event_modality default 'presencial', p_em interval default interval '3 days'
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.events (organizer_id, institution_id, title, description, starts_at, over_at, modality, general_location, kind, capacity)
  select p.id, p.institution_id, 'Evento ' || p_nome, 'descrição de ' || p_nome, now() + p_em, now() + p_em + interval '2 hours',
         p_modalidade, case when p_modalidade = 'presencial' then 'no campus' end, p_tipo, p_vagas
  from public.profiles p where p.id = tests.uid(p_org)
  returning id into v_id;
  insert into public.event_details (event_id, exact_location, link)
  values (v_id, case when p_modalidade = 'presencial' then 'Sala 12 do bloco C, ' || p_nome end,
          case when p_modalidade = 'online' then 'https://meet.example/' || p_nome end);
  insert into tests.eventos values (p_nome, v_id);
  return v_id;
end $$;
create function tests.poe(p_nome text, p_alias text, p_status public.event_participation default 'confirmado') returns void language sql as
  $$ insert into public.event_participants (event_id, user_id, status) values (tests.ev(p_nome), tests.uid(p_alias), p_status) $$;
create function tests.status(p_nome text, p_alias text) returns text language sql stable security definer set search_path = '' as
  $$ select ep.status::text from public.event_participants ep where ep.event_id = tests.ev(p_nome) and ep.user_id = tests.uid(p_alias) $$;
create function tests.avisos(p_alias text, p_tipo text, p_nome text default null) returns bigint language sql stable security definer set search_path = '' as
  $$ select count(*) from public.notifications n
     where n.user_id = tests.uid(p_alias) and n.type::text = p_tipo and (p_nome is null or n.event_id = tests.ev(p_nome)) $$;
create function tests.tem(p_alias text, p_slug text) returns boolean language sql stable security definer set search_path = '' as
  $$ select exists (select 1 from public.user_achievements ua where ua.user_id = tests.uid(p_alias) and ua.achievement_slug = p_slug) $$;
-- quem a pessoa logada enxerga na lista de um evento
create function tests.lista(p_nome text) returns text[] language sql stable as
  $$ select coalesce(array_agg(u.alias order by u.alias), '{}')
     from public.event_participants ep join tests.users u on u.id = ep.user_id where ep.event_id = tests.ev(p_nome) $$;
grant execute on function tests.ev(text), tests.status(text, text), tests.avisos(text, text, text), tests.tem(text, text), tests.lista(text) to authenticated;
grant select on tests.users to authenticated;

-- ---------------------------------------------------------------------------
-- Criar: quem organiza é quem chama, e nada é aceito sem conferir
-- ---------------------------------------------------------------------------
select tests.login('ana');
select lives_ok(
  format($$ select public.criar_evento('  Mesa de RPG  ', 'Chamado de Cthulhu para iniciantes', now() + interval '2 days', null,
            'presencial', ' no campus ', 'Sala 3 da biblioteca', 'https://ignorado.example', 'aprovacao', 5, array[%s, %s]) $$,
         tests.tag('t-rpg'), tests.tag('t-rock')),
  'usuária ativa cria um evento presencial com aprovação'
);
select tests.logout();
insert into tests.eventos select 'mesa', id from public.events where title = 'Mesa de RPG';
select is(
  (select jsonb_build_object('org', e.organizer_id, 'inst', e.institution_id, 'tipo', e.kind, 'vagas', e.capacity, 'geral', e.general_location,
                             'fim', e.ends_at, 'acaba', e.over_at = e.starts_at + interval '2 hours', 'cancelado', e.cancelled_at, 'oculto', e.hidden_at)
     from public.events e where e.id = tests.ev('mesa')),
  jsonb_build_object('org', tests.uid('ana'), 'inst', (select institution_id from public.profiles where id = tests.uid('ana')),
                     'tipo', 'aprovacao', 'vagas', 5, 'geral', 'no campus', 'fim', null, 'acaba', true, 'cancelado', null, 'oculto', null),
  'organizador e instituição são os de quem chamou; sem fim, o evento dura duas horas'
);
select is(
  (select jsonb_build_object('exato', d.exact_location, 'link', d.link) from public.event_details d where d.event_id = tests.ev('mesa')),
  jsonb_build_object('exato', 'Sala 3 da biblioteca', 'link', null),
  'o local exato fica à parte, e evento presencial não guarda link'
);
select is((select count(*) from public.event_tags where event_id = tests.ev('mesa')), 2::bigint, 'as tags do evento foram gravadas');

select tests.login('ana');
select lives_ok(
  $$ select public.criar_evento('Sessão online', '', now() + interval '1 day', now() + interval '1 day 3 hours',
            'online', 'no campus', 'Sala 3', 'https://meet.example/sessao', 'aberto', null) $$,
  'e um evento online, aberto, sem vagas'
);
select tests.logout();
insert into tests.eventos select 'sessao', id from public.events where title = 'Sessão online';
select is(
  (select jsonb_build_object('geral', e.general_location, 'exato', d.exact_location, 'link', d.link, 'acaba', e.over_at = e.ends_at)
     from public.events e join public.event_details d on d.event_id = e.id where e.id = tests.ev('sessao')),
  jsonb_build_object('geral', null, 'exato', null, 'link', 'https://meet.example/sessao', 'acaba', true),
  'evento online guarda só o link; com fim, acaba no fim'
);

select tests.login('ana');
select throws_ok(format($$ select public.criar_evento(%s) $$, args), 'PT400', null, oque)
from (values
  ($a$'ab', '', now() + interval '1 day', null, 'presencial', 'campus', null, null, 'aberto', null$a$, 'título curto demais'),
  ($a$'Evento', '', now() - interval '1 hour', null, 'presencial', 'campus', null, null, 'aberto', null$a$, 'início no passado'),
  ($a$'Evento', '', now() + interval '2 years', null, 'presencial', 'campus', null, null, 'aberto', null$a$, 'início daqui a mais de um ano'),
  ($a$'Evento', '', now() + interval '2 days', now() + interval '1 day', 'presencial', 'campus', null, null, 'aberto', null$a$, 'fim antes do início'),
  ($a$'Evento', '', now() + interval '1 day', null, 'presencial', null, 'Sala 3', null, 'aberto', null$a$, 'presencial sem local geral'),
  ($a$'Evento', '', now() + interval '1 day', null, 'online', null, null, null, 'aberto', null$a$, 'online sem link'),
  ($a$'Evento', '', now() + interval '1 day', null, 'online', null, null, 'javascript:alert(1)', 'aberto', null$a$, 'link javascript:'),
  ($a$'Evento', '', now() + interval '1 day', null, 'online', null, null, 'ftp://arquivos.example/x', 'aberto', null$a$, 'link que não é http nem https'),
  ($a$'Evento', '', now() + interval '1 day', null, 'online', null, null, 'https://a.example/x y', 'aberto', null$a$, 'link com espaço'),
  ($a$'Evento', '', now() + interval '1 day', null, 'online', null, null, 'data:text/html,<script>', 'aberto', null$a$, 'link data:'),
  ($a$'Evento', '', now() + interval '1 day', null, 'presencial', 'campus', null, null, 'aberto', 0$a$, 'zero vagas'),
  ($a$'Evento', '', now() + interval '1 day', null, 'presencial', 'campus', null, null, 'aberto', 501$a$, 'vagas demais'),
  ($a$'Evento', '', now() + interval '1 day', null, 'presencial', 'campus', null, null, null, null$a$, 'sem tipo'),
  ($a$'Evento', '', now() + interval '1 day', null, 'presencial', 'campus', null, null, 'aberto', null, array[-1]$a$, 'tag que não existe')
) as t (args, oque);
select throws_ok(
  format($$ select public.criar_evento('Evento', '', now() + interval '1 day', null, 'presencial', 'campus', null, null, 'aberto', null, array[%s]) $$, tests.tag('t-sensivel')),
  'PT400', 'Tag inválida para um evento.', 'tag sensível não marca evento'
);

-- nada se escreve direto nas tabelas
select throws_ok(
  format($$ insert into public.events (organizer_id, institution_id, title, starts_at, over_at, modality, general_location, kind)
            select %L, institution_id, 'Forjado', now() + interval '1 day', now() + interval '2 days', 'presencial', 'x', 'aberto' from public.profiles where id = %L $$,
         tests.uid('bia'), tests.uid('bia')),
  '42501', null, 'ninguém cria evento direto na tabela, muito menos em nome de outra pessoa'
);
select throws_ok(format($$ update public.events set organizer_id = %L $$, tests.uid('ana')), '42501', null, 'nem troca quem organiza');
select throws_ok($$ update public.events set capacity = 500 $$, '42501', null, 'nem mexe nas vagas');
select throws_ok($$ update public.events set institution_id = gen_random_uuid() $$, '42501', null, 'nem na instituição');
select throws_ok($$ delete from public.events $$, '42501', null, 'nem apaga evento');
select throws_ok(
  format($$ insert into public.event_participants (event_id, user_id, status) values (%L, auth.uid(), 'confirmado') $$, tests.ev('mesa')),
  '42501', null, 'ninguém se confirma direto na tabela, pulando a aprovação'
);
select throws_ok($$ update public.event_participants set status = 'confirmado' $$, '42501', null, 'nem se aprova');
select throws_ok($$ delete from public.event_participants $$, '42501', null, 'nem apaga participação');
select throws_ok($$ update public.event_details set link = 'https://golpe.example' $$, '42501', null, 'nem troca o link');
select throws_ok(format($$ insert into public.event_tags (event_id, tag_id) values (%L, %s) $$, tests.ev('mesa'), tests.tag('t-xadrez')), '42501', null, 'nem as tags');
select throws_ok($$ select private.gravar_evento(null, 'x', '', now(), null, 'online', null, null, 'https://x.example', null, '{}') $$, '42501', null, 'nem chama a função interna');
select tests.login_anon();
select throws_ok($$ select * from public.events $$, '42501', null, 'anon não lê eventos');
select throws_ok($$ select * from public.eventos_proximos() $$, '42501', null, 'nem a RPC da lista');
select throws_ok($$ select * from public.event_participants $$, '42501', null, 'nem participantes');
select tests.logout();

-- ---------------------------------------------------------------------------
-- Termos: criar e participar exigem; ler, não
-- ---------------------------------------------------------------------------
select tests.mk_evento('aberto', 'bia', 'aberto', 2);
update private.accounts set termos_versao = '2020-01-01' where user_id = tests.uid('gil');
select tests.login('gil');
select throws_ok(
  $$ select public.criar_evento('Evento', '', now() + interval '1 day', null, 'presencial', 'campus', null, null, 'aberto', null) $$,
  'PT403', 'Aceite a versão atual dos Termos de uso para criar ou participar de eventos.', 'sem os Termos em dia, não cria'
);
select throws_ok(format($$ select public.participar_evento(%L) $$, tests.ev('aberto')), 'PT403', null, 'nem participa');
select is((select count(*) from public.eventos_proximos()), 3::bigint, 'mas lê a lista normalmente');
select tests.login('novo');
select throws_ok(format($$ select public.participar_evento(%L) $$, tests.ev('aberto')), 'PT403', null, 'conta sem onboarding não participa');
select is((select count(*) from public.eventos_proximos()), 0::bigint, 'nem vê eventos');
select tests.logout();
update private.accounts set termos_versao = private.termos_versao_atual() where user_id = tests.uid('gil');

-- ---------------------------------------------------------------------------
-- Só a mesma instituição
-- ---------------------------------------------------------------------------
select tests.mk_evento('da_b', 'zeca', 'aberto');
select tests.login('ana');
select is((select count(*) from public.events where id = tests.ev('da_b')), 0::bigint, 'evento de outra instituição não existe para a ana');
select is((select count(*) from public.evento(tests.ev('da_b'))), 0::bigint, 'nem pela RPC');
select is((select count(*) from public.eventos_proximos() where id = tests.ev('da_b')), 0::bigint, 'nem na lista');
select throws_ok(format($$ select public.participar_evento(%L) $$, tests.ev('da_b')), 'PT404', 'Evento não encontrado.', 'e ela não participa dele');
select throws_ok(format($$ select public.denunciar_evento(%L, 'spam') $$, tests.ev('da_b')), 'PT404', null, 'nem denuncia');
select tests.login('zeca');
select is((select count(*) from public.eventos_proximos()), 1::bigint, 'o zeca vê só o da instituição dele');
select tests.logout();

-- ---------------------------------------------------------------------------
-- Quem vai: só quem organiza e quem está confirmado
-- ---------------------------------------------------------------------------
-- 'aberto' (da bia, 2 vagas): caio confirmado. 'apr' (da bia, com aprovação,
-- online, sem vagas): eva confirmada, davi pendente.
select tests.mk_evento('apr', 'bia', 'aprovacao', null, 'online');
select tests.poe('aberto', 'caio');
select tests.poe('apr', 'eva');
select tests.poe('apr', 'davi', 'pendente');

select tests.login('ana');
select is((select count(*) from public.event_participants), 0::bigint, 'quem não está no evento não vê NINGUÉM na lista');
select is(
  (select jsonb_build_object('vagas', vagas, 'restam', vagas_restantes, 'pendentes', pedidos_pendentes, 'status', meu_status)
     from public.evento(tests.ev('aberto'))),
  jsonb_build_object('vagas', 2, 'restam', 1, 'pendentes', null, 'status', null),
  'com vagas, todo mundo vê quantas sobram (1 de 2)'
);
select is(
  (select jsonb_build_object('vagas', vagas, 'restam', vagas_restantes, 'pendentes', pedidos_pendentes) from public.evento(tests.ev('apr'))),
  jsonb_build_object('vagas', null, 'restam', null, 'pendentes', null),
  'sem vagas, nenhum número sai'
);
select is(
  (select array_agg(a.attname::text order by a.attnum) from pg_attribute a where a.attrelid = 'public.evento_visto'::regclass and a.attnum > 0),
  array['id', 'titulo', 'descricao', 'inicio', 'fim', 'modalidade', 'local_geral', 'tipo', 'vagas', 'vagas_restantes',
        'organizador_id', 'organizador_username', 'organizador_nome', 'organizador_avatar_path', 'organizador_avatar_preset',
        'tags', 'tags_em_comum', 'meu_status', 'cancelado', 'oculto', 'acabou', 'local_exato', 'link', 'pedidos_pendentes'],
  'o que a RPC devolve não tem campo de quem vai nem de quantos vão'
);
select tests.login('bia');
select is(tests.lista('aberto'), array['caio'], 'quem organiza vê a lista');
select is(tests.lista('apr'), array['davi', 'eva'], 'inclusive os pedidos pendentes');
select is((select pedidos_pendentes from public.evento(tests.ev('apr'))), 1, 'e sabe quantos pedidos esperam');
select tests.login('eva');
select is(tests.lista('apr'), array['eva'], 'quem está confirmado vê os confirmados, e não quem só pediu');
select tests.login('davi');
select is(tests.lista('apr'), array['davi'], 'quem só pediu vê a própria linha, e mais ninguém');
select tests.login('caio');
select is(tests.lista('apr'), '{}'::text[], 'estar confirmado num evento não abre a lista de outro');
select tests.logout();
select tests.poe('aberto', 'fabi');
select tests.login('caio');
select is(tests.lista('aberto'), array['caio', 'fabi'], 'confirmados se veem entre si');

-- ---------------------------------------------------------------------------
-- Local exato e link: só quem organiza e quem está confirmado
-- ---------------------------------------------------------------------------
select is((select local_exato from public.evento(tests.ev('aberto'))), 'Sala 12 do bloco C, aberto', 'confirmado vê o local exato');
select is((select count(*) from public.event_details where event_id = tests.ev('aberto')), 1::bigint, 'também pela tabela');
select is((select count(*) from public.event_details where event_id = tests.ev('apr')), 0::bigint, 'mas não o link de um evento em que não está');
select tests.login('ana');
select is(
  (select jsonb_build_object('geral', local_geral, 'exato', local_exato, 'link', link) from public.evento(tests.ev('aberto'))),
  jsonb_build_object('geral', 'no campus', 'exato', null, 'link', null),
  'quem não confirmou vê o local geral, e nunca o exato'
);
select is((select count(*) from public.event_details), 2::bigint, 'pela tabela, só os detalhes dos dois eventos que ela mesma organiza');
select is((select link from public.evento(tests.ev('apr'))), null, 'nem o link do evento online');
select tests.login('davi');
select is((select link from public.evento(tests.ev('apr'))), null, 'quem pediu e ainda não foi aceito não vê o link');
select is((select count(*) from public.event_details where event_id = tests.ev('apr')), 0::bigint, 'nem pela tabela');
select tests.login('eva');
select is((select link from public.evento(tests.ev('apr'))), 'https://meet.example/apr', 'quem foi aceito vê o link');
select tests.login('bia');
select is((select link from public.evento(tests.ev('apr'))), 'https://meet.example/apr', 'e quem organiza também');

-- ---------------------------------------------------------------------------
-- Staff não tem acesso à lista, ao local exato nem ao link
-- ---------------------------------------------------------------------------
select tests.login_mfa('moda');
select is((select count(*) from public.event_participants), 0::bigint, 'a moderação, com o segundo fator, não vê nenhum participante');
select is((select count(*) from public.event_details), 0::bigint, 'nem local exato ou link');
select tests.login_mfa('adma');
select is((select count(*) from public.event_participants), 0::bigint, 'a administração também não vê nenhum participante');
select tests.login_mfa('adma');
select is((select count(*) from public.event_details), 0::bigint, 'a admin não lê local exato nem link de evento nenhum');
select is(
  (select jsonb_build_object('exato', local_exato, 'link', link, 'pendentes', pedidos_pendentes) from public.evento(tests.ev('aberto'))),
  jsonb_build_object('exato', null, 'link', null, 'pendentes', null), 'nem pela RPC'
);
select tests.logout();
select is(
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename in ('event_participants', 'event_details', 'events', 'event_tags')
      and (p.qual ~* 'is_staff|is_admin|staff_roles' or p.cmd <> 'SELECT')),
  0::bigint, 'nenhuma política dos eventos cita a staff, e nenhuma permite escrever'
);

-- ---------------------------------------------------------------------------
-- Bloqueio, nas duas direções
-- ---------------------------------------------------------------------------
-- 'do_caio': evento do caio em que ana e bia estão confirmadas.
select tests.mk_evento('do_caio', 'caio', 'aberto');
select tests.poe('do_caio', 'ana');
select tests.poe('do_caio', 'bia');
select tests.poe('aberto', 'davi');
select tests.login('ana');
select is(tests.lista('do_caio'), array['ana', 'bia'], 'antes do bloqueio, a ana vê a bia na lista');
select is((select count(*) from public.eventos_proximos() where organizador_id = tests.uid('bia')), 2::bigint, 'e vê os eventos da bia');
select lives_ok(format($$ insert into public.blocks (blocked_id) values (%L) $$, tests.uid('bia')), 'a ana bloqueia a bia');
select is((select count(*) from public.eventos_proximos() where organizador_id = tests.uid('bia')), 0::bigint, 'os eventos da bia somem para quem bloqueou');
select is((select count(*) from public.events where organizer_id = tests.uid('bia')), 0::bigint, 'também pela tabela');
select is((select count(*) from public.evento(tests.ev('aberto'))), 0::bigint, 'e pela RPC do evento');
select throws_ok(format($$ select public.participar_evento(%L) $$, tests.ev('aberto')), 'PT404', 'Evento não encontrado.', 'ela não entra num evento que não vê');
select is(tests.lista('do_caio'), array['ana'], 'e, no evento de um terceiro, deixa de ver que a bia vai');
select tests.login('bia');
select is((select count(*) from public.eventos_proximos() where organizador_id = tests.uid('ana')), 0::bigint, 'os eventos de quem bloqueou somem para a bloqueada');
select is((select count(*) from public.evento(tests.ev('mesa'))), 0::bigint, 'pela RPC também');
select throws_ok(format($$ select public.participar_evento(%L) $$, tests.ev('sessao')), 'PT404', null, 'a bloqueada não entra no evento de quem a bloqueou');
select is(tests.lista('do_caio'), array['bia'], 'e não vê que a ana vai ao evento do terceiro');
select tests.login('caio');
select is(tests.lista('do_caio'), array['ana', 'bia'], 'quem organiza continua vendo as duas');
-- bloquear tira a pessoa do evento do outro
select tests.login('davi');
select lives_ok(format($$ insert into public.blocks (blocked_id) values (%L) $$, tests.uid('bia')), 'o davi, que ia a dois eventos da bia, a bloqueia');
select tests.logout();
select is(array[tests.status('aberto', 'davi'), tests.status('apr', 'davi')], array[null, null]::text[], 'a confirmação e o pedido dele nesses eventos somem');
select is(tests.status('do_caio', 'ana'), 'confirmado', 'a participação no evento de um terceiro continua');
delete from public.blocks;
select tests.login('ana');
select is((select count(*) from public.eventos_proximos() where organizador_id = tests.uid('bia')), 2::bigint, 'desfeito o bloqueio, os eventos voltam');
select tests.logout();

-- ---------------------------------------------------------------------------
-- Fluxo com aprovação
-- ---------------------------------------------------------------------------
select tests.login('bia');
select throws_ok(format($$ select public.participar_evento(%L) $$, tests.ev('apr')), 'PT400', 'Você organiza este evento.', 'quem organiza não pede para participar do próprio evento');
select tests.login('caio');
select is((select public.participar_evento(tests.ev('apr'))), 'pendente'::public.event_participation, 'pedir para participar deixa o pedido pendente');
select throws_ok(format($$ select public.participar_evento(%L) $$, tests.ev('apr')), 'PT409', 'Você já está neste evento.', 'pedir duas vezes não');
select tests.logout();
select is(
  (select jsonb_build_object('n', count(*), 'ator', min(n.actor_id::text)) from public.notifications n
    where n.user_id = tests.uid('bia') and n.type = 'evento_pedido' and n.event_id = tests.ev('apr')),
  jsonb_build_object('n', 1, 'ator', tests.uid('caio')::text), 'quem organiza é notificado do pedido, com quem pediu'
);
select is(tests.avisos('caio', 'evento_pedido'), 0::bigint, 'e quem pediu não recebe nada');
select tests.login('bia');
select is(
  (select jsonb_build_object('evento', evento_id, 'titulo', evento_titulo, 'quem', pessoas -> 0 ->> 'username')
     from public.minhas_notificacoes() where tipo = 'evento_pedido'),
  jsonb_build_object('evento', tests.ev('apr'), 'titulo', 'Evento apr', 'quem', 'caio'),
  'na aba de notificações o pedido vem com o evento e a pessoa'
);
select tests.login('eva');
select throws_ok(format($$ select public.responder_pedido(%L, %L, true) $$, tests.ev('apr'), tests.uid('caio')), 'PT404', null, 'participante não aceita pedido dos outros');
select tests.login('caio');
select throws_ok(format($$ select public.responder_pedido(%L, auth.uid(), true) $$, tests.ev('apr')), 'PT404', null, 'nem quem pediu se aceita');
select tests.login('bia');
select lives_ok(format($$ select public.responder_pedido(%L, %L, true) $$, tests.ev('apr'), tests.uid('caio')), 'quem organiza aceita');
select throws_ok(format($$ select public.responder_pedido(%L, %L, false) $$, tests.ev('apr'), tests.uid('caio')), 'PT409', null, 'pedido já respondido não se responde de novo');
select tests.logout();
select is(tests.status('apr', 'caio'), 'confirmado', 'o pedido aceito vira confirmação');
select is(tests.avisos('caio', 'evento_aceito', 'apr'), 1::bigint, 'quem pediu é avisado de que foi aceito');
select is(tests.avisos('bia', 'evento_pedido', 'apr'), 0::bigint, 'e o pedido sai das notificações de quem organiza');
select tests.login('caio');
select is((select link from public.evento(tests.ev('apr'))), 'https://meet.example/apr', 'aceito, passa a ver o link');
select is(tests.lista('apr'), array['caio', 'eva'], 'e a lista de quem vai');

-- recusa discreta
select tests.login('fabi');
select is((select public.participar_evento(tests.ev('apr'))), 'pendente'::public.event_participation, 'a fabi pede');
select tests.login('bia');
select lives_ok(format($$ select public.responder_pedido(%L, %L, false) $$, tests.ev('apr'), tests.uid('fabi')), 'quem organiza recusa');
select tests.logout();
select is(
  (select count(*) from public.notifications n where n.user_id = tests.uid('fabi') and n.type::text like 'evento%'), 0::bigint,
  'a recusa não gera notificação nenhuma'
);
select is(
  (select array_agg(a.attname::text order by a.attnum) from pg_attribute a
    where a.attrelid = 'public.event_participants'::regclass and a.attnum > 0 and not a.attisdropped),
  array['event_id', 'user_id', 'status', 'created_at', 'decided_at'], 'e não existe onde guardar um motivo'
);
select tests.login('fabi');
select is((select meu_status from public.evento(tests.ev('apr'))), 'recusado', 'a pessoa vê só que o pedido não foi aceito');
select is((select link from public.evento(tests.ev('apr'))), null, 'e continua sem o link');
select throws_ok(format($$ select public.participar_evento(%L) $$, tests.ev('apr')), 'PT403', 'Não é possível participar deste evento.', 'pedir de novo não insiste');
select throws_ok(format($$ select public.sair_do_evento(%L) $$, tests.ev('apr')), 'PT409', null, 'e não há pedido para cancelar');

-- cancelar o pedido, desistir, remover
select tests.login('gil');
select is((select public.participar_evento(tests.ev('apr'))), 'pendente'::public.event_participation, 'o gil pede');
select lives_ok(format($$ select public.sair_do_evento(%L) $$, tests.ev('apr')), 'e cancela o pedido');
select tests.logout();
select is(tests.status('apr', 'gil'), null, 'o pedido cancelado some');
select is(tests.avisos('bia', 'evento_pedido', 'apr'), 0::bigint, 'junto com o aviso para quem organiza');
select tests.login('caio');
select lives_ok(format($$ select public.sair_do_evento(%L) $$, tests.ev('apr')), 'quem estava confirmado desiste');
select is((select link from public.evento(tests.ev('apr'))), null, 'e deixa de ver o link');
select is(tests.lista('apr'), '{}'::text[], 'e a lista');
select tests.login('eva');
select throws_ok(format($$ select public.remover_participante(%L, %L) $$, tests.ev('apr'), tests.uid('eva')), 'PT404', null, 'participante não remove ninguém');
select tests.login('bia');
select lives_ok(format($$ select public.remover_participante(%L, %L) $$, tests.ev('apr'), tests.uid('eva')), 'quem organiza remove um participante');
select throws_ok(format($$ select public.remover_participante(%L, %L) $$, tests.ev('apr'), tests.uid('eva')), 'PT409', null, 'duas vezes não');
select tests.login('eva');
select is((select link from public.evento(tests.ev('apr'))), null, 'quem foi removida perde o link');
select is(tests.lista('apr'), array['eva'], 'e a lista: sobra só a própria linha');
select throws_ok(format($$ select public.participar_evento(%L) $$, tests.ev('apr')), 'PT403', null, 'e não volta a entrar');
select tests.logout();

-- ---------------------------------------------------------------------------
-- Vagas nunca são excedidas (em sequência; a corrida está no arquivo 240)
-- ---------------------------------------------------------------------------
select tests.mk_evento('uma', 'bia', 'aberto', 1);
select tests.login('ana');
select is((select public.participar_evento(tests.ev('uma'))), 'confirmado'::public.event_participation, 'evento aberto: confirmar basta');
select tests.login('caio');
select is((select vagas_restantes from public.evento(tests.ev('uma'))), 0, 'a última vaga foi ocupada');
select throws_ok(format($$ select public.participar_evento(%L) $$, tests.ev('uma')), 'PT409', 'Não há mais vagas neste evento.', 'evento cheio não aceita mais ninguém');
select tests.login('ana');
select lives_ok(format($$ select public.sair_do_evento(%L) $$, tests.ev('uma')), 'a ana desiste');
select tests.login('caio');
select is((select public.participar_evento(tests.ev('uma'))), 'confirmado'::public.event_participation, 'e a vaga liberada serve para o próximo');
select tests.logout();

select tests.mk_evento('uma_apr', 'bia', 'aprovacao', 1);
select tests.poe('uma_apr', 'ana', 'pendente');
select tests.poe('uma_apr', 'caio', 'pendente');
select tests.login('bia');
select lives_ok(format($$ select public.responder_pedido(%L, %L, true) $$, tests.ev('uma_apr'), tests.uid('ana')), 'com aprovação: aceitar ocupa a vaga');
select throws_ok(format($$ select public.responder_pedido(%L, %L, true) $$, tests.ev('uma_apr'), tests.uid('caio')), 'PT409', 'Não há mais vagas neste evento.', 'aceitar além das vagas é recusado');
select throws_ok(
  format($$ select public.editar_evento(%L, 'Evento uma', '', now() + interval '3 days', null, 'presencial', 'no campus', null, null, 1) $$, tests.ev('aberto')),
  'PT400', 'Já há mais pessoas confirmadas do que essas vagas.', 'e as vagas não baixam para menos do que os confirmados'
);
select tests.logout();
select is(
  (select count(*) from public.events e join tests.eventos t on t.id = e.id
    where e.capacity is not null
      and e.capacity < (select count(*) from public.event_participants ep where ep.event_id = e.id and ep.status = 'confirmado')),
  0::bigint, 'nenhum evento ficou com mais confirmados do que vagas'
);

-- ---------------------------------------------------------------------------
-- Editar: mudança de data, local ou link avisa quem vai
-- ---------------------------------------------------------------------------
select tests.poe('apr', 'gil');
select tests.poe('apr', 'ana', 'pendente');
select tests.login('gil');
select throws_ok(
  format($$ select public.editar_evento(%L, 'Meu agora', '', now() + interval '3 days', null, 'online', null, null, 'https://golpe.example', null) $$, tests.ev('apr')),
  'PT404', 'Evento não encontrado.', 'participante não edita o evento'
);
select tests.login('bia');
select lives_ok(
  format($$ select public.editar_evento(%L, 'Sessão de estudo', 'nova descrição', (select inicio from public.evento(%L)), null, 'online', null, null, 'https://meet.example/apr', 10) $$,
         tests.ev('apr'), tests.ev('apr')),
  'quem organiza muda título, descrição e vagas'
);
select tests.logout();
select is(tests.avisos('gil', 'evento_alterado'), 0::bigint, 'mudar título, descrição ou vagas não avisa ninguém');
select tests.login('bia');
select lives_ok(
  format($$ select public.editar_evento(%L, 'Sessão de estudo', 'nova descrição', now() + interval '5 days', null, 'online', null, null, 'https://meet.example/novo', 10) $$, tests.ev('apr')),
  'depois muda a data e o link'
);
select tests.logout();
select is(tests.avisos('gil', 'evento_alterado', 'apr'), 1::bigint, 'quem vai é avisado');
select is(tests.avisos('ana', 'evento_alterado') + tests.avisos('bia', 'evento_alterado'), 0::bigint, 'quem só pediu e quem organiza, não');
select tests.login('bia');
select lives_ok(
  format($$ select public.editar_evento(%L, 'Sessão de estudo', '', now() + interval '6 days', null, 'presencial', 'centro', 'Rua A, 10', null, 10) $$, tests.ev('apr')),
  'muda de novo: agora presencial, com local'
);
select tests.logout();
select is(tests.avisos('gil', 'evento_alterado', 'apr'), 1::bigint, 'o aviso não lido é trocado pelo novo, em vez de empilhar');
select is(
  (select jsonb_build_object('geral', e.general_location, 'exato', d.exact_location, 'link', d.link, 'tipo', e.kind)
     from public.events e join public.event_details d on d.event_id = e.id where e.id = tests.ev('apr')),
  jsonb_build_object('geral', 'centro', 'exato', 'Rua A, 10', 'link', null, 'tipo', 'aprovacao'),
  'ao virar presencial o link some; o tipo do evento não muda'
);

-- ---------------------------------------------------------------------------
-- Cancelar
-- ---------------------------------------------------------------------------
select tests.login('gil');
select throws_ok(format($$ select public.cancelar_evento(%L) $$, tests.ev('apr')), 'PT404', null, 'participante não cancela o evento');
select tests.login('bia');
select lives_ok(format($$ select public.cancelar_evento(%L) $$, tests.ev('apr')), 'quem organiza cancela');
select throws_ok(format($$ select public.cancelar_evento(%L) $$, tests.ev('apr')), 'PT409', null, 'duas vezes não');
select throws_ok(
  format($$ select public.editar_evento(%L, 'Voltou', '', now() + interval '6 days', null, 'presencial', 'centro', null, null, 10) $$, tests.ev('apr')),
  'PT409', null, 'evento cancelado não se edita'
);
select tests.logout();
select is(
  (select jsonb_agg(jsonb_build_object('quem', u.alias, 'titulo', n.event_title, 'evento', n.event_id) order by u.alias)
     from public.notifications n join tests.users u on u.id = n.user_id where n.type = 'evento_cancelado'),
  jsonb_build_array(
    jsonb_build_object('quem', 'ana', 'titulo', 'Sessão de estudo', 'evento', tests.ev('apr')),
    jsonb_build_object('quem', 'gil', 'titulo', 'Sessão de estudo', 'evento', tests.ev('apr'))),
  'quem ia e quem tinha pedido são avisados do cancelamento, com o título'
);
select is(tests.avisos('gil', 'evento_alterado', 'apr'), 0::bigint, 'e os avisos anteriores sobre o evento saem');
select tests.login('gil');
select throws_ok(format($$ select public.participar_evento(%L) $$, tests.ev('apr')), 'PT409', null, 'ninguém entra em evento cancelado');
select is((select cancelado from public.meus_eventos() where id = tests.ev('apr')), true, 'quem ia continua vendo o evento, marcado como cancelado');
select tests.login('caio');
select is((select count(*) from public.evento(tests.ev('apr'))), 0::bigint, 'para quem não ia, o evento cancelado deixa de existir');
select is((select count(*) from public.eventos_proximos() where id = tests.ev('apr')), 0::bigint, 'e sai da lista');
select tests.logout();

-- ---------------------------------------------------------------------------
-- Lista, filtros, "meus eventos" e histórico
-- ---------------------------------------------------------------------------
-- 'passado' (do davi): acabou ontem; ana confirmada, caio pendente.
select tests.mk_evento('passado', 'davi', 'aprovacao', null, 'presencial', interval '-1 day');
select tests.poe('passado', 'ana');
select tests.poe('passado', 'caio', 'pendente');
insert into public.event_tags (event_id, tag_id) values (tests.ev('aberto'), tests.tag('t-rock')), (tests.ev('uma'), tests.tag('t-xadrez'));
select tests.login('ana');
select is(
  (select array_agg(id order by inicio, id) from public.eventos_proximos()),
  (select array_agg(e.id order by e.starts_at, e.id) from public.events e
    where e.cancelled_at is null and e.over_at > now() and e.institution_id = (select institution_id from public.profiles where id = tests.uid('ana'))),
  'a lista traz os próximos eventos da instituição, em ordem de data'
);
select is((select count(*) from public.eventos_proximos() where id = tests.ev('passado')), 0::bigint, 'evento que já acabou sai da lista');
select is(
  (select array_agg(titulo order by titulo) from public.eventos_proximos(true)),
  array['Evento aberto', 'Mesa de RPG'], 'filtro "com meus gostos": só eventos com alguma tag que a pessoa tem'
);
select is((select bool_and(modalidade = 'online') and count(*) = 1 from public.eventos_proximos(false, 'online')), true, 'filtro por modalidade: online');
select is((select bool_and(modalidade = 'presencial') and count(*) > 1 from public.eventos_proximos(false, 'presencial')), true, 'e presencial');
select is(
  (select jsonb_agg(jsonb_build_object('t', titulo, 's', meu_status, 'acabou', acabou) order by titulo) from public.meus_eventos()),
  jsonb_build_array(
    jsonb_build_object('t', 'Evento do_caio', 's', 'confirmado', 'acabou', false),
    jsonb_build_object('t', 'Evento passado', 's', 'confirmado', 'acabou', true),
    jsonb_build_object('t', 'Evento uma_apr', 's', 'confirmado', 'acabou', false),
    jsonb_build_object('t', 'Mesa de RPG', 's', 'organizo', 'acabou', false),
    jsonb_build_object('t', 'Sessão de estudo', 's', 'pendente', 'acabou', false),
    jsonb_build_object('t', 'Sessão online', 's', 'organizo', 'acabou', false)),
  '"meus eventos": os que organizo e os que vou, com o que já acabou marcado como histórico'
);
select is((select local_exato from public.evento(tests.ev('passado'))), 'Sala 12 do bloco C, passado', 'no histórico, quem foi continua vendo o evento');
select tests.login('caio');
select is((select count(*) from public.meus_eventos() where id = tests.ev('passado')), 0::bigint, 'pedido que ficou pendente não vira histórico');
select tests.login('eva');
select is((select count(*) from public.evento(tests.ev('passado'))), 0::bigint, 'e quem não foi não vê evento que já acabou');
select throws_ok(format($$ select public.participar_evento(%L) $$, tests.ev('passado')), 'PT404', null, 'nem entra nele');
select tests.logout();

-- ---------------------------------------------------------------------------
-- Limites: 5 eventos por dia, 30 pedidos ou confirmações por dia
-- ---------------------------------------------------------------------------
select tests.mk_user('rita');
select tests.login('rita');
select lives_ok(
  format($$ select public.criar_evento('Evento %s da rita', '', now() + interval '1 day', null, 'presencial', 'campus', null, null, 'aberto', null) $$, n),
  'evento ' || n || ' do dia'
) from generate_series(1, 5) n;
select throws_ok(
  $$ select public.criar_evento('Evento 6 da rita', '', now() + interval '1 day', null, 'presencial', 'campus', null, null, 'aberto', null) $$,
  'PT429', 'Limite de 5 eventos criados por dia atingido.', 'o sexto evento do dia é recusado'
);
select tests.logout();
select is((select count(*) from public.events where organizer_id = tests.uid('rita')), 5::bigint, 'e não foi criado');

select tests.mk_evento('lote' || n, 'bia') from generate_series(1, 31) n;
select tests.mk_user('rui');
select tests.login('rui');
select lives_ok(
  $$ do $do$ begin perform public.participar_evento(e.id) from tests.eventos e where e.nome ~ '^lote([1-9]|[12][0-9]|30)$'; end $do$ $$,
  'trinta confirmações no mesmo dia'
);
select throws_ok(format($$ select public.participar_evento(%L) $$, tests.ev('lote31')), 'PT429', 'Limite de 30 pedidos ou confirmações por dia atingido.', 'a trigésima primeira é recusada');
select lives_ok(format($$ select public.sair_do_evento(%L) $$, tests.ev('lote1')), 'desistir de um');
select throws_ok(format($$ select public.participar_evento(%L) $$, tests.ev('lote31')), 'PT429', null, 'não devolve cota');
select tests.logout();
select is((select count(*) from public.event_participants where user_id = tests.uid('rui')), 29::bigint, 'ficaram as 29 que sobraram');
delete from public.events where id in (select id from tests.eventos where nome like 'lote%');

-- ---------------------------------------------------------------------------
-- Denúncia: uma cópia do que era público, e só
-- ---------------------------------------------------------------------------
select tests.login('ana');
select lives_ok(format($$ select public.denunciar_evento(%L, 'spam', 'parece golpe') $$, tests.ev('aberto')), 'a ana denuncia um evento da bia');
select throws_ok(format($$ select public.denunciar_evento(%L, 'spam') $$, tests.ev('aberto')), 'PT409', null, 'uma vez só');
select throws_ok(format($$ select public.denunciar_evento(%L, 'spam') $$, tests.ev('mesa')), 'PT404', null, 'ninguém denuncia o próprio evento');
select throws_ok(
  format($$ insert into public.reports (event_id, event_organizer_id, event_title, reason) values (%L, %L, 'forjado', 'spam') $$, tests.ev('uma'), tests.uid('bia')),
  '42501', null, 'e a cópia não se forja direto na tabela'
);
select tests.logout();
select is(
  (select jsonb_build_object('quem', r.reporter_id, 'org', r.event_organizer_id, 'titulo', r.event_title, 'desc', r.event_description, 'geral', r.event_general_location)
     from public.reports r where r.event_id = tests.ev('aberto')),
  jsonb_build_object('quem', tests.uid('ana'), 'org', tests.uid('bia'), 'titulo', 'Evento aberto', 'desc', 'descrição de aberto', 'geral', 'no campus'),
  'a denúncia guarda a cópia do título, da descrição e do local geral'
);
select is(
  (select to_jsonb(r)::text ~ 'Sala 12|meet\.example|caio|fabi' from public.reports r where r.event_id = tests.ev('aberto')), false,
  'e nada do local exato, do link nem de quem vai'
);
select tests.login_mfa('moda');
select is((select event_title from public.reports where event_id = tests.ev('aberto')), 'Evento aberto', 'a moderação lê a cópia na fila');
select is((select count(*) from public.event_participants where event_id = tests.ev('aberto')), 0::bigint, 'e continua sem a lista de quem vai');

-- ---------------------------------------------------------------------------
-- Moderação oculta evento, com registro
-- ---------------------------------------------------------------------------
select tests.login('ana');
select throws_ok(format($$ select public.ocultar_evento(%L, 'não gostei') $$, tests.ev('aberto')), 'PT403', null, 'usuária comum não oculta evento');
select tests.login('moda');
select throws_ok(format($$ select public.ocultar_evento(%L, 'sem MFA') $$, tests.ev('aberto')), 'PT403', null, 'moderação sem o segundo fator também não');
select tests.login_mfa('moda');
select throws_ok(format($$ select public.ocultar_evento(%L, '') $$, tests.ev('aberto')), 'PT400', null, 'sem motivo não oculta');
select lives_ok(format($$ select public.ocultar_evento(%L, 'divulgação de golpe') $$, tests.ev('aberto')), 'moderação oculta o evento');
select throws_ok(format($$ select public.ocultar_evento(%L, 'de novo') $$, tests.ev('aberto')), 'PT409', null, 'duas vezes não');
select tests.logout();
select is(
  (select jsonb_build_object('ator', actor_id, 'alvo', target_user_id, 'motivo', reason, 'meta', metadata)
     from public.moderation_actions where action = 'ocultar_evento' and target_user_id = tests.uid('bia')),
  jsonb_build_object('ator', tests.uid('moda'), 'alvo', tests.uid('bia'), 'motivo', 'divulgação de golpe',
                     'meta', jsonb_build_object('evento', tests.ev('aberto'), 'titulo', 'Evento aberto')),
  'fica em moderation_actions, com quem ocultou, de quem era e por quê'
);
select is(
  (select count(*) from public.notifications n where n.type = 'evento_cancelado' and n.event_title = 'Evento aberto' and n.event_id is null
     and n.user_id in (tests.uid('caio'), tests.uid('fabi'))),
  2::bigint, 'quem ia é avisado de que o evento foi cancelado'
);
select tests.login('caio');
select is((select count(*) from public.evento(tests.ev('aberto'))), 0::bigint, 'o evento oculto some até para quem ia');
select is((select count(*) from public.event_details where event_id = tests.ev('aberto')), 0::bigint, 'com o local exato');
select tests.login('bia');
select is((select oculto from public.evento(tests.ev('aberto'))), true, 'quem organiza vê que foi ocultado');
select tests.logout();
select tests.mk_evento('da_admin', 'adma');
select tests.login_mfa('moda');
select throws_ok(format($$ select public.ocultar_evento(%L, 'não gostei') $$, tests.ev('da_admin')), 'PT403', 'Só a administração age sobre quem é da equipe.', 'moderação não oculta evento de quem é da equipe');
select tests.logout();

-- ---------------------------------------------------------------------------
-- Lembrete de duas horas
-- ---------------------------------------------------------------------------
select tests.mk_evento('logo', 'caio', 'aprovacao', null, 'presencial', interval '90 minutes');
select tests.mk_evento('longe', 'caio', 'aberto', null, 'presencial', interval '5 hours');
select tests.poe('logo', 'ana');
select tests.poe('logo', 'eva', 'pendente');
select tests.poe('longe', 'ana');
select private.tarefas_de_eventos();
select is(
  (select array_agg(u.alias order by u.alias) from public.notifications n join tests.users u on u.id = n.user_id where n.type = 'evento_lembrete'),
  array['ana', 'caio'], 'o lembrete sai para quem vai (confirmada e quem organiza) ao evento que começa em menos de duas horas'
);
select is(tests.avisos('eva', 'evento_lembrete'), 0::bigint, 'quem só pediu não recebe');
select is(tests.avisos('ana', 'evento_lembrete', 'longe'), 0::bigint, 'nem quem vai a um evento que ainda está longe');
select private.tarefas_de_eventos();
select is((select count(*) from public.notifications n join tests.users u on u.id = n.user_id where n.type = 'evento_lembrete'), 2::bigint, 'rodar de novo não repete o lembrete');
select tests.login('ana');
select throws_ok($$ select private.tarefas_de_eventos() $$, '42501', null, 'ninguém dispara o lembrete pela API');
select tests.logout();
select is(
  (select array_agg(private.quer_push(tests.uid('ana'), t) order by t) from unnest(array['evento_pedido', 'evento_aceito', 'evento_alterado', 'evento_cancelado', 'evento_lembrete']) t),
  array[false, false, false, false, false], 'sem escolher, nenhum aviso de evento vira push'
);
insert into public.push_preferences (user_id, evento) values (tests.uid('ana'), true);
select is(
  (select array_agg(private.quer_push(tests.uid('ana'), t) order by t) from unnest(array['evento_pedido', 'evento_aceito', 'evento_alterado', 'evento_cancelado', 'evento_lembrete']) t),
  array[true, true, true, true, true], 'com a opção ligada, todos os cinco viram'
);

-- ---------------------------------------------------------------------------
-- Conquistas: Argonauta e Dionísio
-- ---------------------------------------------------------------------------
select is(tests.tem('ana', 'argonauta'), true, 'a ana estava confirmada num evento que acabou (o do davi): Argonauta');
select is(tests.tem('caio', 'argonauta'), false, 'o caio só tinha pedido: não');
select is(tests.tem('davi', 'argonauta') or tests.tem('davi', 'dionisio'), false, 'quem organizou com uma pessoa só não ganha nenhuma das duas');
-- 'cheio': aconteceu com três confirmados. 'cancelado' e 'ocultado' também tinham três.
select tests.mk_evento(n, 'gil', 'aberto', null, 'presencial', interval '-1 day') from unnest(array['cheio', 'cancelado3', 'oculto3']) n;
select tests.poe(n, a) from unnest(array['cheio', 'cancelado3', 'oculto3']) n, unnest(array['bia', 'caio', 'eva']) a;
update public.events set cancelled_at = now() - interval '2 days' where id = tests.ev('cancelado3');
update public.events set hidden_at = now() - interval '2 days' where id = tests.ev('oculto3');
select tests.mk_evento('futuro3', 'fabi');
select tests.poe('futuro3', a) from unnest(array['bia', 'caio', 'eva']) a;
select private.tarefas_de_eventos();
select is(tests.tem('gil', 'dionisio'), true, 'organizou um evento que aconteceu com três confirmados: Dionísio');
select is(array[tests.tem('bia', 'argonauta'), tests.tem('caio', 'argonauta'), tests.tem('eva', 'argonauta')], array[true, true, true], 'e os três ganham o Argonauta');
select is(tests.tem('gil', 'argonauta'), false, 'quem organiza não é "confirmado" no próprio evento');
select is(tests.tem('fabi', 'dionisio'), false, 'evento que ainda não aconteceu não conta');
delete from public.user_achievements where achievement_slug in ('argonauta', 'dionisio') and user_id in (select id from tests.users);
update public.events set settled_at = null where id in (tests.ev('cancelado3'), tests.ev('oculto3'));
select private.tarefas_de_eventos();
select is(
  (select count(*) from public.user_achievements ua join tests.users u on u.id = ua.user_id where ua.achievement_slug in ('argonauta', 'dionisio')), 0::bigint,
  'evento cancelado ou ocultado não "aconteceu": nenhuma conquista'
);
select tests.login('ana');
select throws_ok(
  format($$ insert into public.user_achievements (user_id, achievement_slug) values (auth.uid(), %L) $$, s), '42501', null,
  s || ': ninguém se dá pela API'
) from unnest(array['argonauta', 'dionisio']) s;
select throws_ok($$ update public.events set settled_at = null, over_at = now() - interval '1 hour' $$, '42501', null, 'nem faz um evento "ter acontecido"');
select tests.logout();

-- ---------------------------------------------------------------------------
-- Banimento
-- ---------------------------------------------------------------------------
select tests.mk_evento('do_davi', 'davi', 'aberto', 2);
select tests.poe('do_davi', 'ana');
select tests.poe('do_davi', 'eva', 'pendente');
select tests.poe('uma', 'davi', 'recusado');
select tests.poe('do_caio', 'davi');
select tests.login_mfa('moda');
select lives_ok(format($$ select public.banir_usuario(%L, 'assédio') $$, tests.uid('davi')), 'a moderação bane o davi');
select tests.login('fabi');
select is((select count(*) from public.eventos_proximos() where organizador_id = tests.uid('davi')), 0::bigint, 'os eventos de quem foi banido somem');
select tests.login('caio');
select is(tests.lista('do_caio') @> array['davi'], false, 'e ele some da lista dos eventos em que ia');
select tests.logout();
select is(tests.status('do_caio', 'davi'), null, 'a participação dele sai, liberando a vaga');
select is(
  (select array_agg(u.alias order by u.alias) from public.notifications n join tests.users u on u.id = n.user_id
    where n.type = 'evento_cancelado' and n.event_title = 'Evento do_davi'),
  array['ana', 'eva'], 'e quem ia ao evento dele é avisado do cancelamento'
);

-- ---------------------------------------------------------------------------
-- Exclusão de conta
-- ---------------------------------------------------------------------------
select tests.mk_evento('da_fabi', 'fabi', 'aprovacao', 3);
select tests.poe('da_fabi', 'ana');
select tests.poe('da_fabi', 'eva', 'pendente');
select tests.poe('da_fabi', 'gil', 'recusado');
select tests.poe('do_caio', 'fabi');
select tests.poe('futuro3', 'gil', 'pendente');
delete from public.notifications where type = 'evento_cancelado' and user_id in (select id from tests.users);
select lives_ok(format($$ delete from auth.users where id = %L $$, tests.uid('fabi')), 'a fabi exclui a conta');
select is((select count(*) from public.events where id in (tests.ev('da_fabi'), tests.ev('futuro3'))), 0::bigint, 'os eventos que ela organizava deixam de existir');
select is(
  (select jsonb_agg(jsonb_build_object('quem', u.alias, 'titulo', n.event_title, 'evento', n.event_id) order by u.alias, n.event_title)
     from public.notifications n join tests.users u on u.id = n.user_id where n.type = 'evento_cancelado'),
  jsonb_build_array(
    jsonb_build_object('quem', 'ana', 'titulo', 'Evento da_fabi', 'evento', null),
    jsonb_build_object('quem', 'bia', 'titulo', 'Evento futuro3', 'evento', null),
    jsonb_build_object('quem', 'caio', 'titulo', 'Evento futuro3', 'evento', null),
    jsonb_build_object('quem', 'eva', 'titulo', 'Evento da_fabi', 'evento', null),
    jsonb_build_object('quem', 'eva', 'titulo', 'Evento futuro3', 'evento', null),
    jsonb_build_object('quem', 'gil', 'titulo', 'Evento futuro3', 'evento', null)),
  'quem ia (ou tinha pedido) é avisado, com o título; quem tinha sido recusado, não'
);
select is(
  (select count(*) from public.event_participants ep where not exists (select 1 from public.profiles p where p.id = ep.user_id)), 0::bigint,
  'e as participações dela em eventos dos outros saem'
);
select tests.login('ana');
select is(
  (select jsonb_build_object('evento', evento_id, 'titulo', evento_titulo) from public.minhas_notificacoes() where tipo = 'evento_cancelado'),
  jsonb_build_object('evento', null, 'titulo', 'Evento da_fabi'), 'na aba, o cancelamento aparece com o título e sem link para um evento que não existe mais'
);
select tests.logout();

select * from finish();
rollback;
