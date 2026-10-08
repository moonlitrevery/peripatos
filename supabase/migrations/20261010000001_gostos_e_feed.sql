-- =============================================================================
-- 18 · Tags sensíveis não são gostos; feed por hora, em duas abas
-- =============================================================================
-- 1. Orientação sexual, identidade de gênero e religião saem da afinidade e
--    das "tags em comum" em TODOS os casos, inclusive entre mutuals. Ter a
--    mesma orientação não é compatibilidade, e tratar como tal dá cara de app
--    de namoro. Continuam visíveis só para mutuals (isso não muda: é o RLS de
--    profile_sensitive_tags), mas não contam para nada.
-- 2. O feed deixa de ordenar por score. A afinidade decide QUEM aparece; a
--    hora decide a ORDEM. Duas RPCs, uma por aba: feed_para_voce e
--    feed_seguindo, as duas com paginação por (created_at, id).
-- 3. A função de score antiga fica guardada, sem uso, em private.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · Afinidade só com tags comuns
-- ---------------------------------------------------------------------------
-- AFINIDADE(leitor, outro) = soma dos pesos IDF das tags COMUNS que os dois
-- têm / soma dos pesos das tags comuns do leitor. profile_sensitive_tags não
-- é lida aqui: a afinidade, a ordem das sugestões e as "tags em comum" não
-- dependem de tag sensível de ninguém, seja qual for a relação entre os dois.
create or replace function private.afinidades(p_reader uuid)
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
      and a.maioridade_verificada_em is not null
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
    select pt.tag_id, pesos.peso
    from public.profile_tags pt
    join pesos on pesos.tag_id = pt.tag_id
    where pt.user_id = p_reader
  ),
  total as (
    select coalesce(sum(m.peso), 0) as soma from minhas m
  ),
  em_comum as (
    select c.id, sum(m.peso) as soma, array_agg(m.tag_id order by m.tag_id) as tags
    from candidatos c
    join minhas m on exists (
      select 1 from public.profile_tags o
      where o.user_id = c.id and o.tag_id = m.tag_id
    )
    group by c.id
  )
  select
    c.id,
    coalesce(ec.soma / nullif(t.soma, 0), 0)::double precision,
    coalesce(ec.tags, '{}'::integer[]),
    c.mutual
  from candidatos c
  cross join total t
  left join em_comum ec on ec.id = c.id
$$;

-- pessoas_parecidas: mesma assinatura. O filtro "not t.is_sensitive" é a
-- segunda trava: mesmo que afinidades() voltasse a devolver uma tag sensível,
-- ela não sairia daqui.
create or replace function public.pessoas_parecidas(p_limite integer default 20)
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
            'categoria', t.category, 'sensivel', false
          )
          order by t.name
        )
        from public.tags t
        where t.id = any (a.tags_em_comum) and not t.is_sensitive
      ),
      '[]'::jsonb
    )
  from private.afinidades((select auth.uid())) a
  join public.profiles p on p.id = a.user_id
  order by a.afinidade desc, p.id
  limit least(greatest(coalesce(p_limite, 20), 1), 50)
$$;

-- ---------------------------------------------------------------------------
-- 3 · O feed por score sai de cena, mas fica guardado
-- ---------------------------------------------------------------------------
-- SEM USO. Era public.feed: ordenava por
--     score = 0,6 x afinidade + 0,4 x exp(-idade em horas / 24)
-- e intercalava 3:1 com a "descoberta". Com pouco volume de posts a ordem
-- parecia aleatória (um post de ontem de alguém muito parecido passava na
-- frente de um de agora), e por isso o feed passou a ser por hora.
-- Fica aqui para quando o volume justificar ranqueamento: nenhum papel da API
-- executa. Para voltar a usar, uma migration cria uma RPC em public que chame
-- esta (ou a mova de volta) e a inclui na lista de 000_meta.sql.
-- O cursor dela é "<instante em microssegundos>:<offset>".
alter function public.feed(text, integer) set schema private;
alter function private.feed(text, integer) rename to feed_por_score;
revoke all on function private.feed_por_score(text, integer) from public, anon, authenticated;
comment on function private.feed_por_score(text, integer) is
  'SEM USO. Feed antigo, ordenado por score (0,6 x afinidade + 0,4 x recência). Guardado para quando o volume justificar ranqueamento.';

-- ---------------------------------------------------------------------------
-- 2 · As duas abas do Início
-- ---------------------------------------------------------------------------
-- Vale para as duas, e é o que já valia: só posts da instituição de quem lê,
-- não apagados nem ocultados, de autores visíveis (conta ativa, não banida,
-- sem bloqueio em nenhuma direção). Leitor inativo recebe zero linhas. Os
-- próprios posts não entram. Quem não aceitou a versão vigente dos Termos lê
-- normalmente e não publica (isso é das políticas de INSERT, não daqui).
--
-- Paginação por (created_at, id): a página seguinte é "o que é mais antigo do
-- que o último post que eu já vi". Post novo não empurra nada, post apagado
-- não faz pular nenhum, e não há offset.

-- Um instante em microssegundos desde 1970, e de volta.
create function private.em_micros(p_quando timestamptz)
returns bigint
language sql
immutable
set search_path = ''
as $$ select (extract(epoch from p_quando) * 1000000)::bigint $$;

create function private.de_micros(p_micros bigint)
returns timestamptz
language sql
immutable
set search_path = ''
as $$ select 'epoch'::timestamptz + p_micros * interval '1 microsecond' $$;

revoke all on function private.em_micros(timestamptz), private.de_micros(bigint) from public, anon, authenticated;

-- "Seguindo": só quem eu sigo, do mais recente para o mais antigo, sem nada
-- intercalado. Cursor: "<micros>_<id do último post>".
create function public.feed_seguindo(p_cursor text default null, p_limite integer default 20)
returns table (
  post_id uuid,
  author_id uuid,
  username text,
  display_name text,
  avatar_path text,
  avatar_preset smallint,
  body text,
  gif_id text,
  gif_alt text,
  created_at timestamptz,
  edited_at timestamptz,
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
  v_uid   uuid := auth.uid();
  v_inst  uuid;
  v_limit integer := least(greatest(coalesce(p_limite, 20), 1), 50);
  v_ts    timestamptz := now();
  v_id    uuid := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
begin
  if v_uid is null then
    raise exception 'Login necessário.' using errcode = 'PT401';
  end if;
  if not private.is_active(v_uid) then
    return;
  end if;
  v_inst := private.my_institution();

  if p_cursor is not null then
    if p_cursor !~ '^[0-9]{1,18}_[0-9a-f-]{36}$' then
      raise exception 'Cursor inválido.' using errcode = 'PT400';
    end if;
    v_ts := private.de_micros(split_part(p_cursor, '_', 1)::bigint);
    begin
      v_id := split_part(p_cursor, '_', 2)::uuid;
    exception when others then
      raise exception 'Cursor inválido.' using errcode = 'PT400';
    end;
  end if;

  return query
  with pagina as (
    select po.id, po.author_id, po.body, po.gif_id, po.gif_alt, po.created_at, po.edited_at
    from public.posts po
    join public.follows f on f.followee_id = po.author_id and f.follower_id = v_uid
    where po.institution_id = v_inst
      and po.deleted_at is null
      and po.hidden_at is null
      and (po.created_at, po.id) < (v_ts, v_id)
      and private.can_see(v_uid, po.author_id)
    order by po.created_at desc, po.id desc
    limit v_limit + 1
  ),
  numerada as (
    select pg.*, row_number() over (order by pg.created_at desc, pg.id desc) as rk, count(*) over () as total
    from pagina pg
  )
  select
    n.id, n.author_id, p.username, p.display_name,
    case when p.avatar_status = 'aprovado' then p.avatar_path end,
    p.avatar_preset,
    n.body, n.gif_id, n.gif_alt, n.created_at, n.edited_at,
    'seguindo'::text,
    case when n.total > v_limit then (
      select private.em_micros(u.created_at)::text || '_' || u.id::text from numerada u where u.rk = v_limit
    ) end
  from numerada n
  join public.profiles p on p.id = n.author_id
  where n.rk <= v_limit
  order by n.rk;
end
$$;

-- "Para você": dois fluxos, cada um do mais recente para o mais antigo.
--   círculo -> quem eu sigo, e quem tem ao menos um gosto em comum comigo
--   fora    -> o resto da instituição ("Fora do seu círculo")
-- A afinidade só decide em qual dos dois a pessoa cai. A ordem dentro de cada
-- um é a hora. A cada três posts do círculo entra um de fora; se um fluxo
-- acaba, o outro preenche.
--
-- Cursor: "<micros>_<id>_<micros>_<id>_<k>": até onde já vi o círculo, até
-- onde já vi os de fora, e quantos posts do círculo saíram desde o último de
-- fora (0 a 3), para a cadência 3:1 continuar de uma página para a outra.
create function public.feed_para_voce(p_cursor text default null, p_limite integer default 20)
returns table (
  post_id uuid,
  author_id uuid,
  username text,
  display_name text,
  avatar_path text,
  avatar_preset smallint,
  body text,
  gif_id text,
  gif_alt text,
  created_at timestamptz,
  edited_at timestamptz,
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
  v_uid   uuid := auth.uid();
  v_inst  uuid;
  v_limit integer := least(greatest(coalesce(p_limite, 20), 1), 50);
  v_ts_c  timestamptz := now();
  v_id_c  uuid := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  v_ts_f  timestamptz := now();
  v_id_f  uuid := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  v_k     integer := 0;
begin
  if v_uid is null then
    raise exception 'Login necessário.' using errcode = 'PT401';
  end if;
  if not private.is_active(v_uid) then
    return;
  end if;
  v_inst := private.my_institution();

  if p_cursor is not null then
    if p_cursor !~ '^[0-9]{1,18}_[0-9a-f-]{36}_[0-9]{1,18}_[0-9a-f-]{36}_[0-3]$' then
      raise exception 'Cursor inválido.' using errcode = 'PT400';
    end if;
    begin
      v_ts_c := private.de_micros(split_part(p_cursor, '_', 1)::bigint);
      v_id_c := split_part(p_cursor, '_', 2)::uuid;
      v_ts_f := private.de_micros(split_part(p_cursor, '_', 3)::bigint);
      v_id_f := split_part(p_cursor, '_', 4)::uuid;
      v_k    := split_part(p_cursor, '_', 5)::integer;
    exception when others then
      raise exception 'Cursor inválido.' using errcode = 'PT400';
    end;
  end if;

  return query
  with visiveis as materialized (
    -- quem é visível para mim, e de que lado fica
    select a.user_id,
           (cardinality(a.tags_em_comum) > 0
            or exists (select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = a.user_id)) as circulo
    from private.afinidades(v_uid) a
  ),
  do_circulo as (
    select po.id, po.author_id, po.body, po.gif_id, po.gif_alt, po.created_at, po.edited_at, true as circulo
    from public.posts po
    join visiveis v on v.user_id = po.author_id and v.circulo
    where po.institution_id = v_inst
      and po.deleted_at is null
      and po.hidden_at is null
      and (po.created_at, po.id) < (v_ts_c, v_id_c)
    order by po.created_at desc, po.id desc
    limit v_limit + 1
  ),
  de_fora as (
    select po.id, po.author_id, po.body, po.gif_id, po.gif_alt, po.created_at, po.edited_at, false as circulo
    from public.posts po
    join visiveis v on v.user_id = po.author_id and not v.circulo
    where po.institution_id = v_inst
      and po.deleted_at is null
      and po.hidden_at is null
      and (po.created_at, po.id) < (v_ts_f, v_id_f)
    order by po.created_at desc, po.id desc
    limit v_limit + 1
  ),
  juntos as (
    select d.*, row_number() over (order by d.created_at desc, d.id desc) as rk from do_circulo d
    union all
    select d.*, row_number() over (order by d.created_at desc, d.id desc) as rk from de_fora d
  ),
  -- Posição na fila intercalada. O g-ésimo post do círculo (contando os k que
  -- já saíram desde o último de fora) fica em g + (g-1)/3; o j-ésimo de fora
  -- fica em 4j, isto é, logo depois do 3j-ésimo do círculo.
  posicionados as (
    select j.*,
           case when j.circulo then (v_k + j.rk) + (v_k + j.rk - 1) / 3 else j.rk * 4 end as pos
    from juntos j
  ),
  ordenados as (
    select p.*, row_number() over (order by p.pos, p.circulo desc) as ordem, count(*) over () as total
    from posicionados p
  ),
  pagina as (
    select o.* from ordenados o where o.ordem <= v_limit
  ),
  -- Para o cursor seguinte: o último de cada fluxo que saiu nesta página, e
  -- quantos do círculo vieram depois do último de fora.
  resumo as (
    select
      (select private.em_micros(x.created_at)::text || '_' || x.id::text
         from pagina x where x.circulo order by x.ordem desc limit 1) as ult_c,
      (select private.em_micros(x.created_at)::text || '_' || x.id::text
         from pagina x where not x.circulo order by x.ordem desc limit 1) as ult_f,
      (select max(x.ordem) from pagina x where not x.circulo) as ordem_f,
      (select count(*) from pagina x where x.circulo) as n_c,
      (select max(o.total) from ordenados o) as total
  ),
  proximo as (
    select case when r.total > v_limit then
             coalesce(r.ult_c, private.em_micros(v_ts_c)::text || '_' || v_id_c::text)
             || '_' ||
             coalesce(r.ult_f, private.em_micros(v_ts_f)::text || '_' || v_id_f::text)
             || '_' ||
             least(
               case when r.ordem_f is null then v_k + r.n_c
                    else (select count(*) from pagina x where x.circulo and x.ordem > r.ordem_f)
               end, 3)::text
           end as cursor
    from resumo r
  )
  select
    pg.id, pg.author_id, p.username, p.display_name,
    case when p.avatar_status = 'aprovado' then p.avatar_path end,
    p.avatar_preset,
    pg.body, pg.gif_id, pg.gif_alt, pg.created_at, pg.edited_at,
    case when pg.circulo then 'circulo' else 'descoberta' end,
    (select px.cursor from proximo px)
  from pagina pg
  join public.profiles p on p.id = pg.author_id
  order by pg.ordem;
end
$$;

revoke all on function public.feed_seguindo(text, integer), public.feed_para_voce(text, integer) from public, anon;
grant execute on function public.feed_seguindo(text, integer), public.feed_para_voce(text, integer) to authenticated;
