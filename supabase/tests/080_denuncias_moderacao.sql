-- =============================================================================
-- Denúncias, moderação, cargos e trilha de auditoria
-- =============================================================================
begin;
\ir _helpers.psql
select plan(40);

select tests.seed_world();
select tests.mk_post('bia', 'post problemático', interval '1 hour');
select tests.mk_post('moda', 'post do moderador', interval '1 hour');

create function tests.post_bia() returns uuid language sql stable security definer set search_path = '' as
  $$ select id from public.posts where body = 'post problemático' $$;
grant execute on function tests.post_bia() to authenticated;

-- ---------------------------------------------------------------------------
-- Criar denúncia
-- ---------------------------------------------------------------------------
select tests.login('ana');
select lives_ok(
  format($$ insert into public.reports (post_id, reason, details) values (%L, 'assedio', 'detalhe') $$, tests.post_bia()),
  'usuária ativa denuncia um post'
);
select lives_ok(
  format($$ insert into public.reports (profile_id, reason) values (%L, 'perfil_falso') $$, tests.uid('caio')),
  'usuária ativa denuncia um perfil'
);
select throws_ok(
  format($$ insert into public.reports (post_id, reason) values (%L, 'spam') $$, tests.post_bia()),
  '23505', null, 'a mesma pessoa não denuncia o mesmo alvo duas vezes'
);
select throws_ok(
  format($$ insert into public.reports (reporter_id, profile_id, reason) values (%L, %L, 'spam') $$,
         tests.uid('davi'), tests.uid('bia')),
  '42501', null, 'não dá para denunciar em nome de outra pessoa'
);
select throws_ok(
  format($$ insert into public.reports (profile_id, reason, status) values (%L, 'spam', 'resolvida') $$, tests.uid('bia')),
  '42501', null, 'não dá para criar denúncia já resolvida'
);
select throws_ok(
  $$ insert into public.reports (reason) values ('spam') $$,
  null, null, 'denúncia sem alvo é recusada'
);
select throws_ok(
  $$ insert into public.reports (profile_id, reason) values (auth.uid(), 'spam') $$,
  null, null, 'não dá para denunciar a si mesma'
);

-- ---------------------------------------------------------------------------
-- Ler denúncias
-- ---------------------------------------------------------------------------
select is((select count(*) from public.reports), 0::bigint, 'quem denunciou não lê a tabela de denúncias');
select is(
  (select count(*) from public.minhas_denuncias()), 2::bigint,
  'quem denunciou acompanha as PRÓPRIAS pela RPC'
);

select tests.login('caio');
select is((select count(*) from public.reports), 0::bigint, 'usuário comum não lê denúncias (nem as contra ele)');
select is((select count(*) from public.minhas_denuncias()), 0::bigint, 'a RPC não mostra denúncias dos outros');

select tests.login('moda');
select is((select count(*) from public.reports), 2::bigint, 'staff da mesma instituição lê as denúncias');

select tests.login('modb');
select is((select count(*) from public.reports), 0::bigint, 'staff de OUTRA instituição não lê');

-- ---------------------------------------------------------------------------
-- Resolver denúncia
-- ---------------------------------------------------------------------------
select tests.logout();
create function tests.report_post() returns uuid language sql stable security definer set search_path = '' as
  $$ select id from public.reports where post_id is not null $$;
grant execute on function tests.report_post() to authenticated;

select tests.login('ana');
select throws_ok(
  format($$ select public.resolver_denuncia(%L, 'resolvida', 'eu mesma resolvo') $$, tests.report_post()),
  'PT403', null, 'usuária comum não resolve denúncia'
);
select throws_ok(
  format($$ update public.reports set status = 'rejeitada' where id = %L $$, tests.report_post()),
  '42501', null, 'ninguém altera denúncia direto na tabela'
);

select tests.login('modb');
select throws_ok(
  format($$ select public.resolver_denuncia(%L, 'rejeitada', 'cruzando instituição') $$, tests.report_post()),
  'PT403', null, 'staff de outra instituição não resolve'
);

-- user_metadata / app_metadata no JWT não valem nada para autorização
select tests.login('ana', '{"user_metadata": {"role": "admin", "is_staff": true}, "app_metadata": {"role": "admin"}}');
select throws_ok(
  format($$ select public.resolver_denuncia(%L, 'resolvida', 'sou admin no metadata') $$, tests.report_post()),
  'PT403', null, 'dizer que é admin no user_metadata não dá poder nenhum'
);
select is((select count(*) from public.reports), 0::bigint, '...nem acesso de leitura');

select tests.login('moda');
select throws_ok(
  format($$ select public.resolver_denuncia(%L, 'resolvida', '  ') $$, tests.report_post()),
  'PT400', null, 'resolver exige justificativa'
);
select lives_ok(
  format($$ select public.resolver_denuncia(%L, 'resolvida', 'post ocultado') $$, tests.report_post()),
  'staff da instituição resolve'
);
select is(
  (select status::text || ':' || (resolved_by = auth.uid())::text || ':' || (resolved_at is not null)::text
   from public.reports where id = tests.report_post()),
  'resolvida:true:true',
  'a denúncia registra status, quem resolveu e quando'
);

-- ---------------------------------------------------------------------------
-- Ocultar post
-- ---------------------------------------------------------------------------
select tests.login('ana');
select throws_ok(
  format($$ select public.ocultar_post(%L, 'não gostei') $$, tests.post_bia()),
  'PT403', null, 'usuária comum não oculta post'
);

select tests.login('moda');
select lives_ok(
  format($$ select public.ocultar_post(%L, 'assédio confirmado') $$, tests.post_bia()),
  'moderador oculta o post'
);
select is(
  (select count(*) from public.posts where id = tests.post_bia()), 1::bigint,
  'staff continua vendo o post oculto'
);

select tests.login('ana');
select is(
  (select count(*) from public.posts where id = tests.post_bia()), 0::bigint,
  'post oculto some para os usuários'
);
select tests.login('bia');
select is(
  (select count(*) from public.posts where id = tests.post_bia()), 0::bigint,
  'post oculto some até para a autora (e ela não consegue reexibir)'
);

-- ---------------------------------------------------------------------------
-- moderation_actions: toda ação fica registrada; ninguém escreve direto
-- ---------------------------------------------------------------------------
select tests.login('moda');
select results_eq(
  $$ select action::text, actor_id, reason from public.moderation_actions order by id $$,
  format($$ values ('resolver_denuncia', %L::uuid, 'post ocultado'),
                   ('ocultar_post', %L::uuid, 'assédio confirmado') $$, tests.uid('moda'), tests.uid('moda')),
  'cada ação de moderação ficou registrada com quem fez e por quê'
);

select tests.login('ana');
select is((select count(*) from public.moderation_actions), 0::bigint, 'usuária comum não lê a trilha de auditoria');
select tests.login('modb');
select is((select count(*) from public.moderation_actions), 0::bigint, 'staff de outra instituição não lê a trilha');

select tests.login('adma');
select throws_ok(
  format($$ insert into public.moderation_actions (institution_id, actor_id, action, reason)
            select institution_id, id, 'banir_usuario', 'registro forjado' from public.profiles where id = %L $$,
         tests.uid('adma')),
  '42501', null, 'nem admin insere direto na trilha de auditoria'
);
select throws_ok(
  $$ delete from public.moderation_actions $$, '42501', null,
  'nem admin apaga a trilha de auditoria'
);

-- ---------------------------------------------------------------------------
-- staff_roles: só admin, só pela RPC, só na própria instituição
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$ insert into public.staff_roles (user_id, institution_id, role)
            select id, institution_id, 'admin' from public.profiles where id = %L $$, tests.uid('caio')),
  '42501', null, 'nem admin escreve direto em staff_roles'
);

select tests.login('ana');
select throws_ok(
  $$ select public.definir_cargo(auth.uid(), 'admin', 'autopromoção') $$,
  'PT403', null, 'usuária comum não se promove'
);
select tests.login('moda');
select throws_ok(
  format($$ select public.definir_cargo(%L, 'moderador', 'moderador nomeando') $$, tests.uid('caio')),
  'PT403', null, 'moderador não concede cargo (só admin)'
);

select tests.login('adma');
select throws_ok(
  format($$ select public.definir_cargo(%L, 'moderador', 'outra instituição') $$, tests.uid('zeca')),
  'PT403', null, 'admin não concede cargo em outra instituição'
);
select throws_ok(
  $$ select public.definir_cargo(auth.uid(), 'moderador', 'mexendo no próprio cargo') $$,
  'PT400', null, 'admin não altera o próprio cargo'
);
select lives_ok(
  format($$ select public.definir_cargo(%L, 'moderador', 'novo moderador do beta') $$, tests.uid('caio')),
  'admin concede cargo'
);
select is(
  (select count(*) from public.moderation_actions
   where action = 'conceder_cargo' and target_user_id = tests.uid('caio') and actor_id = auth.uid()),
  1::bigint, 'a concessão de cargo ficou registrada'
);

-- o cargo é o "título" do perfil: colegas leem
select tests.login('ana');
select is(
  (select role::text from public.staff_roles where user_id = tests.uid('caio')), 'moderador',
  'colegas da instituição veem o cargo (título do perfil)'
);

select tests.login('adma');
select lives_ok(
  format($$ select public.remover_cargo(%L, 'fim do período') $$, tests.uid('caio')),
  'admin remove cargo'
);

select * from finish();
rollback;
