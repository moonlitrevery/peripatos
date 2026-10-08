-- =============================================================================
-- Cargos: o que a moderação pode, o que só a administração pode, e as proteções
-- =============================================================================
-- Instituição A: ana, bia, caio, davi (comuns), moda e modc (moderação), adma
-- (a única admin). Instituição B: zeca (comum), modb (moderação).
-- =============================================================================
begin;
\ir _helpers.psql
select plan(120);

select tests.seed_world();
select tests.mk_user('modc');
insert into public.staff_roles (user_id, institution_id, role)
select p.id, p.institution_id, 'moderador' from public.profiles p where p.id = tests.uid('modc');

-- O banco pode ter dados de outras instituições (o seed, os testes de ponta a
-- ponta): tudo o que é conferido sem RLS olha só para as instituições daqui.
create view tests.ma as
  select m.* from public.moderation_actions m
  where m.institution_id in (select p.institution_id from public.profiles p join tests.users u on u.id = p.id);
create table tests.coisas (nome text primary key, id uuid not null);
grant select on tests.coisas to authenticated;
create function tests.coisa(p_nome text) returns uuid language sql stable security definer set search_path = '' as
  $$ select c.id from tests.coisas c where c.nome = p_nome $$;
create function tests.cargo(p_alias text) returns text language sql stable security definer set search_path = '' as
  $$ select s.role::text from public.staff_roles s where s.user_id = tests.uid(p_alias) $$;
create function tests.acoes(p_acao text) returns bigint language sql stable security definer set search_path = '' as
  $$ select count(*) from tests.ma m where m.action::text = p_acao $$;
create function tests.oculto(p_nome text) returns boolean language sql stable security definer set search_path = '' as
  $$ select p.hidden_at is not null from public.posts p where p.id = tests.coisa(p_nome) $$;
create function tests.foto(p_alias text) returns text language sql stable security definer set search_path = '' as
  $$ select p.avatar_status::text from public.profiles p where p.id = tests.uid(p_alias) $$;
create function tests.banido(p_alias text) returns boolean language sql stable security definer set search_path = '' as
  $$ select p.banned_at is not null from public.profiles p where p.id = tests.uid(p_alias) $$;
grant execute on function tests.coisa(text), tests.cargo(text), tests.acoes(text), tests.oculto(text), tests.foto(text), tests.banido(text) to authenticated;

insert into tests.coisas values
  ('post_bia', tests.mk_post('bia', 'post de usuária comum')),
  ('post_modc', tests.mk_post('modc', 'post de moderador')),
  ('post_adma', tests.mk_post('adma', 'post da admin')),
  ('oculto_modc', tests.mk_post('modc', 'post de moderador que a admin ocultou'));
update public.posts set hidden_at = now(), hidden_by = tests.uid('adma') where id = tests.coisa('oculto_modc');
update public.profiles set avatar_path = id::text || '/foto.webp', avatar_status = 'pendente'
 where id in (tests.uid('bia'), tests.uid('caio'), tests.uid('moda'), tests.uid('modc'), tests.uid('adma'));

-- denúncias da ana: contra um usuário comum, um moderador e um post da admin
insert into public.reports (reporter_id, institution_id, profile_id, reason)
select p.id, p.institution_id, tests.uid(alvo), 'spam'
from public.profiles p, unnest(array['caio', 'modc']) alvo where p.id = tests.uid('ana');
insert into public.reports (reporter_id, institution_id, post_id, reason)
select p.id, p.institution_id, tests.coisa('post_adma'), 'spam' from public.profiles p where p.id = tests.uid('ana');
insert into tests.coisas
select 'den_' || coalesce((select u.alias from tests.users u where u.id = r.profile_id), 'post_adma'), r.id
from public.reports r where r.reporter_id = tests.uid('ana');
insert into public.tag_requests (user_id, institution_id, name)
select p.id, p.institution_id, 'Capoeira' from public.profiles p where p.id = tests.uid('ana');
insert into tests.coisas select 'pedido', id from public.tag_requests where user_id = tests.uid('ana');

-- ---------------------------------------------------------------------------
-- MODERAÇÃO: o que pode
-- ---------------------------------------------------------------------------
select tests.login_mfa('moda');
select is((select count(*) from public.reports), 3::bigint, 'moderação lê a fila de denúncias da instituição');
select lives_ok(format($$ select public.ocultar_post(%L, 'fora das regras') $$, tests.coisa('post_bia')), 'moderação oculta post de usuário comum');
select lives_ok(format($$ select public.restaurar_post(%L, 'engano meu') $$, tests.coisa('post_bia')), 'e restaura');
select lives_ok(format($$ select public.moderar_avatar(%L, true, 'foto ok') $$, tests.uid('bia')), 'moderação aprova avatar');
select lives_ok(format($$ select public.moderar_avatar(%L, false, 'não é uma pessoa') $$, tests.uid('caio')), 'e recusa');
select lives_ok(format($$ select public.resolver_denuncia(%L, 'rejeitada', 'não procede') $$, tests.coisa('den_caio')), 'moderação resolve denúncia contra usuário comum');
select lives_ok(format($$ select public.banir_usuario(%L, 'spam em massa') $$, tests.uid('davi')), 'moderação bane usuário comum');

-- ---------------------------------------------------------------------------
-- MODERAÇÃO não age sobre a equipe
-- ---------------------------------------------------------------------------
select throws_ok(format($$ select public.banir_usuario(%L, 'briga interna') $$, tests.uid(a)), 'PT403',
  'Só a administração age sobre quem é da equipe.', 'moderador não bane ' || a)
from unnest(array['modc', 'adma']) a;
select throws_ok(format($$ select public.ocultar_post(%L, 'não gostei') $$, tests.coisa(c)), 'PT403',
  'Só a administração age sobre quem é da equipe.', 'moderador não oculta ' || c)
from unnest(array['post_modc', 'post_adma']) c;
select throws_ok(format($$ select public.restaurar_post(%L, 'ajudando o colega') $$, tests.coisa('oculto_modc')), 'PT403',
  'Só a administração age sobre quem é da equipe.', 'nem restaura post de moderador que a admin ocultou');
select throws_ok(format($$ select public.moderar_avatar(%L, false, 'não gostei') $$, tests.uid(a)), 'PT403',
  'Só a administração age sobre quem é da equipe.', 'moderador não recusa a foto de ' || a)
from unnest(array['modc', 'adma']) a;
select throws_ok(format($$ select public.moderar_avatar(%L, true, 'colega') $$, tests.uid('modc')), 'PT403',
  'Só a administração age sobre quem é da equipe.', 'nem aprova a foto de outro moderador');
select throws_ok($$ select public.moderar_avatar(auth.uid(), true, 'a minha está ótima') $$, 'PT403',
  'Você não pode moderar a própria foto.', 'ninguém aprova a própria foto');
select throws_ok(format($$ select public.resolver_denuncia(%L, 'rejeitada', 'é meu colega') $$, tests.coisa(c)), 'PT403',
  'Só a administração age sobre quem é da equipe.', 'moderador não resolve ' || c)
from unnest(array['den_modc', 'den_post_adma']) c;
select tests.logout();
select is(tests.banido('modc') or tests.banido('adma'), false, 'ninguém da equipe foi banido');
select is(tests.oculto('post_modc') or tests.oculto('post_adma'), false, 'nenhum post da equipe foi ocultado');
select is(tests.oculto('oculto_modc'), true, 'e o que a admin ocultou continua oculto');
select is(array[tests.foto('moda'), tests.foto('modc'), tests.foto('adma')], array['pendente', 'pendente', 'pendente'], 'as fotos da equipe continuam pendentes');
select is(
  (select count(*) from public.reports r where r.status = 'aberta' and r.reporter_id = tests.uid('ana')), 2::bigint,
  'e as duas denúncias contra a equipe continuam abertas'
);

-- ---------------------------------------------------------------------------
-- MODERAÇÃO não faz o que é da administração
-- ---------------------------------------------------------------------------
select tests.login_mfa('moda');
select throws_ok(format($$ select public.definir_cargo(%L, 'moderador', 'é gente boa') $$, tests.uid('ana')), 'PT403', null, 'moderador não nomeia');
select throws_ok(format($$ select public.remover_cargo(%L, 'não gosto dele') $$, tests.uid('modc')), 'PT403', null, 'nem remove');
select throws_ok($$ select public.definir_cargo(auth.uid(), 'admin', 'eu mereço') $$, 'PT403', null, 'nem se promove a admin');
select throws_ok(format($$ select public.resolver_pedido_tag(%L, true, 'boa') $$, tests.coisa('pedido')), 'PT403', null, 'nem aprova pedido de tag');
select throws_ok(format($$ select public.conceder_conquista(%L, %L, 'mereceu') $$, tests.uid('ana'), c), 'PT403', null, 'nem concede ' || c)
from unnest(array['heracles', 'hefesto']) c;
select throws_ok(format($$ select public.desbanir_usuario(%L, 'pediu desculpas') $$, tests.uid('davi')), 'PT403', null, 'nem desbane');
select throws_ok($$ select * from public.configuracoes() $$, 'PT403', null, 'nem lê as configurações');
select throws_ok(format($$ select public.definir_configuracao(%L, now(), 'porque sim') $$, c), 'PT403', null, 'nem muda ' || c)
from unnest(array['fundador_ate', 'panateneia_inicio', 'panateneia_fim']) c;
select throws_ok(
  format($$ insert into public.staff_roles (user_id, institution_id, role) select %L, institution_id, 'moderador' from public.profiles where id = %L $$,
         tests.uid('ana'), tests.uid('ana')),
  '42501', null, 'nem escreve direto em staff_roles'
);
select throws_ok($$ update public.staff_roles set role = 'admin' $$, '42501', null, 'nem troca o próprio cargo na tabela');
select throws_ok($$ delete from public.staff_roles $$, '42501', null, 'nem apaga cargo');
select throws_ok($$ insert into private.config (chave, valor) values ('fundador_ate', now()::text) $$, '42501', null, 'nem escreve a configuração direto');

-- usuária comum: nada disso
select tests.login('ana');
select throws_ok(format($$ select public.ocultar_post(%L, 'não gostei') $$, tests.coisa('post_bia')), 'PT403', null, 'usuária comum não oculta post');
select throws_ok(format($$ select public.banir_usuario(%L, 'não gostei') $$, tests.uid('bia')), 'PT403', null, 'nem bane');
select throws_ok(format($$ select public.moderar_avatar(%L, true, 'bonita') $$, tests.uid('modc')), 'PT403', null, 'nem modera avatar');
select throws_ok(format($$ select public.definir_cargo(%L, 'moderador', 'quero ajudar') $$, tests.uid('ana')), 'PT403', null, 'nem se nomeia');
select throws_ok($$ select public.definir_configuracao('fundador_ate', now(), 'quero') $$, 'PT403', null, 'nem muda configuração');
select is((select count(*) from public.reports where reporter_id <> auth.uid()), 0::bigint, 'nem lê a fila');
select tests.logout();
select is(tests.acoes('conceder_cargo') + tests.acoes('remover_cargo') + tests.acoes('alterar_configuracao'), 0::bigint,
  'nenhuma das tentativas mudou cargo ou configuração');
select is((select count(*) from private.config where chave in ('fundador_ate', 'panateneia_inicio', 'panateneia_fim')), 0::bigint, 'nem deixou configuração gravada');

-- ---------------------------------------------------------------------------
-- ADMINISTRAÇÃO: tudo da moderação, inclusive sobre a equipe
-- ---------------------------------------------------------------------------
select tests.login_mfa('adma');
select lives_ok(format($$ select public.ocultar_post(%L, 'fora das regras') $$, tests.coisa('post_modc')), 'admin oculta post de moderador');
select lives_ok(format($$ select public.restaurar_post(%L, 'revisto') $$, tests.coisa('oculto_modc')), 'e restaura');
select lives_ok(format($$ select public.moderar_avatar(%L, false, 'não é uma pessoa') $$, tests.uid('modc')), 'admin recusa foto de moderador');
select lives_ok(format($$ select public.moderar_avatar(%L, true, 'foto ok') $$, tests.uid('moda')), 'e aprova');
select throws_ok($$ select public.moderar_avatar(auth.uid(), true, 'a minha') $$, 'PT403', null, 'mas nem a admin aprova a própria foto');
select lives_ok(format($$ select public.resolver_denuncia(%L, 'resolvida', 'conversei com ele') $$, tests.coisa('den_modc')), 'admin resolve denúncia contra moderador');
select lives_ok(format($$ select public.resolver_pedido_tag(%L, true, 'boa ideia') $$, tests.coisa('pedido')), 'admin aprova pedido de tag');
select lives_ok(format($$ select public.conceder_conquista(%L, 'heracles', 'achou um bug') $$, tests.uid('ana')), 'admin concede Héracles');
select lives_ok(format($$ select public.conceder_conquista(%L, 'hefesto', 'sugeriu a seção Equipe') $$, tests.uid('ana')), 'e Hefesto');
select lives_ok(format($$ select public.desbanir_usuario(%L, 'recurso aceito') $$, tests.uid('davi')), 'admin desbane');

-- ---------------------------------------------------------------------------
-- Nomear: registro, notificação e o segundo fator de quem acabou de entrar
-- ---------------------------------------------------------------------------
select throws_ok(format($$ select public.definir_cargo(%L, 'moderador', '') $$, tests.uid('ana')), 'PT400', null, 'sem motivo não nomeia');
select throws_ok(format($$ select public.definir_cargo(%L, 'moderador', 'vizinho') $$, tests.uid('zeca')), 'PT403', null, 'nem alguém de outra instituição');
select throws_ok(format($$ select public.remover_cargo(%L, 'vizinho') $$, tests.uid('modb')), 'PT403', null, 'nem remove moderador de outra instituição');
select throws_ok(format($$ select public.definir_cargo(%L, 'moderador', 'ainda não entrou') $$, tests.uid('novo')), 'PT400', null, 'nem conta sem onboarding');
select lives_ok(format($$ select public.definir_cargo(%L, 'moderador', 'ajuda muito na comunidade') $$, tests.uid('ana')), 'admin nomeia a ana como moderação');
select throws_ok(format($$ select public.definir_cargo(%L, 'moderador', 'de novo') $$, tests.uid('ana')), 'PT409', 'Esta pessoa já tem este cargo.', 'nomear para o mesmo cargo não repete nada');
select tests.logout();
select is(tests.cargo('ana'), 'moderador', 'a ana tem o cargo');
select is(
  (select jsonb_agg(jsonb_build_object('ator', actor_id, 'alvo', target_user_id, 'motivo', reason, 'meta', metadata))
     from tests.ma where action = 'conceder_cargo'),
  jsonb_build_array(jsonb_build_object(
    'ator', tests.uid('adma'), 'alvo', tests.uid('ana'), 'motivo', 'ajuda muito na comunidade',
    'meta', jsonb_build_object('papel', 'moderador', 'papel_anterior', null))),
  'a nomeação ficou em moderation_actions, uma vez só, com quem fez, para quem e por quê'
);
select is(
  (select jsonb_agg(jsonb_build_object('tipo', n.type, 'ator', n.actor_id, 'lida', n.read_at is not null))
     from public.notifications n where n.user_id = tests.uid('ana') and n.type = 'cargo_concedido'),
  jsonb_build_array(jsonb_build_object('tipo', 'cargo_concedido', 'ator', null, 'lida', false)),
  'a pessoa nomeada recebe UMA notificação, que não diz quem nomeou'
);
select tests.login('ana');
select is((select count(*) from public.minhas_notificacoes() where tipo = 'cargo_concedido'), 1::bigint, 'e ela aparece na aba de notificações');
-- acabou de ser nomeada, sem o segundo fator: não age nem lê como equipe
select throws_ok(
  format($$ select public.ocultar_post(%L, 'primeiro dia') $$, tests.coisa('post_bia')), 'PT403',
  'Confirme a verificação em duas etapas para agir como moderação.', 'recém-nomeada sem MFA não age'
);
select is((select count(*) from public.reports where reporter_id <> auth.uid()), 0::bigint, 'nem lê a fila de denúncias');
select is((select count(*) from public.moderation_actions), 0::bigint, 'nem o registro de moderação');
select tests.login('ana', '{"aal": "aal2", "user_metadata": {"role": "admin"}}'::jsonb);
select lives_ok(format($$ select public.ocultar_post(%L, 'fora das regras') $$, tests.coisa('post_bia')), 'com o segundo fator confirmado, age');
select throws_ok(format($$ select public.remover_cargo(%L, 'agora mando eu') $$, tests.uid('moda')), 'PT403', null, 'como moderação, e só: metadata do token não dá cargo de admin');

-- remover
select tests.login_mfa('adma');
select throws_ok(format($$ select public.remover_cargo(%L, 'nunca teve') $$, tests.uid('bia')), 'PT409', null, 'remover cargo de quem não tem: recusado');
select lives_ok(format($$ select public.remover_cargo(%L, 'pediu para sair') $$, tests.uid('ana')), 'admin remove a ana da moderação');
select tests.logout();
select is(tests.cargo('ana'), null, 'a ana não tem mais cargo');
select is(
  (select jsonb_build_object('ator', actor_id, 'alvo', target_user_id, 'motivo', reason, 'meta', metadata)
     from tests.ma where action = 'remover_cargo'),
  jsonb_build_object('ator', tests.uid('adma'), 'alvo', tests.uid('ana'), 'motivo', 'pediu para sair', 'meta', jsonb_build_object('papel', 'moderador')),
  'a remoção também ficou registrada'
);
select tests.login_mfa('ana');
select throws_ok(format($$ select public.restaurar_post(%L, 'ainda posso?') $$, tests.coisa('post_bia')), 'PT403', null, 'sem o cargo, a ana não age mais');

-- ---------------------------------------------------------------------------
-- Ninguém altera o próprio cargo
-- ---------------------------------------------------------------------------
select tests.login_mfa('adma');
select throws_ok($$ select public.definir_cargo(auth.uid(), 'moderador', 'quero descer') $$, 'PT400', 'Você não pode alterar o próprio cargo.', 'admin não rebaixa a si mesma');
select throws_ok($$ select public.definir_cargo(auth.uid(), 'admin', 'reafirmando') $$, 'PT400', 'Você não pode alterar o próprio cargo.', 'nem se renomeia');
select throws_ok($$ select public.remover_cargo(auth.uid(), 'quero sair') $$, 'PT400', 'Você não pode alterar o próprio cargo.', 'nem se remove');
select tests.login('adma');
select throws_ok(format($$ select public.definir_cargo(%L, 'moderador', 'sem MFA') $$, tests.uid('bia')), 'PT403', null, 'admin sem o segundo fator não nomeia');
select throws_ok($$ select public.definir_configuracao('fundador_ate', now(), 'sem MFA') $$, 'PT403', null, 'nem muda configuração');
select tests.logout();

-- ---------------------------------------------------------------------------
-- O último admin
-- ---------------------------------------------------------------------------
select is((select count(*) from public.staff_roles where role = 'admin' and institution_id = (select institution_id from public.profiles where id = tests.uid('adma'))), 1::bigint, 'a instituição A tem uma admin só');
select throws_ok(format($$ delete from public.staff_roles where user_id = %L $$, tests.uid('adma')), 'PT409',
  'A instituição não pode ficar sem administração. Nomeie outra pessoa como admin antes.', 'o último admin não é removido, nem por SQL direto');
select throws_ok(format($$ update public.staff_roles set role = 'moderador' where user_id = %L $$, tests.uid('adma')), 'PT409', null, 'nem rebaixado');
select throws_ok(format($$ delete from auth.users where id = %L $$, tests.uid('adma')), 'PT409', null, 'nem some excluindo a conta');
select lives_ok(format($$ update public.staff_roles set granted_by = null where user_id = %L $$, tests.uid('adma')), 'mexer na linha sem tirar o cargo continua possível');
select lives_ok(format($$ delete from public.staff_roles where user_id = %L $$, tests.uid('modb')), 'remover um moderador não esbarra nisso (a instituição B nem tem admin)');

-- com dois admins, um remove ou rebaixa o outro
select tests.login_mfa('adma');
select lives_ok(format($$ select public.definir_cargo(%L, 'admin', 'vai dividir a administração') $$, tests.uid('caio')), 'a admin nomeia um segundo admin');
select tests.login_mfa('caio');
select lives_ok(format($$ select public.definir_cargo(%L, 'moderador', 'rodízio') $$, tests.uid('adma')), 'com dois admins, um rebaixa o outro');
select tests.logout();
select is(
  (select metadata from tests.ma where action = 'conceder_cargo' and target_user_id = tests.uid('adma')),
  jsonb_build_object('papel', 'moderador', 'papel_anterior', 'admin'), 'o rebaixamento ficou registrado, com o cargo anterior'
);
select is(array[tests.cargo('adma'), tests.cargo('caio')], array['moderador', 'admin'], 'agora o caio é o único admin');
select throws_ok(format($$ delete from public.staff_roles where user_id = %L $$, tests.uid('caio')), 'PT409', null, 'e passa a ser ele o protegido');
select tests.login_mfa('adma');
select throws_ok(format($$ select public.banir_usuario(%L, 'golpe') $$, tests.uid('caio')), 'PT403', null, 'a ex-admin, agora moderadora, não bane o admin');
select throws_ok(format($$ select public.remover_cargo(%L, 'golpe') $$, tests.uid('caio')), 'PT403', null, 'nem remove');

-- um admin em OUTRA instituição não conta
select tests.logout();
select tests.mk_user('admb', 'b.peripatos.test');
insert into public.staff_roles (user_id, institution_id, role)
select p.id, p.institution_id, 'admin' from public.profiles p where p.id = tests.uid('admb');
select throws_ok(format($$ delete from public.staff_roles where user_id = %L $$, tests.uid('caio')), 'PT409', null, 'admin de outra instituição não libera a remoção do último daqui');
select tests.login_mfa('admb');
select throws_ok(format($$ select public.remover_cargo(%L, 'vizinho') $$, tests.uid('caio')), 'PT403', null, 'e a admin da B não mexe na equipe da A');

-- banir um admin (só outro admin) tira o cargo e registra
select tests.login_mfa('caio');
select lives_ok(format($$ select public.definir_cargo(%L, 'admin', 'de volta') $$, tests.uid('adma')), 'o caio devolve o cargo de admin');
select tests.login_mfa('adma');
select lives_ok(format($$ select public.banir_usuario(%L, 'conduta grave') $$, tests.uid('caio')), 'com dois admins, um bane o outro');
select tests.logout();
select is(tests.cargo('caio'), null, 'o banido perde o cargo');
select is(
  (select jsonb_build_object('ator', actor_id, 'motivo', reason, 'meta', metadata)
     from tests.ma where action = 'remover_cargo' and target_user_id = tests.uid('caio')),
  jsonb_build_object('ator', tests.uid('adma'), 'motivo', 'conduta grave', 'meta', jsonb_build_object('papel', 'admin', 'por', 'banimento')),
  'e a perda do cargo pelo banimento também fica registrada'
);
select throws_ok(format($$ delete from auth.users where id = %L $$, tests.uid('adma')), 'PT409', null, 'a adma voltou a ser a última admin');
select is(
  tests.acoes('conceder_cargo') + tests.acoes('remover_cargo'),
  (select 4 + 2)::bigint,
  'toda mudança de cargo deixou registro: 4 nomeações ou trocas e 2 remoções'
);
select is(
  (select count(*) from tests.ma m where m.action in ('conceder_cargo', 'remover_cargo') and (m.actor_id is null or btrim(m.reason) = '')),
  0::bigint, 'todas com quem fez e por quê'
);

-- ---------------------------------------------------------------------------
-- Configurações
-- ---------------------------------------------------------------------------
select tests.login_mfa('adma');
select is(
  (select jsonb_agg(jsonb_build_object('chave', chave, 'valor', valor) order by chave) from public.configuracoes()),
  jsonb_build_array(
    jsonb_build_object('chave', 'fundador_ate', 'valor', null),
    jsonb_build_object('chave', 'panateneia_fim', 'valor', null),
    jsonb_build_object('chave', 'panateneia_inicio', 'valor', null)),
  'admin lê as três configurações, ainda vazias'
);
select throws_ok($$ select public.definir_configuracao('enigma_hash', now(), 'quero trocar o enigma') $$, 'PT400', 'Esta configuração não existe.', 'o hash do enigma não é configurável por aqui');
select throws_ok($$ select public.definir_configuracao('qualquer_coisa', now(), 'inventando') $$, 'PT400', null, 'nem chave inventada');
select throws_ok($$ select public.definir_configuracao('fundador_ate', now(), null) $$, 'PT400', null, 'sem motivo não muda');
select throws_ok($$ select public.definir_configuracao('fundador_ate', null, 'já está vazia') $$, 'PT409', null, 'apagar o que não existe: recusado');
select lives_ok($$ select public.definir_configuracao('fundador_ate', timestamptz '2027-03-01 00:00-03', 'fim do beta') $$, 'admin define o fim do beta');
select lives_ok($$ select public.definir_configuracao('panateneia_inicio', timestamptz '2027-03-01 00:00-03', 'semana de abertura') $$, 'e o início da Panateneia');
select throws_ok($$ select public.definir_configuracao('panateneia_fim', timestamptz '2027-02-20 00:00-03', 'errei a data') $$, 'PT400',
  'O fim da Panateneia precisa ser depois do início.', 'fim antes do início: recusado');
select lives_ok($$ select public.definir_configuracao('panateneia_fim', timestamptz '2027-03-08 00:00-03', 'semana de abertura') $$, 'e o fim, depois do início');
select is(
  (select array_agg(valor order by chave) from public.configuracoes()),
  array[timestamptz '2027-03-01 00:00-03', timestamptz '2027-03-08 00:00-03', timestamptz '2027-03-01 00:00-03'],
  'as três ficaram gravadas'
);
select lives_ok($$ select public.definir_configuracao('fundador_ate', null, 'beta reaberto') $$, 'valor nulo apaga a configuração');
select tests.logout();
select is((select array_agg(chave order by chave) from private.config where chave like 'panateneia%' or chave = 'fundador_ate'),
  array['panateneia_fim', 'panateneia_inicio'], 'no banco ficaram as duas da Panateneia');
select is(tests.acoes('alterar_configuracao'), 4::bigint, 'cada mudança aceita ficou em moderation_actions (as recusadas, não)');
select is(
  (select jsonb_build_object('ator', actor_id, 'motivo', reason, 'chave', metadata ->> 'chave', 'de', metadata -> 'de', 'tem_para', metadata ? 'para')
     from tests.ma where action = 'alterar_configuracao' order by id limit 1),
  jsonb_build_object('ator', tests.uid('adma'), 'motivo', 'fim do beta', 'chave', 'fundador_ate', 'de', null, 'tem_para', true),
  'com quem mudou, por quê, e o valor de antes e de depois'
);
-- a data vale de verdade: conta criada depois do fim do beta não é Fundador
select tests.login_mfa('adma');
select lives_ok($$ select public.definir_configuracao('fundador_ate', now() - interval '1 hour', 'beta encerrado') $$, 'fim do beta no passado');
select tests.logout();
select tests.mk_user('tardio');
select is(
  (select count(*) from public.user_achievements where user_id = tests.uid('tardio') and achievement_slug = 'fundador'), 0::bigint,
  'e a configuração gravada pela RPC é a que a conquista Fundador lê'
);
select tests.login_anon();
select throws_ok($$ select * from public.configuracoes() $$, '42501', null, 'anon não chama as RPCs de configuração');

select * from finish();
rollback;
