-- =============================================================================
-- META-TESTES: falham se alguém adicionar um objeto que fure as regras gerais.
-- =============================================================================
begin;
\ir _helpers.psql
select plan(19);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select c.oid::regclass::text
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'META: toda tabela de public tem RLS ativo'
);

select is_empty(
  $$ select c.oid::regclass::text
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relforcerowsecurity $$,
  'META: toda tabela de public tem RLS FORÇADO'
);

select is_empty(
  $$ select c.oid::regclass::text
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'private' and c.relkind in ('r', 'p')
       and not (c.relrowsecurity and c.relforcerowsecurity) $$,
  'META: tabelas de private também têm RLS forçado (defesa em profundidade)'
);

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select c.oid::regclass::text
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
       and not coalesce(
         (select o.option_value::boolean
          from pg_options_to_table(c.reloptions) o
          where o.option_name = 'security_invoker'), false) $$,
  'META: toda view de public usa security_invoker = true'
);

select is_empty(
  $$ select c.oid::regclass::text
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'm' $$,
  'META: não existe materialized view em public (elas ignoram RLS)'
);

-- ---------------------------------------------------------------------------
-- Funções security definer
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select p.oid::regprocedure::text
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prosecdef
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') $$,
  'META: toda função security definer define search_path'
);

select is_empty(
  $$ select p.oid::regprocedure::text
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prosecdef
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}')) c where c = 'search_path=""') $$,
  'META: o search_path das funções security definer é vazio'
);

-- ---------------------------------------------------------------------------
-- anon não tem nada
-- ---------------------------------------------------------------------------
select ok(
  not has_schema_privilege('anon', 'public', 'usage')
  and not has_schema_privilege('anon', 'private', 'usage'),
  'META: anon não tem USAGE em public nem em private'
);

select is_empty(
  $$ select c.oid::regclass::text
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public', 'private') and c.relkind in ('r', 'p', 'v', 'm', 'S')
       and (
         has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger')
         or (c.relkind <> 'S' and has_any_column_privilege('anon', c.oid, 'select, insert, update, references'))
       ) $$,
  'META: anon não tem privilégio em nenhuma tabela, view ou sequence'
);

select is_empty(
  $$ select p.oid::regprocedure::text
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
       and has_function_privilege('anon', p.oid, 'execute') $$,
  'META: anon (e PUBLIC) não executa nenhuma função de public ou private'
);

-- ---------------------------------------------------------------------------
-- private é inalcançável
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select c.oid::regclass::text
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'private' and c.relkind in ('r', 'p', 'v', 'm')
       and (
         has_table_privilege('authenticated', c.oid, 'select, insert, update, delete, truncate, references, trigger')
         or has_any_column_privilege('authenticated', c.oid, 'select, insert, update, references')
       ) $$,
  'META: authenticated não tem privilégio em nenhuma tabela (nem coluna) de private'
);

-- views de public que dependem de qualquer relação de private
select is_empty(
  $$ select distinct v.oid::regclass::text
     from pg_class v
     join pg_namespace vn on vn.oid = v.relnamespace
     join pg_rewrite r on r.ev_class = v.oid
     join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.objid = r.oid
                     and d.refclassid = 'pg_class'::regclass
     join pg_class t on t.oid = d.refobjid
     join pg_namespace tn on tn.oid = t.relnamespace
     where vn.nspname = 'public' and v.relkind in ('v', 'm') and tn.nspname = 'private' $$,
  'META: nenhuma view de public lê tabela de private'
);

-- funções de public cujo retorno ou argumento é um tipo de private
select is_empty(
  $$ select p.oid::regprocedure::text
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join lateral unnest(
       coalesce(p.proallargtypes, p.proargtypes::oid[]) || p.prorettype) as ty (oid)
     join pg_type t on t.oid = ty.oid
     join pg_namespace tn on tn.oid = t.typnamespace
     where n.nspname = 'public' and tn.nspname = 'private' $$,
  'META: nenhuma função de public recebe ou devolve tipo de private'
);

-- nomes das colunas de private não aparecem em nenhuma saída pública
select is_empty(
  $$ with proibidas as (
       select a.attname::text as nome
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'private' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
         and a.attname in ('ra_hmac', 'maioridade_verificada_em', 'termos_aceitos_em', 'sensivel_consentido_em', 'email_hmac', 'domain')
       union all
       select unnest(array['email', 'e_mail', 'data_nascimento', 'nascimento', 'birth_date', 'ra', 'cpf'])
     )
     select p.oid::regprocedure::text || ' -> ' || arg.nome
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join lateral unnest(p.proargnames, p.proargmodes) as arg (nome, modo)
     where n.nspname = 'public' and arg.modo in ('o', 'b', 't')
       and arg.nome in (select nome from proibidas)
     union all
     select c.oid::regclass::text || '.' || a.attname
     from pg_attribute a
     join pg_class c on c.oid = a.attrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
       and a.attnum > 0 and not a.attisdropped
       and a.attname in (select nome from proibidas) $$,
  'META: nenhuma tabela, view ou função de public tem coluna de saída com nome de dado privado'
);

-- A lista de RPCs é fechada: criar uma nova obriga a revisar este teste.
select bag_eq(
  $$ select p.proname::text
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute') $$,
  $$ values
       ('completar_onboarding'), ('conta_status'), ('excluir_conta'),
       ('afinidade'), ('pessoas_parecidas'), ('feed_para_voce'), ('feed_seguindo'),
       ('apagar_post'), ('minhas_denuncias'), ('meus_bloqueios'),
       ('ocultar_post'), ('restaurar_post'), ('banir_usuario'), ('desbanir_usuario'),
       ('moderar_avatar'), ('resolver_denuncia'),
       ('definir_cargo'), ('remover_cargo'), ('resolver_pedido_tag'),
       ('consentir_tags_sensiveis'), ('revogar_tags_sensiveis'), ('registrar_busca_gif'),
       ('abrir_conversa'), ('minhas_conversas'), ('total_nao_lidas'), ('marcar_conversa_lida'),
       ('denunciar_mensagem'), ('aceitar_termos'),
       ('minhas_notificacoes'), ('total_notificacoes_nao_lidas'), ('marcar_notificacoes_lidas'),
       ('minhas_conquistas'), ('conceder_conquista'), ('responder_enigma') $$,
  'META: authenticated só executa as RPCs conhecidas de public'
);

-- nenhuma RPC pública aceita "quem é o leitor/ator" por parâmetro
select is_empty(
  $$ select p.oid::regprocedure::text
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     cross join lateral unnest(p.proargnames) as arg (nome)
     where n.nspname = 'public'
       and arg.nome in ('p_leitor', 'p_reader', 'p_uid', 'p_actor', 'p_ator', 'p_author_id', 'p_institution_id') $$,
  'META: nenhuma RPC pública recebe o leitor/ator/instituição por parâmetro'
);

-- ---------------------------------------------------------------------------
-- Comportamento: tentando de fato
-- ---------------------------------------------------------------------------
select tests.seed_world();
select tests.login('ana');

select throws_ok(
  $$ select * from private.accounts $$, '42501', null,
  'usuário logado não lê private.accounts'
);
select throws_ok(
  $$ select * from private.banned_emails $$, '42501', null,
  'usuário logado não lê private.banned_emails'
);

select tests.login_anon();
select throws_ok(
  $$ select * from public.profiles $$, '42501', null,
  'anon não lê nem public.profiles'
);

select tests.logout();
select * from finish();
rollback;
