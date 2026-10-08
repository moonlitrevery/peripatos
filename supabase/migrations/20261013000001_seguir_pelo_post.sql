-- =============================================================================
-- 21 · Seguir pelo post
-- =============================================================================
-- Quem segue alguém a partir de um post pode registrar de qual post veio, e a
-- notificação de novo seguidor passa a dizer "te seguiu pelo seu post: …".
--
-- Regras, todas impostas aqui:
--   - a origem é opcional e só existe quando a pessoa seguiu por um post;
--   - o post tem de ser de QUEM ESTÁ SENDO SEGUIDO, e estar no ar. Como só se
--     segue quem se pode ver (mesma instituição, sem bloqueio), a origem nunca
--     aponta para post de outra pessoa nem de outra instituição;
--   - só a pessoa seguida fica sabendo, pela própria aba de notificações.
--     Nenhum papel da API lê a coluna da origem: não dá para listar nem contar
--     quantos follows um post trouxe;
--   - post apagado ou ocultado: a notificação continua, sem o trecho.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A origem do follow
-- ---------------------------------------------------------------------------
-- ON DELETE SET NULL: excluir a conta apaga os posts, e o follow de quem
-- seguiu por um deles continua existindo, sem origem.
alter table public.follows
  add column via_post_id uuid references public.posts (id) on delete set null;
create index follows_via_post on public.follows (via_post_id) where via_post_id is not null;

-- A leitura de follows passa a ser por coluna, e via_post_id fica de fora:
-- quem participa da relação continua vendo que ela existe e desde quando, e
-- ninguém lê de onde ela veio.
revoke select on public.follows from authenticated;
grant select (follower_id, followee_id, created_at) on public.follows to authenticated;
grant insert (via_post_id) on public.follows to authenticated;

-- Mesma resposta para "não existe", "foi apagado" e "é de outra pessoa": a
-- recusa não confirma a existência de post nenhum. O nome do trigger o põe
-- antes do rate limit: tentativa recusada não gasta o limite de follows.
create function private.follows_confere_origem()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.via_post_id is not null and not exists (
    select 1 from public.posts p
    where p.id = new.via_post_id
      and p.author_id = new.followee_id
      and p.deleted_at is null
      and p.hidden_at is null
  ) then
    raise exception 'Este post não pode ser a origem deste follow.' using errcode = 'PT422';
  end if;
  return new;
end
$$;

create trigger follows_origem
  before insert on public.follows
  for each row execute function private.follows_confere_origem();

-- ---------------------------------------------------------------------------
-- A notificação guarda o post
-- ---------------------------------------------------------------------------
-- Só "novo seguidor" tem post. Se a conta de quem seguiu é excluída, a
-- notificação some (actor_id é ON DELETE CASCADE); se o post some, fica a
-- notificação sem ele.
alter table public.notifications
  add column post_id uuid references public.posts (id) on delete set null,
  add constraint notifications_post_so_de_seguidor check (post_id is null or type = 'novo_seguidor');
create index notifications_do_post on public.notifications (post_id) where post_id is not null;

-- notificar() ganha o post. É um parâmetro a mais, então a função antiga sai.
drop function private.notificar(uuid, public.notification_type, uuid, text);

create function private.notificar(
  p_uid uuid,
  p_tipo public.notification_type,
  p_ator uuid default null,
  p_conquista text default null,
  p_post uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_uid is null or p_uid = p_ator then
    return;
  end if;
  if p_ator is not null then
    if private.is_blocked(p_uid, p_ator) then
      return;
    end if;
    -- Seguir, deixar de seguir e seguir de novo não vira uma notificação a
    -- cada volta: o mesmo aviso sobre a mesma pessoa não se repete em 7 dias.
    if exists (
      select 1 from public.notifications n
      where n.user_id = p_uid and n.type = p_tipo and n.actor_id = p_ator
        and n.created_at > now() - interval '7 days'
    ) then
      return;
    end if;
  end if;
  -- Só a versão mais nova dos Termos interessa.
  if p_tipo = 'termos_atualizados' then
    delete from public.notifications n where n.user_id = p_uid and n.type = 'termos_atualizados';
  end if;
  insert into public.notifications (user_id, type, actor_id, achievement_slug, post_id)
  values (p_uid, p_tipo, p_ator, p_conquista, p_post);
end
$$;

-- A mesma função da migration 20 (com o Eco), agora passando o post adiante.
create or replace function private.follows_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_primeiro timestamptz;
begin
  -- Serializa por par: se os dois seguem ao mesmo tempo, em transações
  -- diferentes, a segunda a chegar aqui enxerga a primeira e o "viraram
  -- mútuos" acontece uma vez, e não nenhuma.
  perform pg_advisory_xact_lock(hashtextextended(
    'peripatos:par:' || least(new.follower_id, new.followee_id)::text || ':' || greatest(new.follower_id, new.followee_id)::text, 0));

  select f.created_at into v_primeiro
  from public.follows f
  where f.follower_id = new.followee_id and f.followee_id = new.follower_id;

  if found then
    perform private.notificar(new.followee_id, 'mutuo', new.follower_id);
    perform private.notificar(new.follower_id, 'mutuo', new.followee_id);
    perform private.conquistas_de_mutuo(new.follower_id, new.followee_id);
    if new.created_at >= v_primeiro and new.created_at - v_primeiro < interval '1 hour' then
      perform private.conceder(new.followee_id, 'eco');
    end if;
  else
    perform private.notificar(new.followee_id, 'novo_seguidor', new.follower_id, null, new.via_post_id);
  end if;
  return null;
end
$$;

revoke all on function
  private.follows_confere_origem(),
  private.notificar(uuid, public.notification_type, uuid, text, uuid)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- A aba de notificações
-- ---------------------------------------------------------------------------
-- "Fulano te seguiu pelo seu post" é uma linha só dela, como o "viraram
-- mútuos": não entra no grupo "3 pessoas te seguiram". Se o post saiu do ar
-- (apagado ou ocultado), a notificação volta a ser um novo seguidor comum.
--
-- pelo_post  -> o follow veio de um post seu que ainda está no ar
-- post_trecho -> o começo do texto do post (até 80 caracteres, espaços
--                juntados); nulo se o post é só um GIF
drop function public.minhas_notificacoes();

create function public.minhas_notificacoes()
returns table (
  grupo text,
  tipo public.notification_type,
  quantidade integer,
  ultima_em timestamptz,
  lida boolean,
  -- até três das pessoas do grupo, da mais recente para a mais antiga
  pessoas jsonb,
  conquista_slug text,
  conquista_nome text,
  conquista_emoji text,
  conquista_emoji_rotulo text,
  conquista_cor text,
  pelo_post boolean,
  post_trecho text
)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (select auth.uid() as id),
  minhas as (
    select n.id, n.type, n.actor_id, n.achievement_slug, n.created_at,
           n.read_at is not null as lida,
           -- só post de quem lê, e só se ainda está no ar
           (
             select po.body from public.posts po
             where po.id = n.post_id and po.author_id = n.user_id
               and po.deleted_at is null and po.hidden_at is null
           ) as post_corpo
    from public.notifications n
    cross join eu
    where n.user_id = eu.id
      -- o mesmo filtro da política: quem você bloqueou (ou foi banido) some
      and (n.actor_id is null or private.can_see(eu.id, n.actor_id))
  ),
  visiveis as (
    select m.*,
           case when m.type in ('novo_seguidor', 'denuncia_analisada') and m.post_corpo is null
                then m.type::text || ':' || m.lida::text || ':'
                     || ((m.created_at at time zone 'America/Sao_Paulo')::date)::text
                else m.id::text
           end as grupo
    from minhas m
  ),
  grupos as (
    select v.grupo, v.type, v.achievement_slug,
           count(*)::integer as quantidade, max(v.created_at) as ultima_em, bool_and(v.lida) as lida,
           -- grupo com post tem uma notificação só
           max(v.post_corpo) as post_corpo
    from visiveis v
    group by v.grupo, v.type, v.achievement_slug
  )
  select
    g.grupo, g.type, g.quantidade, g.ultima_em, g.lida,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id, 'username', p.username, 'nome', p.display_name,
            'avatar_path', case when p.avatar_status = 'aprovado' then p.avatar_path end,
            'avatar_preset', p.avatar_preset
          )
          order by x.created_at desc
        )
        from (
          select v.actor_id, v.created_at
          from visiveis v
          where v.grupo = g.grupo and v.actor_id is not null
          order by v.created_at desc
          limit 3
        ) x
        join public.profiles p on p.id = x.actor_id
      ),
      '[]'::jsonb
    ),
    a.slug, a.name, a.emoji, a.emoji_label, a.color,
    g.post_corpo is not null,
    (
      select case when t.limpo = '' then null
                  when char_length(t.limpo) > 80 then rtrim(left(t.limpo, 80)) || '…'
                  else t.limpo end
      from (select btrim(regexp_replace(g.post_corpo, '\s+', ' ', 'g')) as limpo) t
    )
  from grupos g
  left join public.achievements a on a.slug = g.achievement_slug
  order by g.ultima_em desc, g.grupo
  limit 100
$$;

revoke all on function public.minhas_notificacoes() from public, anon;
grant execute on function public.minhas_notificacoes() to authenticated;
