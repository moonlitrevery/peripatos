-- =============================================================================
-- 23 · Cargos: quem pode o quê, e as proteções
-- =============================================================================
-- MODERAÇÃO: fila de denúncias, ocultar (e restaurar) post, banir usuário
--   comum, aprovar e recusar avatar.
-- ADMINISTRAÇÃO: tudo da moderação, mais nomear e remover a equipe, aprovar
--   pedidos de tag, conceder conquistas manuais, desbanir e mudar as
--   configurações (fundador_ate, panateneia_inicio, panateneia_fim).
--
-- Proteções, todas aqui:
--   - moderação não age sobre quem é da equipe: não bane, não oculta nem
--     restaura post, não decide foto e não resolve denúncia contra moderador
--     ou admin. Só a administração;
--   - ninguém altera o próprio cargo nem modera a própria foto;
--   - o último admin de uma instituição não é removido nem rebaixado, por
--     nenhum caminho (RPC, banimento, exclusão de conta, SQL direto);
--   - toda mudança de cargo fica em moderation_actions, inclusive a que vem
--     de um banimento;
--   - quem é nomeado recebe notificação. O segundo fator já era exigido de
--     qualquer pessoa com linha em staff_roles (exigir_staff, is_staff,
--     is_admin), então vale para quem acabou de ser nomeado: sem sessão aal2,
--     não age nem lê como equipe.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Moderação não age sobre a equipe
-- ---------------------------------------------------------------------------
-- p_ator já passou por exigir_staff. Se o alvo tem cargo, só admin continua.
create function private.exigir_admin_contra_equipe(p_ator uuid, p_institution_id uuid, p_alvo uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_alvo is not null
     and exists (select 1 from public.staff_roles s where s.user_id = p_alvo)
     and not private.is_admin(p_ator, p_institution_id) then
    raise exception 'Só a administração age sobre quem é da equipe.' using errcode = 'PT403';
  end if;
end
$$;
revoke all on function private.exigir_admin_contra_equipe(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.ocultar_post(p_post_id uuid, p_motivo text)
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
  perform private.exigir_admin_contra_equipe(v_uid, v_inst, v_author);

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

create or replace function public.restaurar_post(p_post_id uuid, p_motivo text)
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
  perform private.exigir_admin_contra_equipe(v_uid, v_inst, v_author);

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

create or replace function public.banir_usuario(p_user_id uuid, p_motivo text)
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
  v_papel  public.staff_role;
begin
  select a.institution_id into v_inst from private.accounts a where a.user_id = p_user_id;

  v_uid := private.exigir_staff(v_inst);

  if p_user_id = v_uid then
    raise exception 'Você não pode banir a si mesmo.' using errcode = 'PT400';
  end if;
  perform private.exigir_admin_contra_equipe(v_uid, v_inst, p_user_id);

  update public.profiles set banned_at = now()
   where id = p_user_id and banned_at is null;
  if not found then
    raise exception 'Este usuário já está banido.' using errcode = 'PT409';
  end if;

  select u.email into v_email from auth.users u where u.id = p_user_id;

  insert into private.banned_emails (email_hmac, institution_id, banned_by, reason)
  values (private.email_hmac(v_email), v_inst, v_uid, v_motivo)
  on conflict (email_hmac) do nothing;

  -- Banir tira o cargo, e a perda do cargo também fica registrada.
  delete from public.staff_roles s where s.user_id = p_user_id returning s.role into v_papel;
  if v_papel is not null then
    insert into public.moderation_actions (institution_id, actor_id, action, target_user_id, reason, metadata)
    values (v_inst, v_uid, 'remover_cargo', p_user_id, v_motivo, jsonb_build_object('papel', v_papel, 'por', 'banimento'));
  end if;

  -- Impede novos logins e encerra as sessões existentes. Um access token já
  -- emitido vale até expirar, mas o RLS (is_active) já não deixa fazer nada.
  update auth.users set banned_until = 'infinity' where id = p_user_id;
  delete from auth.sessions s where s.user_id = p_user_id;

  insert into public.moderation_actions (institution_id, actor_id, action, target_user_id, reason)
  values (v_inst, v_uid, 'banir_usuario', p_user_id, v_motivo);
end
$$;

create or replace function public.moderar_avatar(p_user_id uuid, p_aprovar boolean, p_motivo text)
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

  if p_user_id = v_uid then
    raise exception 'Você não pode moderar a própria foto.' using errcode = 'PT403';
  end if;
  perform private.exigir_admin_contra_equipe(v_uid, v_inst, p_user_id);

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

create or replace function public.resolver_denuncia(p_report_id uuid, p_status public.report_status, p_nota text)
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

  -- Denúncia contra alguém da equipe (o perfil, o post ou a mensagem): só a
  -- administração decide.
  perform private.exigir_admin_contra_equipe(v_uid, v_inst, alvo)
  from (
    select v_rep.profile_id as alvo
    union all select v_rep.message_sender_id
    union all select po.author_id from public.posts po where po.id = v_rep.post_id
  ) x
  where alvo is not null;

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

-- ---------------------------------------------------------------------------
-- Nomear: avisa a pessoa e não repete o que já vale
-- ---------------------------------------------------------------------------
create or replace function public.definir_cargo(p_user_id uuid, p_papel public.staff_role, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := private.motivo_obrigatorio(p_motivo);
  v_inst   uuid;
  v_uid    uuid;
  v_antes  public.staff_role;
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

  select s.role into v_antes from public.staff_roles s where s.user_id = p_user_id and s.institution_id = v_inst;
  if v_antes = p_papel then
    raise exception 'Esta pessoa já tem este cargo.' using errcode = 'PT409';
  end if;

  -- Rebaixar o último admin é barrado pelo trigger de staff_roles.
  insert into public.staff_roles (user_id, institution_id, role, granted_by)
  values (p_user_id, v_inst, p_papel, v_uid)
  on conflict (user_id, institution_id)
  do update set role = excluded.role, granted_by = excluded.granted_by, created_at = now();

  insert into public.moderation_actions (institution_id, actor_id, action, target_user_id, reason, metadata)
  values (v_inst, v_uid, 'conceder_cargo', p_user_id, v_motivo,
          jsonb_build_object('papel', p_papel, 'papel_anterior', v_antes));

  -- A pessoa fica sabendo. A notificação não diz quem nomeou.
  perform private.notificar(p_user_id, 'cargo_concedido');
end
$$;

-- ---------------------------------------------------------------------------
-- O último admin
-- ---------------------------------------------------------------------------
-- No trigger, e não só nas RPCs: vale também para a exclusão de conta (a
-- linha some em cascata), para o banimento e para SQL direto. Quem é o único
-- admin precisa nomear outro antes de sair.
create function private.staff_roles_ultimo_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Só interessa quando um admin deixa de ser admin.
  if old.role <> 'admin' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and new.role = 'admin' and new.institution_id = old.institution_id and new.user_id = old.user_id then
    return new;
  end if;
  -- Dois admins se removendo ao mesmo tempo: um de cada vez.
  perform pg_advisory_xact_lock(hashtextextended('peripatos:admins:' || old.institution_id::text, 0));
  if not exists (
    select 1 from public.staff_roles s
    where s.institution_id = old.institution_id and s.role = 'admin' and s.user_id <> old.user_id
  ) then
    raise exception 'A instituição não pode ficar sem administração. Nomeie outra pessoa como admin antes.'
      using errcode = 'PT409';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;
revoke all on function private.staff_roles_ultimo_admin() from public, anon, authenticated;

create trigger staff_roles_ultimo_admin
  before delete or update on public.staff_roles
  for each row execute function private.staff_roles_ultimo_admin();

-- ---------------------------------------------------------------------------
-- A notificação de quem foi nomeado
-- ---------------------------------------------------------------------------
-- Não aponta para ninguém (actor_id nulo), como a de conquista: a restrição
-- notifications_forma já aceita. Não vira push: quer_push devolve falso para
-- tipo que não conhece.

-- ---------------------------------------------------------------------------
-- Configurações: só admin, sempre com registro
-- ---------------------------------------------------------------------------
-- private.config continua fora da API. Estas duas RPCs são a única porta, e
-- só para as três datas abaixo: o hash do enigma não entra.
-- ATENÇÃO: private.config é uma só para o banco inteiro. Enquanto houver uma
-- instituição isso não muda nada; com mais de uma, a admin de qualquer delas
-- muda a data para todas.
create function private.config_editavel(p_chave text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_chave in ('fundador_ate', 'panateneia_inicio', 'panateneia_fim')
$$;
revoke all on function private.config_editavel(text) from public, anon, authenticated;

create function public.configuracoes()
returns table (chave text, valor timestamptz, atualizado_em timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.exigir_staff(private.my_institution(), true);
  return query
  select k.chave, c.valor::timestamptz, c.atualizado_em
  from unnest(array['fundador_ate', 'panateneia_inicio', 'panateneia_fim']) with ordinality as k (chave, ord)
  left join private.config c on c.chave = k.chave
  order by k.ord;
end
$$;

-- p_valor nulo apaga a chave (o beta volta a ficar aberto; a Panateneia fica
-- sem janela).
create function public.definir_configuracao(p_chave text, p_valor timestamptz, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := private.motivo_obrigatorio(p_motivo);
  v_inst   uuid := private.my_institution();
  v_uid    uuid;
  v_antes  text;
  v_inicio timestamptz;
  v_fim    timestamptz;
begin
  v_uid := private.exigir_staff(v_inst, true);

  if p_chave is null or not private.config_editavel(p_chave) then
    raise exception 'Esta configuração não existe.' using errcode = 'PT400';
  end if;

  select c.valor into v_antes from private.config c where c.chave = p_chave;
  if v_antes is null and p_valor is null then
    raise exception 'Esta configuração já está vazia.' using errcode = 'PT409';
  end if;

  if p_valor is null then
    delete from private.config c where c.chave = p_chave;
  else
    insert into private.config (chave, valor) values (p_chave, p_valor::text)
    on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
  end if;

  -- A janela da Panateneia precisa ter começo antes do fim.
  select c.valor::timestamptz into v_inicio from private.config c where c.chave = 'panateneia_inicio';
  select c.valor::timestamptz into v_fim from private.config c where c.chave = 'panateneia_fim';
  if v_inicio is not null and v_fim is not null and v_fim <= v_inicio then
    raise exception 'O fim da Panateneia precisa ser depois do início.' using errcode = 'PT400';
  end if;

  insert into public.moderation_actions (institution_id, actor_id, action, reason, metadata)
  values (v_inst, v_uid, 'alterar_configuracao', v_motivo,
          jsonb_build_object('chave', p_chave, 'de', v_antes::timestamptz, 'para', p_valor));
end
$$;

revoke all on function public.configuracoes(), public.definir_configuracao(text, timestamptz, text) from public, anon;
grant execute on function public.configuracoes(), public.definir_configuracao(text, timestamptz, text) to authenticated;
