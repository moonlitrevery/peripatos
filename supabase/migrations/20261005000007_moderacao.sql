-- =============================================================================
-- 07 · RPCs de escrita privilegiada: soft delete, moderação, cargos
-- =============================================================================
-- Estas tabelas/colunas não têm GRANT de escrita para authenticated. O único
-- caminho é por aqui, e toda ação de staff grava em moderation_actions na
-- mesma transação: ou acontecem as duas coisas, ou nenhuma.
--
-- Quem chama é sempre auth.uid(). Nenhuma função aceita "ator" por parâmetro.
-- Erros usam SQLSTATE PTxxx, que o PostgREST traduz para o status HTTP xxx.
-- =============================================================================

-- Valida e normaliza o motivo de uma ação de moderação.
create function private.motivo_obrigatorio(p_motivo text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_motivo is null or char_length(btrim(p_motivo)) not between 3 and 1000 then
    raise exception 'Informe o motivo (3 a 1000 caracteres).' using errcode = 'PT400';
  end if;
  return btrim(p_motivo);
end
$$;

-- Garante que quem chama é staff (ou admin) da instituição e devolve o uid.
create function private.exigir_staff(p_institution_id uuid, p_apenas_admin boolean default false)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Login necessário.' using errcode = 'PT401';
  end if;
  -- Mesma resposta para "não existe" e "não é da sua instituição".
  if p_institution_id is null
     or (p_apenas_admin and not private.is_admin(v_uid, p_institution_id))
     or (not p_apenas_admin and not private.is_staff(v_uid, p_institution_id)) then
    raise exception 'Sem permissão para esta ação.' using errcode = 'PT403';
  end if;
  return v_uid;
end
$$;

-- ---------------------------------------------------------------------------
-- Autor: soft delete do próprio post
-- ---------------------------------------------------------------------------
create function public.apagar_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Login necessário.' using errcode = 'PT401';
  end if;

  update public.posts
     set deleted_at = now()
   where id = p_post_id
     and author_id = v_uid
     and deleted_at is null;

  if not found then
    raise exception 'Post não encontrado.' using errcode = 'PT404';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Staff: ocultar / restaurar post
-- ---------------------------------------------------------------------------
create function public.ocultar_post(p_post_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := private.motivo_obrigatorio(p_motivo);
  v_inst   uuid;
  v_author uuid;
  v_uid    uuid;
begin
  select po.institution_id, po.author_id into v_inst, v_author
  from public.posts po where po.id = p_post_id;

  v_uid := private.exigir_staff(v_inst);

  update public.posts
     set hidden_at = now(), hidden_by = v_uid
   where id = p_post_id and hidden_at is null;
  if not found then
    raise exception 'O post já está oculto.' using errcode = 'PT409';
  end if;

  insert into public.moderation_actions (institution_id, actor_id, action, target_user_id, target_post_id, reason)
  values (v_inst, v_uid, 'ocultar_post', v_author, p_post_id, v_motivo);
end
$$;

create function public.restaurar_post(p_post_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := private.motivo_obrigatorio(p_motivo);
  v_inst   uuid;
  v_author uuid;
  v_uid    uuid;
begin
  select po.institution_id, po.author_id into v_inst, v_author
  from public.posts po where po.id = p_post_id;

  v_uid := private.exigir_staff(v_inst);

  update public.posts
     set hidden_at = null, hidden_by = null
   where id = p_post_id and hidden_at is not null;
  if not found then
    raise exception 'O post não está oculto.' using errcode = 'PT409';
  end if;

  insert into public.moderation_actions (institution_id, actor_id, action, target_user_id, target_post_id, reason)
  values (v_inst, v_uid, 'restaurar_post', v_author, p_post_id, v_motivo);
end
$$;

-- ---------------------------------------------------------------------------
-- Staff: banir / (admin) desbanir
-- ---------------------------------------------------------------------------
-- Banir: marca o perfil, grava o HMAC do e-mail em private.banned_emails (o
-- e-mail não volta a se cadastrar nem que a conta seja apagada), remove
-- qualquer cargo e derruba as sessões. Moderador não bane staff; admin sim.
create function public.banir_usuario(p_user_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := private.motivo_obrigatorio(p_motivo);
  v_inst   uuid;
  v_uid    uuid;
  v_email  text;
begin
  select a.institution_id into v_inst from private.accounts a where a.user_id = p_user_id;

  v_uid := private.exigir_staff(v_inst);

  if p_user_id = v_uid then
    raise exception 'Você não pode banir a si mesmo.' using errcode = 'PT400';
  end if;
  if exists (select 1 from public.staff_roles s where s.user_id = p_user_id)
     and not private.is_admin(v_uid, v_inst) then
    raise exception 'Só um admin pode banir membros da staff.' using errcode = 'PT403';
  end if;

  update public.profiles set banned_at = now()
   where id = p_user_id and banned_at is null;
  if not found then
    raise exception 'Este usuário já está banido.' using errcode = 'PT409';
  end if;

  select u.email into v_email from auth.users u where u.id = p_user_id;

  insert into private.banned_emails (email_hmac, institution_id, banned_by, reason)
  values (private.email_hmac(v_email), v_inst, v_uid, v_motivo)
  on conflict (email_hmac) do nothing;

  delete from public.staff_roles s where s.user_id = p_user_id;

  -- Impede novos logins e encerra as sessões existentes. Um access token já
  -- emitido vale até expirar, mas o RLS (is_active) já não deixa fazer nada.
  update auth.users set banned_until = 'infinity' where id = p_user_id;
  delete from auth.sessions s where s.user_id = p_user_id;

  insert into public.moderation_actions (institution_id, actor_id, action, target_user_id, reason)
  values (v_inst, v_uid, 'banir_usuario', p_user_id, v_motivo);
end
$$;

create function public.desbanir_usuario(p_user_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := private.motivo_obrigatorio(p_motivo);
  v_inst   uuid;
  v_uid    uuid;
  v_email  text;
begin
  select a.institution_id into v_inst from private.accounts a where a.user_id = p_user_id;

  v_uid := private.exigir_staff(v_inst, true);

  update public.profiles set banned_at = null
   where id = p_user_id and banned_at is not null;
  if not found then
    raise exception 'Este usuário não está banido.' using errcode = 'PT409';
  end if;

  select u.email into v_email from auth.users u where u.id = p_user_id;
  delete from private.banned_emails b where b.email_hmac = private.email_hmac(v_email);
  update auth.users set banned_until = null where id = p_user_id;

  insert into public.moderation_actions (institution_id, actor_id, action, target_user_id, reason)
  values (v_inst, v_uid, 'desbanir_usuario', p_user_id, v_motivo);
end
$$;

-- ---------------------------------------------------------------------------
-- Staff: aprovar / recusar avatar pendente
-- ---------------------------------------------------------------------------
create function public.moderar_avatar(p_user_id uuid, p_aprovar boolean, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := private.motivo_obrigatorio(p_motivo);
  v_inst   uuid;
  v_uid    uuid;
  v_path   text;
begin
  select a.institution_id into v_inst from private.accounts a where a.user_id = p_user_id;

  v_uid := private.exigir_staff(v_inst);

  if p_aprovar is null then
    raise exception 'Informe se o avatar foi aprovado ou recusado.' using errcode = 'PT400';
  end if;

  update public.profiles
     set avatar_status = case when p_aprovar then 'aprovado' else 'recusado' end::public.avatar_status
   where id = p_user_id and avatar_status = 'pendente'
  returning avatar_path into v_path;
  if not found then
    raise exception 'Não há avatar pendente para este usuário.' using errcode = 'PT409';
  end if;

  insert into public.moderation_actions (institution_id, actor_id, action, target_user_id, reason, metadata)
  values (
    v_inst, v_uid,
    case when p_aprovar then 'aprovar_avatar' else 'recusar_avatar' end::public.moderation_action_type,
    p_user_id, v_motivo, jsonb_build_object('avatar_path', v_path)
  );
end
$$;

-- ---------------------------------------------------------------------------
-- Staff: resolver denúncia
-- ---------------------------------------------------------------------------
create function public.resolver_denuncia(p_report_id uuid, p_status public.report_status, p_nota text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nota text := private.motivo_obrigatorio(p_nota);
  v_inst uuid;
  v_uid  uuid;
  v_rep  public.reports;
begin
  select * into v_rep from public.reports r where r.id = p_report_id;
  v_inst := v_rep.institution_id;

  v_uid := private.exigir_staff(v_inst);

  if p_status is null or p_status = 'aberta' then
    raise exception 'Status inválido para resolução.' using errcode = 'PT400';
  end if;
  -- Ninguém julga denúncia contra si mesmo nem contra o próprio post.
  if v_rep.profile_id = v_uid
     or exists (select 1 from public.posts po where po.id = v_rep.post_id and po.author_id = v_uid) then
    raise exception 'Você não pode resolver uma denúncia contra você.' using errcode = 'PT403';
  end if;

  update public.reports
     set status = p_status,
         resolution_note = v_nota,
         resolved_by = case when p_status in ('resolvida', 'rejeitada') then v_uid end,
         resolved_at = case when p_status in ('resolvida', 'rejeitada') then now() end
   where id = p_report_id;

  insert into public.moderation_actions (
    institution_id, actor_id, action, target_user_id, target_post_id, report_id, reason, metadata)
  values (
    v_inst, v_uid, 'resolver_denuncia', v_rep.profile_id, v_rep.post_id, p_report_id, v_nota,
    jsonb_build_object('status', p_status));
end
$$;

-- Quem denunciou acompanha as PRÓPRIAS denúncias, sem ver quem resolveu.
create function public.minhas_denuncias()
returns table (
  id uuid,
  post_id uuid,
  profile_id uuid,
  reason public.report_reason,
  status public.report_status,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.post_id, r.profile_id, r.reason, r.status, r.created_at
  from public.reports r
  where r.reporter_id = (select auth.uid())
  order by r.created_at desc
$$;

-- ---------------------------------------------------------------------------
-- Admin: cargos
-- ---------------------------------------------------------------------------
-- O primeiro admin de cada instituição é criado fora da API (SQL/dashboard).
-- Ninguém altera o próprio cargo: evita autopromoção e a instituição ficar
-- sem admin por engano.
create function public.definir_cargo(p_user_id uuid, p_papel public.staff_role, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := private.motivo_obrigatorio(p_motivo);
  v_inst   uuid;
  v_uid    uuid;
begin
  select a.institution_id into v_inst from private.accounts a where a.user_id = p_user_id;

  v_uid := private.exigir_staff(v_inst, true);

  if p_papel is null then
    raise exception 'Informe o cargo.' using errcode = 'PT400';
  end if;
  if p_user_id = v_uid then
    raise exception 'Você não pode alterar o próprio cargo.' using errcode = 'PT400';
  end if;
  if not private.is_active(p_user_id) then
    raise exception 'Só contas ativas podem receber cargo.' using errcode = 'PT400';
  end if;

  insert into public.staff_roles (user_id, institution_id, role, granted_by)
  values (p_user_id, v_inst, p_papel, v_uid)
  on conflict (user_id, institution_id)
  do update set role = excluded.role, granted_by = excluded.granted_by, created_at = now();

  insert into public.moderation_actions (institution_id, actor_id, action, target_user_id, reason, metadata)
  values (v_inst, v_uid, 'conceder_cargo', p_user_id, v_motivo, jsonb_build_object('papel', p_papel));
end
$$;

create function public.remover_cargo(p_user_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := private.motivo_obrigatorio(p_motivo);
  v_inst   uuid;
  v_uid    uuid;
  v_papel  public.staff_role;
begin
  select a.institution_id into v_inst from private.accounts a where a.user_id = p_user_id;

  v_uid := private.exigir_staff(v_inst, true);

  if p_user_id = v_uid then
    raise exception 'Você não pode alterar o próprio cargo.' using errcode = 'PT400';
  end if;

  delete from public.staff_roles s
   where s.user_id = p_user_id and s.institution_id = v_inst
  returning s.role into v_papel;
  if not found then
    raise exception 'Este usuário não tem cargo.' using errcode = 'PT409';
  end if;

  insert into public.moderation_actions (institution_id, actor_id, action, target_user_id, reason, metadata)
  values (v_inst, v_uid, 'remover_cargo', p_user_id, v_motivo, jsonb_build_object('papel', v_papel));
end
$$;

-- ---------------------------------------------------------------------------
-- Admin: responder pedido de tag
-- ---------------------------------------------------------------------------
-- Só registra a decisão. O vocabulário de tags é global (vale para todas as
-- instituições), então a tag em si entra por migration, não por um admin de
-- uma instituição.
create function public.resolver_pedido_tag(p_request_id uuid, p_aprovar boolean, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := private.motivo_obrigatorio(p_motivo);
  v_inst   uuid;
  v_autor  uuid;
  v_uid    uuid;
begin
  select tr.institution_id, tr.user_id into v_inst, v_autor
  from public.tag_requests tr where tr.id = p_request_id;

  v_uid := private.exigir_staff(v_inst, true);

  if p_aprovar is null then
    raise exception 'Informe se o pedido foi aprovado ou recusado.' using errcode = 'PT400';
  end if;

  update public.tag_requests
     set status = case when p_aprovar then 'aprovada' else 'recusada' end::public.tag_request_status,
         resolved_by = v_uid,
         resolved_at = now()
   where id = p_request_id and status = 'pendente';
  if not found then
    raise exception 'Este pedido já foi respondido.' using errcode = 'PT409';
  end if;

  insert into public.moderation_actions (institution_id, actor_id, action, target_user_id, reason, metadata)
  values (v_inst, v_uid, 'resolver_pedido_tag', v_autor, v_motivo,
          jsonb_build_object('tag_request_id', p_request_id, 'aprovado', p_aprovar));
end
$$;

-- ---------------------------------------------------------------------------
-- GRANTs
-- ---------------------------------------------------------------------------
revoke all on function
  private.motivo_obrigatorio(text),
  private.exigir_staff(uuid, boolean)
from public, anon, authenticated;

revoke all on function
  public.apagar_post(uuid),
  public.ocultar_post(uuid, text),
  public.restaurar_post(uuid, text),
  public.banir_usuario(uuid, text),
  public.desbanir_usuario(uuid, text),
  public.moderar_avatar(uuid, boolean, text),
  public.resolver_denuncia(uuid, public.report_status, text),
  public.minhas_denuncias(),
  public.definir_cargo(uuid, public.staff_role, text),
  public.remover_cargo(uuid, text),
  public.resolver_pedido_tag(uuid, boolean, text)
from public, anon;

grant execute on function
  public.apagar_post(uuid),
  public.ocultar_post(uuid, text),
  public.restaurar_post(uuid, text),
  public.banir_usuario(uuid, text),
  public.desbanir_usuario(uuid, text),
  public.moderar_avatar(uuid, boolean, text),
  public.resolver_denuncia(uuid, public.report_status, text),
  public.minhas_denuncias(),
  public.definir_cargo(uuid, public.staff_role, text),
  public.remover_cargo(uuid, text),
  public.resolver_pedido_tag(uuid, boolean, text)
to authenticated;
