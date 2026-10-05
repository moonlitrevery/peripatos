-- =============================================================================
-- 06 · Triggers: bloqueio, integridade de tags, timestamps e rate limit
-- =============================================================================
-- Triggers valem para qualquer caminho de escrita, inclusive API direta.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Bloquear apaga os follows nos dois sentidos
-- ---------------------------------------------------------------------------
create function private.blocks_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.follows f
  where (f.follower_id = new.blocker_id and f.followee_id = new.blocked_id)
     or (f.follower_id = new.blocked_id and f.followee_id = new.blocker_id);
  return null;
end
$$;

create trigger blocks_remove_follows
  after insert on public.blocks
  for each row execute function private.blocks_after_insert();

-- ---------------------------------------------------------------------------
-- Tags: comum na tabela comum, sensível na tabela sensível, com teto por perfil
-- ---------------------------------------------------------------------------
-- O teto não é cosmético: a afinidade é normalizada pelas tags de quem LÊ,
-- então um perfil com todas as tags teria afinidade máxima com todo mundo e
-- apareceria no topo de pessoas_parecidas de toda a instituição.
create function private.profile_tags_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sensitive boolean;
  v_quer_sensivel boolean := (tg_table_name = 'profile_sensitive_tags');
  v_max integer := tg_argv[0]::integer;
  v_count integer;
begin
  select t.is_sensitive into v_sensitive from public.tags t where t.id = new.tag_id;
  if not found then
    raise exception 'Tag inexistente.' using errcode = 'PT400';
  end if;

  if v_sensitive and not v_quer_sensivel then
    raise exception 'Esta tag é sensível: use profile_sensitive_tags.' using errcode = 'PT400';
  elsif not v_sensitive and v_quer_sensivel then
    raise exception 'Esta tag não é sensível: use profile_tags.' using errcode = 'PT400';
  end if;

  -- serializa por usuário para o teto não ser furado com requisições paralelas
  perform pg_advisory_xact_lock(hashtextextended('peripatos:tags:' || new.user_id::text, 0));

  if v_quer_sensivel then
    select count(*) into v_count from public.profile_sensitive_tags s where s.user_id = new.user_id;
  else
    select count(*) into v_count from public.profile_tags s where s.user_id = new.user_id;
  end if;

  if v_count >= v_max then
    raise exception 'Limite de % tags neste grupo atingido.', v_max using errcode = 'PT400';
  end if;

  return new;
end
$$;

create trigger profile_tags_valida
  before insert on public.profile_tags
  for each row execute function private.profile_tags_before_insert('20');

create trigger profile_sensitive_tags_valida
  before insert on public.profile_sensitive_tags
  for each row execute function private.profile_tags_before_insert('5');

-- Uma tag em uso não muda de natureza: isso moveria dados entre os dois
-- regimes de visibilidade.
create function private.tags_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_sensitive is distinct from old.is_sensitive and (
    exists (select 1 from public.profile_tags pt where pt.tag_id = old.id)
    or exists (select 1 from public.profile_sensitive_tags st where st.tag_id = old.id)
  ) then
    raise exception 'Não é possível mudar is_sensitive de uma tag em uso.';
  end if;
  return new;
end
$$;

create trigger tags_trava_sensibilidade
  before update of is_sensitive on public.tags
  for each row execute function private.tags_before_update();

-- ---------------------------------------------------------------------------
-- Timestamps
-- ---------------------------------------------------------------------------
create function private.profiles_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger profiles_touch
  before update on public.profiles
  for each row execute function private.profiles_before_update();

create function private.posts_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.body is distinct from old.body or new.gif_id is distinct from old.gif_id then
    new.edited_at := now();
  end if;
  return new;
end
$$;

create trigger posts_touch
  before update on public.posts
  for each row execute function private.posts_before_update();

-- ---------------------------------------------------------------------------
-- Rate limit
-- ---------------------------------------------------------------------------
-- Uso: execute function private.enforce_rate_limit('<ação>', '<máximo>',
--      '<janela>', '<mensagem>').
-- Conta eventos em private.rate_limit_events (não linhas da tabela), então
-- apagar/desfazer não devolve cota. Escritas sem usuário (seed, service_role)
-- não são limitadas.
-- O erro sai com SQLSTATE PT429, que o PostgREST traduz para HTTP 429.
create function private.enforce_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_action text := tg_argv[0];
  v_max    integer := tg_argv[1]::integer;
  v_window interval := tg_argv[2]::interval;
  v_count  integer;
begin
  if v_uid is null then
    return new;
  end if;

  -- serializa por usuário+ação: requisições paralelas não furam o limite
  perform pg_advisory_xact_lock(hashtextextended('peripatos:rate:' || v_action || ':' || v_uid::text, 0));

  delete from private.rate_limit_events e
  where e.user_id = v_uid and e.action = v_action and e.created_at <= now() - v_window;

  select count(*) into v_count
  from private.rate_limit_events e
  where e.user_id = v_uid and e.action = v_action;

  if v_count >= v_max then
    raise exception '%', tg_argv[3]
      using errcode = 'PT429',
            detail = format('Limite: %s por %s.', v_max, tg_argv[2]),
            hint = 'Tente novamente mais tarde.';
  end if;

  insert into private.rate_limit_events (user_id, action) values (v_uid, v_action);
  return new;
end
$$;

create trigger posts_rate_limit
  before insert on public.posts
  for each row execute function private.enforce_rate_limit(
    'post', '15', '1 hour', 'Limite de 15 posts por hora atingido.');

create trigger follows_rate_limit
  before insert on public.follows
  for each row execute function private.enforce_rate_limit(
    'follow', '200', '1 day', 'Limite de 200 follows por dia atingido.');

create trigger reports_rate_limit
  before insert on public.reports
  for each row execute function private.enforce_rate_limit(
    'report', '20', '1 day', 'Limite de 20 denúncias por dia atingido.');

create trigger tag_requests_rate_limit
  before insert on public.tag_requests
  for each row execute function private.enforce_rate_limit(
    'tag_request', '5', '1 day', 'Limite de 5 pedidos de tag por dia atingido.');

revoke all on function
  private.blocks_after_insert(),
  private.profile_tags_before_insert(),
  private.tags_before_update(),
  private.profiles_before_update(),
  private.posts_before_update(),
  private.enforce_rate_limit()
from public, anon, authenticated;
