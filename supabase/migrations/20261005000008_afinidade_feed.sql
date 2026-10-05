-- =============================================================================
-- 08 · Afinidade, pessoas parecidas e feed
-- =============================================================================
-- Tudo aqui calcula para auth.uid(). Nenhuma RPC pública aceita "leitor" por
-- parâmetro: senão qualquer um pediria a afinidade (e as tags em comum) de
-- outra pessoa.
--
-- PESO DE CADA TAG
--   tag comum:    ln(usuários ativos da instituição / usuários ativos com a tag)
--                 (IDF: tag rara pesa mais; tag que todo mundo tem pesa zero)
--   tag sensível: ln(usuários ativos da instituição) / 2   <- peso FIXO
--
--   O peso fixo é deliberado. Com IDF, o peso de uma tag sensível dependeria de
--   quantas pessoas a marcaram; como os pesos das tags comuns são calculáveis
--   por qualquer um (profile_tags é legível), bastaria olhar a própria
--   afinidade com um mutual para descobrir quantas pessoas da instituição
--   marcaram, por exemplo, uma religião ou orientação. ln(N)/2 equivale ao IDF
--   de uma tag que √N pessoas têm e não depende de nenhuma contagem sensível.
--
-- AFINIDADE(leitor, outro)
--   soma dos pesos das tags em comum / soma dos pesos das tags do leitor.
--   Tags sensíveis só entram (no numerador E no denominador) quando os dois
--   são mutuals. Fora disso elas não existem para a conta, então nem o valor
--   nem a ordenação dizem nada sobre quem tem tag sensível.
-- =============================================================================

-- Afinidade do leitor com cada pessoa VISÍVEL para ele: ativa, da mesma
-- instituição, sem bloqueio em nenhuma direção, e que não é ele mesmo.
-- Leitor inativo recebe zero linhas.
create function private.afinidades(p_reader uuid)
returns table (
  user_id uuid,
  afinidade double precision,
  tags_em_comum integer[],
  mutual boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select a.institution_id
    from private.accounts a
    where a.user_id = p_reader
      and private.is_active(p_reader)
  ),
  ativos as materialized (
    select p.id
    from public.profiles p
    join private.accounts a on a.user_id = p.id
    join me on me.institution_id = p.institution_id
    where p.onboarding_completo
      and p.banned_at is null
      and a.birth_date <= private.adult_cutoff()
  ),
  n as (
    select count(*)::double precision as total from ativos
  ),
  pesos as (
    select pt.tag_id, ln(n.total / count(*)::double precision) as peso
    from public.profile_tags pt
    join ativos on ativos.id = pt.user_id
    cross join n
    group by pt.tag_id, n.total
  ),
  candidatos as materialized (
    select at.id, private.is_mutual(p_reader, at.id) as mutual
    from ativos at
    where at.id <> p_reader
      and not private.is_blocked(p_reader, at.id)
  ),
  minhas as materialized (
    select pt.tag_id, pesos.peso, false as sensivel
    from public.profile_tags pt
    join pesos on pesos.tag_id = pt.tag_id
    where pt.user_id = p_reader
    union all
    select st.tag_id, ln(n.total) / 2, true
    from public.profile_sensitive_tags st
    cross join n
    where st.user_id = p_reader
  ),
  totais as (
    select
      coalesce(sum(m.peso) filter (where not m.sensivel), 0) as comuns,
      coalesce(sum(m.peso) filter (where m.sensivel), 0) as sensiveis
    from minhas m
  ),
  em_comum as (
    select c.id, sum(m.peso) as soma, array_agg(m.tag_id order by m.tag_id) as tags
    from candidatos c
    join minhas m on (
      (
        not m.sensivel
        and exists (
          select 1 from public.profile_tags o
          where o.user_id = c.id and o.tag_id = m.tag_id
        )
      )
      or (
        m.sensivel
        and c.mutual
        and exists (
          select 1 from public.profile_sensitive_tags o
          where o.user_id = c.id and o.tag_id = m.tag_id
        )
      )
    )
    group by c.id
  )
  select
    c.id,
    coalesce(
      ec.soma / nullif(t.comuns + case when c.mutual then t.sensiveis else 0 end, 0),
      0
    )::double precision,
    coalesce(ec.tags, '{}'::integer[]),
    c.mutual
  from candidatos c
  cross join totais t
  left join em_comum ec on ec.id = c.id
$$;

revoke all on function private.afinidades(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- public.afinidade(outro): de quem chama com outra pessoa. NULL se a pessoa
-- não é visível (outra instituição, bloqueio, banida, inativa).
-- ---------------------------------------------------------------------------
create function public.afinidade(p_outro uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select round(a.afinidade::numeric, 4)
  from private.afinidades((select auth.uid())) a
  where a.user_id = p_outro
$$;

-- ---------------------------------------------------------------------------
-- public.pessoas_parecidas(limite)
-- ---------------------------------------------------------------------------
create function public.pessoas_parecidas(p_limite integer default 20)
returns table (
  user_id uuid,
  username text,
  display_name text,
  bio text,
  avatar_path text,
  afinidade numeric,
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
    round(a.afinidade::numeric, 4),
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

-- ---------------------------------------------------------------------------
-- public.feed(cursor, limite)
-- ---------------------------------------------------------------------------
-- score = 0.6 * afinidade com o autor + 0.4 * exp(-horas / 24)
--
-- Dois fluxos, intercalados 3:1:
--   afinidade  -> autores com ao menos uma tag em comum, por score
--   descoberta -> autores sem nenhuma tag em comum, do mais recente ao mais
--                 antigo. Ocupa as posições 4, 8, 12...
-- Se um fluxo acaba, o outro preenche: sem bolha e sem feed vazio.
--
-- Janela: só os 500 posts visíveis mais recentes dos últimos 30 dias entram
-- no ranqueamento, para nunca ordenar a tabela inteira.
--
-- Paginação estável: o cursor é "<instante em microssegundos>:<offset>".
-- O instante é fixado na primeira página e vira o "agora" de todas as
-- seguintes: a recência não se move entre páginas e posts criados depois da
-- primeira página não entram (aparecem ao recarregar do zero). `next_cursor`
-- vem igual em todas as linhas e é NULL na última página.
--
-- Os próprios posts não entram no feed.
create function public.feed(p_cursor text default null, p_limite integer default 20)
returns table (
  post_id uuid,
  author_id uuid,
  username text,
  display_name text,
  avatar_path text,
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
  -- o cursor guarda microssegundos; garante que esta página e as próximas
  -- usem exatamente o mesmo instante
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
    -- afinidade: 1,2,3, 5,6,7, 9...   descoberta: 4, 8, 12...
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

revoke all on function
  public.afinidade(uuid),
  public.pessoas_parecidas(integer),
  public.feed(text, integer)
from public, anon;

grant execute on function
  public.afinidade(uuid),
  public.pessoas_parecidas(integer),
  public.feed(text, integer)
to authenticated;
