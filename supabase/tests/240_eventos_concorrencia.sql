-- =============================================================================
-- Eventos: duas pessoas na última vaga, ao mesmo tempo
-- =============================================================================
-- Este arquivo NÃO roda dentro de uma transação: precisa de duas conexões de
-- verdade (dblink), e uma conexão não enxerga o que a outra ainda não
-- confirmou. Por isso os dados são gravados de verdade, numa instituição só
-- deste teste, e apagados no fim (e no começo, se uma execução anterior tiver
-- parado no meio).
--
-- A prova não depende de sorte: a primeira conexão confirma presença e deixa
-- a transação ABERTA; a segunda tenta a mesma vaga e tem de ficar esperando
-- (a linha do evento está travada). Só quando a primeira conclui a segunda
-- anda, e aí encontra o evento cheio.
-- =============================================================================
-- Os outros arquivos criam o pgTAP dentro da transação deles, que é desfeita.
-- Aqui não há transação: o que este arquivo instala, ele mesmo remove no fim.
-- O dblink vai num esquema só dele: em "extensions" ele quebraria o
-- "grant execute on all functions in schema extensions" dos outros testes.
select not exists (select 1 from pg_extension where extname = 'pgtap') as instalei_pgtap \gset
create extension if not exists pgtap with schema extensions;
drop schema if exists conc_dblink cascade;
create schema conc_dblink;
create extension dblink with schema conc_dblink;
set search_path = public, extensions, conc_dblink;

-- sobras de uma execução interrompida
delete from auth.users where email like '%@conc.peripatos.test';
delete from public.institutions where slug = 'teste-conc';

select plan(14);

insert into public.institutions (name, slug) values ('TESTE CONC', 'teste-conc');
insert into private.institution_domains (domain, institution_id)
select 'conc.peripatos.test', id from public.institutions where slug = 'teste-conc';

create temporary table conc (alias text primary key, id uuid not null);
insert into conc values ('org', gen_random_uuid()), ('um', gen_random_uuid()), ('dois', gen_random_uuid()), ('tres', gen_random_uuid());
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
select c.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       c.alias || '.99100000' || row_number() over (order by c.alias) || '@conc.peripatos.test', now(), now()
from conc c;
update private.accounts set maioridade_verificada_em = now(), termos_versao = private.termos_versao_atual(), termos_aceitos_em = now()
 where user_id in (select id from conc);
update public.profiles p set username = 'conc_' || c.alias, display_name = initcap(c.alias), onboarding_completo = true
  from conc c where c.id = p.id;

-- dois eventos com UMA vaga: um aberto, um com aprovação
create temporary table ev (nome text primary key, id uuid not null);
with novos as (
  insert into public.events (organizer_id, institution_id, title, starts_at, over_at, modality, general_location, kind, capacity)
  select p.id, p.institution_id, t.titulo, now() + interval '1 day', now() + interval '1 day 2 hours', 'presencial', 'no campus', t.tipo, 1
  from public.profiles p, (values ('Última vaga, aberto', 'aberto'::public.event_kind), ('Última vaga, com aprovação', 'aprovacao')) as t (titulo, tipo)
  where p.id = (select id from conc where alias = 'org')
  returning id, kind
)
insert into ev select kind::text, id from novos;
insert into public.event_participants (event_id, user_id, status)
select (select id from ev where nome = 'aprovacao'), c.id, 'pendente' from conc c where c.alias in ('um', 'dois');

-- Uma conexão que age como a pessoa, do jeito que a API faria.
create function pg_temp.conectar(p_nome text, p_alias text) returns void language plpgsql as $$
begin
  -- Pelo endereço de rede do servidor, e não por 127.0.0.1: em loopback o
  -- Postgres local não pede senha, e o dblink só deixa quem não é superusuário
  -- conectar quando a senha é de fato conferida. A senha é a do Supabase local
  -- (a mesma no CI); este teste só roda contra o banco local.
  perform dblink_connect(p_nome, format('dbname=%s user=postgres password=postgres host=%s port=%s',
                                        current_database(), host(inet_server_addr()), inet_server_port()));
  perform dblink_exec(p_nome, format(
    'set request.jwt.claims to %L',
    json_build_object('sub', (select id from conc where alias = p_alias), 'role', 'authenticated')::text));
  perform dblink_exec(p_nome, 'set role authenticated');
end $$;

select lives_ok($$ select pg_temp.conectar('c1', 'um') $$, 'primeira conexão, como a primeira pessoa');
select lives_ok($$ select pg_temp.conectar('c2', 'dois') $$, 'segunda conexão, como a segunda pessoa');
select lives_ok($$ select pg_temp.conectar('c3', 'org') $$, 'terceira conexão, como quem organiza');

-- ---------------------------------------------------------------------------
-- Evento aberto: as duas confirmam a última vaga
-- ---------------------------------------------------------------------------
select dblink_exec('c1', 'begin');
select is(
  (select r from dblink('c1', format('select public.participar_evento(%L)::text', (select id from ev where nome = 'aberto'))) as t (r text)),
  'confirmado', 'a primeira confirma, e a transação dela fica aberta'
);
select is(
  dblink_send_query('c2', format('select public.participar_evento(%L)::text', (select id from ev where nome = 'aberto'))), 1,
  'a segunda tenta a mesma vaga, ao mesmo tempo'
);
select pg_sleep(0.6);
select is(dblink_is_busy('c2'), 1, 'e fica esperando: a linha do evento está travada pela primeira');
select dblink_exec('c1', 'commit');
select is(
  (select count(*) from dblink_get_result('c2', false) as t (r text)), 0::bigint,
  'quando a primeira conclui, a segunda anda e não recebe confirmação'
);
select matches(dblink_error_message('c2'), 'Não há mais vagas neste evento', 'recebe "não há mais vagas"');
select is(
  (select count(*) from public.event_participants ep where ep.event_id = (select id from ev where nome = 'aberto') and ep.status = 'confirmado'),
  1::bigint, 'a vaga única ficou com uma pessoa só'
);
-- esvazia o resultado pendente da conexão antes de reutilizá-la
select count(*) from dblink_get_result('c2', false) as t (r text);

-- ---------------------------------------------------------------------------
-- Com aprovação: quem organiza aceita enquanto outra confirmação está no ar
-- ---------------------------------------------------------------------------
-- A organizadora aceita o primeiro pedido e deixa a transação aberta; em outra
-- conexão (um segundo aparelho dela) aceita o segundo pedido.
select dblink_exec('c3', 'begin');
select lives_ok(
  format($$ select * from dblink('c3', %L) as t (r text) $$,
         format('select public.responder_pedido(%L, %L, true)::text', (select id from ev where nome = 'aprovacao'), (select id from conc where alias = 'um'))),
  'quem organiza aceita o primeiro pedido, e a transação fica aberta'
);
select lives_ok($$ select dblink_disconnect('c2'); select pg_temp.conectar('c2', 'org') $$, 'num segundo aparelho, a mesma organizadora');
select is(
  dblink_send_query('c2', format('select public.responder_pedido(%L, %L, true)::text', (select id from ev where nome = 'aprovacao'), (select id from conc where alias = 'dois'))),
  1, 'aceita o segundo pedido ao mesmo tempo'
);
select pg_sleep(0.6);
select dblink_exec('c3', 'commit');
select count(*) from dblink_get_result('c2', false) as t (r text);
select matches(dblink_error_message('c2'), 'Não há mais vagas neste evento', 'o segundo aceite é recusado: não há mais vagas');
select is(
  (select count(*) from public.event_participants ep where ep.event_id = (select id from ev where nome = 'aprovacao') and ep.status = 'confirmado'),
  1::bigint, 'e a vaga única ficou com uma pessoa só'
);

select * from finish();

-- limpeza
select dblink_disconnect(c) from unnest(array['c1', 'c2', 'c3']) c;
delete from auth.users where email like '%@conc.peripatos.test';
delete from private.rate_limit_events where user_id in (select id from conc);
delete from public.institutions where slug = 'teste-conc';
drop schema conc_dblink cascade;
\if :instalei_pgtap
  drop extension pgtap;
\endif
