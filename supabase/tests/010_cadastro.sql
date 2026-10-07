-- =============================================================================
-- Cadastro: allowlist de domínio, formato nome.RA, banimento por HMAC
-- =============================================================================
begin;
\ir _helpers.psql
select plan(21);

-- ---------------------------------------------------------------------------
-- Camada 1: o auth hook (before user created)
-- ---------------------------------------------------------------------------
select is(
  private.hook_before_user_created('{"user": {"email": "maria.123456@alunos.unisagrado.edu.br"}}'),
  '{}'::jsonb,
  'hook aceita e-mail do domínio da allowlist (seed: UNISAGRADO)'
);

select is(
  private.hook_before_user_created('{"user": {"email": "Maria.123456@ALUNOS.Unisagrado.edu.br"}}'),
  '{}'::jsonb,
  'hook normaliza o e-mail em minúsculas antes de validar'
);

select is(
  private.hook_before_user_created('{"user": {"email": "maria.123456@gmail.com"}}') #>> '{error,http_code}',
  '403',
  'hook recusa e-mail fora da allowlist'
);

select is(
  private.hook_before_user_created('{"user": {"email": "maria.123456@unisagrado.edu.br"}}') #>> '{error,http_code}',
  '403',
  'hook recusa domínio parecido (sem o subdomínio alunos.)'
);

select is(
  private.hook_before_user_created('{"user": {"email": "maria.123456@alunos.unisagrado.edu.br.evil.com"}}') #>> '{error,http_code}',
  '403',
  'hook recusa domínio que só COMEÇA com o da allowlist'
);

select is(
  private.hook_before_user_created('{"user": {"email": "maria@alunos.unisagrado.edu.br"}}') #>> '{error,http_code}',
  '403',
  'hook recusa e-mail sem RA'
);

select is(
  private.hook_before_user_created('{"user": {"email": "maria.123456+outra@alunos.unisagrado.edu.br"}}') #>> '{error,http_code}',
  '403',
  'hook recusa alias com + (seria um jeito de driblar o banimento)'
);

select is(
  private.hook_before_user_created('{"user": {}}') #>> '{error,http_code}',
  '403',
  'hook recusa cadastro sem e-mail (telefone, anônimo)'
);

select ok(
  has_function_privilege('supabase_auth_admin', 'private.hook_before_user_created(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'private.hook_before_user_created(jsonb)', 'execute')
  and not has_function_privilege('anon', 'private.hook_before_user_created(jsonb)', 'execute'),
  'só supabase_auth_admin executa o hook'
);

-- ---------------------------------------------------------------------------
-- Camada 2: os triggers em auth.users (valem mesmo com o hook desligado)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into auth.users (id, email) values (gen_random_uuid(), 'maria.123456@gmail.com') $$,
  'PT403', null,
  'INSERT direto em auth.users com e-mail fora da allowlist falha'
);

select lives_ok(
  $$ insert into auth.users (id, email)
     values ('11111111-1111-1111-1111-111111111111', 'Maria.Silva.123456@alunos.unisagrado.edu.br') $$,
  'INSERT com e-mail válido passa'
);

select is(
  (select email::text from auth.users where id = '11111111-1111-1111-1111-111111111111'),
  'maria.silva.123456@alunos.unisagrado.edu.br',
  'o e-mail é gravado em minúsculas'
);

select is(
  (select (a.ra_hmac = private.ra_hmac(i.id, '123456'))::text || '@' || i.slug
   from private.accounts a join public.institutions i on i.id = a.institution_id
   where a.user_id = '11111111-1111-1111-1111-111111111111'),
  'true@unisagrado',
  'a instituição sai do e-mail, e do RA fica só o HMAC em private.accounts'
);

select is(
  (select (p.institution_id = i.id and not p.onboarding_completo and p.username is null)
   from public.profiles p, public.institutions i
   where p.id = '11111111-1111-1111-1111-111111111111' and i.slug = 'unisagrado'),
  true,
  'o perfil nasce na instituição certa, vazio e sem onboarding'
);

select throws_ok(
  $$ update auth.users set email = 'maria.silva.123456@gmail.com'
     where id = '11111111-1111-1111-1111-111111111111' $$,
  'PT403', null,
  'trocar o e-mail depois do cadastro é bloqueado'
);

select throws_ok(
  $$ update auth.users set email_change = 'maria.silva.123456@gmail.com'
     where id = '11111111-1111-1111-1111-111111111111' $$,
  'PT403', null,
  'nem o pedido de troca de e-mail (email_change) é aceito'
);

-- ---------------------------------------------------------------------------
-- Banimento por e-mail
-- ---------------------------------------------------------------------------
insert into private.banned_emails (email_hmac)
values (private.email_hmac('joao.777777@alunos.unisagrado.edu.br'));

select is(
  private.hook_before_user_created('{"user": {"email": "joao.777777@alunos.unisagrado.edu.br"}}') #>> '{error,http_code}',
  '403',
  'hook recusa e-mail banido'
);

select is(
  private.hook_before_user_created('{"user": {"email": "JOAO.777777@alunos.unisagrado.edu.br"}}') #>> '{error,http_code}',
  '403',
  'hook recusa e-mail banido mesmo com outra caixa'
);

select throws_ok(
  $$ insert into auth.users (id, email) values (gen_random_uuid(), 'joao.777777@alunos.unisagrado.edu.br') $$,
  'PT403', null,
  'INSERT direto em auth.users com e-mail banido falha'
);

select isnt(
  (select email_hmac from private.banned_emails limit 1),
  extensions.digest('joao.777777@alunos.unisagrado.edu.br', 'sha256'),
  'banned_emails não guarda SHA-256 puro (que seria enumerável)'
);

select ok(
  private.email_hmac('joao.777777@alunos.unisagrado.edu.br')
    = extensions.hmac(
        convert_to('joao.777777@alunos.unisagrado.edu.br', 'UTF8'),
        decode((select decrypted_secret from vault.decrypted_secrets where name = 'peripatos_ban_hmac_key'), 'hex'),
        'sha256'),
  'o valor guardado é HMAC-SHA256 com o segredo do Vault'
);

select * from finish();
rollback;
