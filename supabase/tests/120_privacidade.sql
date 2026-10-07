-- =============================================================================
-- Privacidade: e-mail e RA não saem por NENHUMA superfície pública
-- =============================================================================
-- Além dos meta-testes de catálogo (000_meta), aqui a prova é pelo resultado:
-- despejamos tudo o que um usuário logado (e um admin) consegue ler de public,
-- tabelas e RPCs, e procuramos e-mails e RAs lá dentro.
-- Os RAs de teste têm 12 dígitos (9900000xxxxx) para não colidirem com uuids.
-- =============================================================================
begin;
\ir _helpers.psql
select plan(6);

select tests.seed_world();
select tests.add_tag('ana', 't-rock');
select tests.add_tag('bia', 't-rock');
select tests.follow('ana', 'bia');
select tests.follow('bia', 'ana');
select tests.mk_post('bia', 'post da bia', interval '1 hour');
select tests.mk_post('ana', 'post da ana', interval '1 hour');
insert into public.reports (reporter_id, institution_id, profile_id, reason)
select p.id, p.institution_id, tests.uid('bia'), 'spam' from public.profiles p where p.id = tests.uid('ana');

-- Tudo o que quem chama consegue ler em public, como um texto só.
create function tests.dump_publico()
returns text
language plpgsql
as $$
declare
  v_out text := '';
  v_part text;
  r record;
begin
  for r in
    select c.oid::regclass::text as rel
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v')
  loop
    execute format('select coalesce(string_agg(to_jsonb(t)::text, '' ''), '''') from %s t', r.rel) into v_part;
    v_out := v_out || ' ' || v_part;
  end loop;

  select coalesce(string_agg(to_jsonb(t)::text, ' '), '') into v_part from public.pessoas_parecidas(50) t;
  v_out := v_out || ' ' || v_part;
  select coalesce(string_agg(to_jsonb(t)::text, ' '), '') into v_part from public.feed(null, 50) t;
  v_out := v_out || ' ' || v_part;
  select coalesce(string_agg(to_jsonb(t)::text, ' '), '') into v_part from public.minhas_denuncias() t;
  v_out := v_out || ' ' || v_part;
  v_out := v_out || ' ' || coalesce(public.conta_status()::text, '');
  return v_out;
end
$$;
grant execute on function tests.dump_publico() to authenticated;

create function tests.vazou(p_dump text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select string_agg(u.alias, ', ')
  from tests.users u
  join private.accounts a on a.user_id = u.id
  where position(u.email in p_dump) > 0
     -- o RA não é mais guardado: sai do próprio e-mail (os dígitos depois do último ponto)
     or position(substring(split_part(u.email, '@', 1) from '\.([0-9]+)$') in p_dump) > 0
     or position(encode(a.ra_hmac, 'hex') in p_dump) > 0
     or position(split_part(u.email, '@', 2) in p_dump) > 0
$$;
grant execute on function tests.vazou(text) to authenticated;

select tests.login('ana');
select ok(
  char_length(tests.dump_publico()) > 500 and position('post da bia' in tests.dump_publico()) > 0,
  'controle: o despejo realmente contém dados (perfis, posts, RPCs)'
);
select is(tests.vazou(tests.dump_publico()), null, 'usuária comum: nenhum e-mail, domínio ou RA em nada do que ela lê');

select tests.login_mfa('adma');
select is(tests.vazou(tests.dump_publico()), null, 'admin: nenhum e-mail, domínio ou RA em nada do que ele lê');

select tests.login_mfa('moda');
select ok(position('"reason": "spam"' in tests.dump_publico()) > 0, 'controle: o despejo da staff inclui as denúncias');
select is(tests.vazou(tests.dump_publico()), null, 'moderador: nenhum e-mail, domínio ou RA em nada do que ele lê');

-- a data de nascimento nem existe mais no banco (ver 140_auditoria.sql); as
-- colunas que a substituíram também não saem por lugar nenhum
select is(
  position('maioridade_verificada_em' in tests.dump_publico()) + position('ra_hmac' in tests.dump_publico()),
  0,
  'as colunas de private.accounts não aparecem em nada do que a staff lê'
);

select * from finish();
rollback;
