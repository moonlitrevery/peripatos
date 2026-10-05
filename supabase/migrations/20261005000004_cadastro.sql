-- =============================================================================
-- 04 · Cadastro: allowlist de domínio, RA, banimento por HMAC, onboarding
-- =============================================================================
-- Duas camadas, de propósito:
--   1. Auth hook "before user created": recusa ANTES de o usuário existir.
--   2. Triggers em auth.users: mesma validação dentro do banco. Se o hook for
--      desligado ou mal configurado, o INSERT em auth.users falha do mesmo jeito.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Segredo do HMAC no Supabase Vault. Gerado no próprio banco: nunca passa pelo
-- git. (Em `supabase db reset` local ele é regenerado junto com os dados.)
-- ---------------------------------------------------------------------------
create extension if not exists supabase_vault with schema vault;

do $$
begin
  if not exists (select 1 from vault.secrets s where s.name = 'peripatos_ban_hmac_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'peripatos_ban_hmac_key',
      'Chave do HMAC-SHA256 de private.banned_emails. Não rotacionar sem recalcular a tabela.'
    );
  end if;
end
$$;

-- HMAC-SHA256(e-mail normalizado, segredo do Vault). Falha fechado: sem o
-- segredo, levanta erro em vez de devolver NULL (o que liberaria banidos).
create function private.email_hmac(p_email text)
returns bytea
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  select ds.decrypted_secret into v_key
  from vault.decrypted_secrets ds
  where ds.name = 'peripatos_ban_hmac_key';

  if v_key is null or char_length(v_key) < 32 then
    raise exception 'Segredo peripatos_ban_hmac_key ausente no Vault.';
  end if;

  return extensions.hmac(
    convert_to(lower(btrim(p_email)), 'UTF8'),
    decode(v_key, 'hex'),
    'sha256'
  );
end
$$;

-- Valida um e-mail de cadastro e extrai instituição e RA.
-- Formato esperado: nome.RA@<domínio da allowlist>. Devolve `erro` preenchido
-- quando o cadastro deve ser recusado.
create function private.parse_signup_email(
  p_email text,
  out institution_id uuid,
  out ra text,
  out erro text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_local  text;
  v_domain text;
  v_inst   uuid;
  v_match  text[];
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
    erro := 'Informe um e-mail institucional válido.';
    return;
  end if;

  v_local  := split_part(v_email, '@', 1);
  v_domain := split_part(v_email, '@', 2);

  select d.institution_id into v_inst
  from private.institution_domains d
  where d.domain = v_domain;

  if v_inst is null then
    erro := 'Cadastro restrito a e-mails institucionais de instituições participantes.';
    return;
  end if;

  -- nome.RA: o RA são os dígitos depois do último ponto. Sem "+alias".
  v_match := regexp_match(v_local, '^[a-z0-9][a-z0-9._-]*\.([0-9]{3,20})$');
  if v_match is null then
    erro := 'E-mail fora do formato esperado (nome.RA@dominio).';
    return;
  end if;

  if exists (
    select 1 from private.banned_emails b where b.email_hmac = private.email_hmac(v_email)
  ) then
    erro := 'Cadastro não permitido para este e-mail.';
    return;
  end if;

  institution_id := v_inst;
  ra := v_match[1];
end
$$;

-- ---------------------------------------------------------------------------
-- Camada 1: auth hook (before user created)
-- Configurado em supabase/config.toml -> [auth.hook.before_user_created]
-- ---------------------------------------------------------------------------
create function private.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v record;
begin
  select * into v from private.parse_signup_email(event -> 'user' ->> 'email');

  if v.erro is not null then
    return jsonb_build_object(
      'error', jsonb_build_object('http_code', 403, 'message', v.erro)
    );
  end if;

  return '{}'::jsonb;
end
$$;

revoke all on function private.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function private.hook_before_user_created(jsonb) to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- Camada 2: triggers em auth.users
-- ---------------------------------------------------------------------------

-- BEFORE INSERT: normaliza o e-mail e recusa o que o hook recusaria.
create function private.auth_users_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  new.email := lower(btrim(new.email));

  select * into v from private.parse_signup_email(new.email);
  if v.erro is not null then
    raise exception '%', v.erro using errcode = 'PT403';
  end if;

  return new;
end
$$;

-- AFTER INSERT: cria a conta privada (instituição + RA) e o perfil vazio.
create function private.auth_users_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  select * into v from private.parse_signup_email(new.email);
  if v.erro is not null then
    raise exception '%', v.erro using errcode = 'PT403';
  end if;

  insert into private.accounts (user_id, institution_id, ra)
  values (new.id, v.institution_id, v.ra);

  insert into public.profiles (id, institution_id)
  values (new.id, v.institution_id);

  return new;
end
$$;

-- O e-mail define instituição e RA: trocar de e-mail furaria a allowlist e o
-- banimento. Bloqueado no banco.
create function private.auth_users_block_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- email_change é onde o Auth guarda a troca pendente de confirmação:
  -- barramos já o pedido, não só a efetivação.
  if new.email is distinct from old.email
     or (coalesce(new.email_change, '') <> '' and new.email_change is distinct from old.email_change) then
    raise exception 'O e-mail da conta não pode ser alterado.' using errcode = 'PT403';
  end if;
  return new;
end
$$;

revoke all on function
  private.email_hmac(text),
  private.parse_signup_email(text),
  private.auth_users_before_insert(),
  private.auth_users_after_insert(),
  private.auth_users_block_email_change()
from public, anon, authenticated;

create trigger peripatos_before_insert
  before insert on auth.users
  for each row execute function private.auth_users_before_insert();

create trigger peripatos_after_insert
  after insert on auth.users
  for each row execute function private.auth_users_after_insert();

create trigger peripatos_block_email_change
  before update of email, email_change on auth.users
  for each row execute function private.auth_users_block_email_change();

-- ---------------------------------------------------------------------------
-- Onboarding
-- ---------------------------------------------------------------------------

-- Conclui o onboarding. A data de nascimento é gravada UMA vez: se pudesse ser
-- reenviada, um menor simplesmente tentaria de novo com outra data.
-- Menor de 18 conclui o onboarding mas a conta continua inativa (is_active
-- compara a data com o dia de hoje, então ativa sozinha ao completar 18).
create function public.completar_onboarding(
  p_username text,
  p_display_name text,
  p_data_nascimento date,
  p_bio text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_birth date;
  v_done  boolean;
  v_hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_uid is null then
    raise exception 'Login necessário.' using errcode = 'PT401';
  end if;

  select a.birth_date, p.onboarding_completo
    into v_birth, v_done
  from private.accounts a
  join public.profiles p on p.id = a.user_id
  where a.user_id = v_uid
  for update;

  if not found then
    raise exception 'Conta não encontrada.' using errcode = 'PT404';
  end if;
  if private.is_banned(v_uid) then
    raise exception 'Conta banida.' using errcode = 'PT403';
  end if;
  if v_done then
    raise exception 'O onboarding já foi concluído.' using errcode = 'PT409';
  end if;
  if p_data_nascimento is null or p_data_nascimento > v_hoje or p_data_nascimento < date '1900-01-01' then
    raise exception 'Data de nascimento inválida.' using errcode = 'PT400';
  end if;
  if v_birth is not null and v_birth <> p_data_nascimento then
    raise exception 'A data de nascimento já foi informada e não pode ser alterada.' using errcode = 'PT409';
  end if;
  if p_username is null or p_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Username inválido: use de 3 a 20 caracteres entre a-z, 0-9 e _.' using errcode = 'PT400';
  end if;
  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 50 then
    raise exception 'Nome de exibição inválido (1 a 50 caracteres).' using errcode = 'PT400';
  end if;
  if char_length(p_bio) > 300 then
    raise exception 'Bio muito longa (máximo de 300 caracteres).' using errcode = 'PT400';
  end if;

  -- Se o username colidir, a chamada inteira é desfeita (inclusive a data) e a
  -- pessoa tenta de novo. A data só trava quando o onboarding conclui.
  update private.accounts set birth_date = p_data_nascimento where user_id = v_uid;

  begin
    update public.profiles
       set username = p_username,
           display_name = btrim(p_display_name),
           bio = p_bio,
           onboarding_completo = true
     where id = v_uid;
  exception when unique_violation then
    raise exception 'Este username já está em uso.' using errcode = 'PT409';
  end;

  return jsonb_build_object(
    'onboarding_completo', true,
    'ativo', private.is_active(v_uid)
  );
end
$$;

-- Estado da própria conta (para o app saber por que a conta não está ativa).
-- Não devolve a data de nascimento, só o resultado da verificação.
create function public.conta_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'onboarding_completo', p.onboarding_completo,
    'data_nascimento_informada', a.birth_date is not null,
    'maior_de_idade', coalesce(a.birth_date <= private.adult_cutoff(), false),
    'banido', p.banned_at is not null,
    'ativo', private.is_active(p.id)
  )
  from public.profiles p
  join private.accounts a on a.user_id = p.id
  where p.id = (select auth.uid())
$$;

revoke all on function public.completar_onboarding(text, text, date, text) from public, anon;
revoke all on function public.conta_status() from public, anon;
grant execute on function public.completar_onboarding(text, text, date, text) to authenticated;
grant execute on function public.conta_status() to authenticated;
