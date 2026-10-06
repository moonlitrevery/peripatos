-- =============================================================================
-- 11 · O que a interface precisa: avatar pronto, RPCs mais completas e
--      exclusão de conta (LGPD)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Avatares prontos
-- ---------------------------------------------------------------------------
-- 12 avatares desenhados, sem foto. O número é só um índice: não há arquivo,
-- não há upload, não há moderação. A foto enviada (avatar_path) só substitui o
-- avatar pronto depois de aprovada.
alter table public.profiles
  add column avatar_preset smallint check (avatar_preset between 1 and 12);

grant update (avatar_preset) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- pessoas_parecidas e feed passam a devolver avatar_preset; pessoas_parecidas
-- devolve também se é mutual (o selo da tela /gente).
-- Mudar o tipo de retorno exige recriar a função; a lógica é a mesma de 08.
-- ---------------------------------------------------------------------------
drop function public.pessoas_parecidas(integer);
drop function public.feed(text, integer);

create function public.pessoas_parecidas(p_limite integer default 20)
returns table (
  user_id uuid,
  username text,
  display_name text,
  bio text,
  avatar_path text,
  avatar_preset smallint,
  afinidade numeric,
  mutual boolean,
  tags_em_comum jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.username,
    p.display_name,
    p.bio,
    case when p.avatar_status = 'aprovado' then p.avatar_path end,
    p.avatar_preset,
    round(a.afinidade::numeric, 4),
    a.mutual,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', t.id, 'slug', t.slug, 'nome', t.name,
            'categoria', t.category, 'sensivel', t.is_sensitive
          )
          order by t.is_sensitive, t.name
        )
        from public.tags t
        where t.id = any (a.tags_em_comum)
      ),
      '[]'::jsonb
    )
  from private.afinidades((select auth.uid())) a
  join public.profiles p on p.id = a.user_id
  order by a.afinidade desc, p.id
  limit least(greatest(coalesce(p_limite, 20), 1), 50)
$$;

create function public.feed(p_cursor text default null, p_limite integer default 20)
returns table (
  post_id uuid,
  author_id uuid,
  username text,
  display_name text,
  avatar_path text,
  avatar_preset smallint,
  body text,
  gif_id text,
  created_at timestamptz,
  edited_at timestamptz,
  afinidade numeric,
  score numeric,
  origem text,
  next_cursor text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid    uuid := auth.uid();
  v_inst   uuid;
  v_ts     timestamptz := now();
  v_offset integer := 0;
  v_limit  integer := least(greatest(coalesce(p_limite, 20), 1), 50);
  v_micros bigint;
begin
  if v_uid is null then
    raise exception 'Login necessário.' using errcode = 'PT401';
  end if;
  if not private.is_active(v_uid) then
    return;
  end if;
  v_inst := private.my_institution();

  if p_cursor is not null then
    if p_cursor !~ '^[0-9]{1,18}:[0-9]{1,4}$' then
      raise exception 'Cursor inválido.' using errcode = 'PT400';
    end if;
    v_ts := 'epoch'::timestamptz + split_part(p_cursor, ':', 1)::bigint * interval '1 microsecond';
    v_offset := split_part(p_cursor, ':', 2)::integer;
    if v_ts > now() or v_ts < now() - interval '6 hours' then
      raise exception 'Cursor expirado: recarregue o feed.' using errcode = 'PT400';
    end if;
  end if;

  v_micros := (extract(epoch from v_ts) * 1000000)::bigint;
  v_ts := 'epoch'::timestamptz + v_micros * interval '1 microsecond';

  return query
  with af as materialized (
    select a.user_id, a.afinidade, cardinality(a.tags_em_comum) > 0 as tem_comum
    from private.afinidades(v_uid) a
  ),
  janela as (
    select po.id, po.author_id, po.body, po.gif_id, po.created_at, po.edited_at,
           af.afinidade, af.tem_comum
    from public.posts po
    join af on af.user_id = po.author_id
    where po.institution_id = v_inst
      and po.deleted_at is null
      and po.hidden_at is null
      and po.created_at <= v_ts
      and po.created_at > v_ts - interval '30 days'
    order by po.created_at desc, po.id desc
    limit 500
  ),
  pontuado as (
    select j.*,
           0.6 * j.afinidade
             + 0.4 * exp(-(extract(epoch from (v_ts - j.created_at)) / 3600.0)::double precision / 24.0) as score
    from janela j
  ),
  ranqueado as (
    select pt.*,
           case
             when pt.tem_comum then
               row_number() over (partition by pt.tem_comum order by pt.score desc, pt.created_at desc, pt.id desc)
             else
               row_number() over (partition by pt.tem_comum order by pt.created_at desc, pt.id desc)
           end as rk
    from pontuado pt
  ),
  intercalado as (
    select r.*,
           case when r.tem_comum then r.rk + (r.rk - 1) / 3 else r.rk * 4 end as pos,
           count(*) over () as total
    from ranqueado r
  )
  select
    i.id,
    i.author_id,
    p.username,
    p.display_name,
    case when p.avatar_status = 'aprovado' then p.avatar_path end,
    p.avatar_preset,
    i.body,
    i.gif_id,
    i.created_at,
    i.edited_at,
    round(i.afinidade::numeric, 4),
    round(i.score::numeric, 6),
    case when i.tem_comum then 'afinidade' else 'descoberta' end,
    case when i.total > v_offset + v_limit
         then v_micros::text || ':' || (v_offset + v_limit)::text
    end
  from intercalado i
  join public.profiles p on p.id = i.author_id
  order by i.pos
  offset v_offset
  limit v_limit;
end
$$;

-- ---------------------------------------------------------------------------
-- Excluir a própria conta (LGPD, art. 18)
-- ---------------------------------------------------------------------------
-- Apaga o usuário do Auth; as FKs em cascata levam junto perfil, conta
-- privada (RA, data de nascimento), posts, tags comuns e sensíveis, follows,
-- blocks, denúncias feitas e recebidas, pedidos de tag, cargo e sessões.
--
-- ARQUIVOS: os avatares precisam ser apagados ANTES, pela Storage API, com a
-- sessão da própria pessoa. Apagar só a linha de storage.objects deixaria o
-- arquivo órfão no disco/S3, e isso não é excluir. Por isso a função se recusa
-- a rodar enquanto existir arquivo: quem chama apaga os arquivos e tenta de
-- novo. (A interface faz os dois passos em sequência.)
--
-- O QUE FICA, e por quê:
--   - private.banned_emails: se a pessoa foi banida, o HMAC do e-mail continua.
--     Sem isso, excluir a conta seria um jeito de desfazer o próprio banimento.
--   - public.moderation_actions: a trilha de auditoria continua, sem apontar
--     para a conta (actor_id / target_user_id viram NULL). No lugar fica o
--     HMAC do e-mail em metadata, para a staff reconhecer reincidência se o
--     mesmo e-mail voltar. O HMAC não é reversível sem o segredo do Vault.
-- Nada mais é mantido: nem e-mail, nem RA, nem conteúdo.
--
-- p_confirmacao precisa ser exatamente 'EXCLUIR': trava contra chamada por
-- engano. Não há parâmetro de usuário: só se exclui a própria conta.
create function public.excluir_conta(p_confirmacao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_hmac  text;
begin
  if v_uid is null then
    raise exception 'Login necessário.' using errcode = 'PT401';
  end if;
  if p_confirmacao is distinct from 'EXCLUIR' then
    raise exception 'Confirmação inválida: envie EXCLUIR para apagar a conta.' using errcode = 'PT400';
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid for update;
  if not found then
    raise exception 'Conta não encontrada.' using errcode = 'PT404';
  end if;

  if exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'avatars'
      and private.avatar_owner(o.name) = v_uid
  ) then
    raise exception 'Apague seus arquivos de avatar antes de excluir a conta.' using errcode = 'PT409';
  end if;

  v_hmac := encode(private.email_hmac(v_email), 'hex');

  update public.moderation_actions
     set metadata = metadata || jsonb_build_object('alvo_excluido_hmac', v_hmac)
   where target_user_id = v_uid;
  update public.moderation_actions
     set metadata = metadata || jsonb_build_object('ator_excluido_hmac', v_hmac)
   where actor_id = v_uid;

  delete from auth.users where id = v_uid;
end
$$;

revoke all on function
  public.pessoas_parecidas(integer),
  public.feed(text, integer),
  public.excluir_conta(text)
from public, anon;

grant execute on function
  public.pessoas_parecidas(integer),
  public.feed(text, integer),
  public.excluir_conta(text)
to authenticated;
