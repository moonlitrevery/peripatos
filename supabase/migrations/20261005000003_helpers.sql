-- =============================================================================
-- 03 · Funções auxiliares (private, security definer, stable)
-- =============================================================================
-- Usadas pelas políticas de RLS e pelas RPCs. Todas com search_path vazio e
-- nomes qualificados. Ficam em private: não são chamáveis pela API.
-- =============================================================================

-- "Hoje" no fuso do Brasil menos 18 anos: quem nasceu até esta data é adulto.
create function private.adult_cutoff()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select ((now() at time zone 'America/Sao_Paulo')::date - interval '18 years')::date
$$;

-- Instituição de quem está chamando. Derivada no cadastro, nunca do cliente.
create function private.my_institution()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.institution_id
  from private.accounts a
  where a.user_id = (select auth.uid())
$$;

-- Conta ativa = onboarding completo + 18 anos ou mais + não banida.
create function private.is_active(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join private.accounts a on a.user_id = p.id
    where p.id = p_uid
      and p.onboarding_completo
      and p.banned_at is null
      and a.birth_date is not null
      and a.birth_date <= private.adult_cutoff()
  )
$$;

create function private.is_banned(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.banned_at is not null from public.profiles p where p.id = p_uid),
    true  -- sem perfil = tratado como banido (fail closed)
  )
$$;

-- a segue b E b segue a.
create function private.is_mutual(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.follows f where f.follower_id = p_a and f.followee_id = p_b)
     and exists (select 1 from public.follows f where f.follower_id = p_b and f.followee_id = p_a)
$$;

-- Existe bloqueio entre a e b, em qualquer direção.
create function private.is_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  )
$$;

create function private.same_institution(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.accounts a
    join private.accounts b on b.institution_id = a.institution_id
    where a.user_id = p_a and b.user_id = p_b
  )
$$;

-- Staff (moderador ou admin) da instituição, com conta ativa.
create function private.is_staff(p_uid uuid, p_institution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_roles s
    where s.user_id = p_uid
      and s.institution_id = p_institution_id
  ) and private.is_active(p_uid)
$$;

create function private.is_admin(p_uid uuid, p_institution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_roles s
    where s.user_id = p_uid
      and s.institution_id = p_institution_id
      and s.role = 'admin'
  ) and private.is_active(p_uid)
$$;

-- O alvo é visível para o leitor? Mesma instituição, alvo ativo (onboarding
-- completo, 18+, não banido) e nenhum bloqueio em qualquer direção.
-- Não verifica se o LEITOR é ativo: as políticas fazem isso à parte.
create function private.can_see(p_viewer uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer is not null
     and p_target is not null
     and private.same_institution(p_viewer, p_target)
     and private.is_active(p_target)
     and not private.is_blocked(p_viewer, p_target)
$$;

-- O alvo de uma denúncia é válido para quem denuncia?
create function private.report_target_ok(p_reporter uuid, p_post_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_post_id is not null then exists (
      select 1
      from public.posts po
      where po.id = p_post_id
        and po.deleted_at is null
        and po.author_id <> p_reporter
        and private.same_institution(p_reporter, po.author_id)
        and not private.is_blocked(p_reporter, po.author_id)
    )
    when p_profile_id is not null then
      p_profile_id <> p_reporter and private.can_see(p_reporter, p_profile_id)
    else false
  end
$$;

-- Só authenticated executa; nunca anon, nunca PUBLIC.
revoke all on all functions in schema private from public, anon;
grant execute on function
  private.adult_cutoff(),
  private.my_institution(),
  private.is_active(uuid),
  private.is_banned(uuid),
  private.is_mutual(uuid, uuid),
  private.is_blocked(uuid, uuid),
  private.same_institution(uuid, uuid),
  private.is_staff(uuid, uuid),
  private.is_admin(uuid, uuid),
  private.can_see(uuid, uuid),
  private.report_target_ok(uuid, uuid, uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- DEFAULTs de institution_id: o cliente não envia, o banco preenche.
-- (O WITH CHECK das políticas ainda confere o valor.)
-- ---------------------------------------------------------------------------
alter table public.posts        alter column institution_id set default private.my_institution();
alter table public.reports      alter column institution_id set default private.my_institution();
alter table public.tag_requests alter column institution_id set default private.my_institution();
