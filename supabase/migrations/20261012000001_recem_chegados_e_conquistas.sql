-- =============================================================================
-- 20 · Recém-chegados e cinco conquistas novas
-- =============================================================================
-- 1. public.recem_chegados(): quem concluiu o onboarding nos últimos 14 dias,
--    na instituição de quem lê. É o que a coluna "Gente parecida com você"
--    mostra quando a pessoa já segue todo mundo parecido.
-- 2. Eco, Eureka, Hefesto, Nóstos e Panateneia. Valem as regras de sempre: só
--    o banco concede, é permanente, e todas nascem à mostra.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · Recém-chegados
-- ---------------------------------------------------------------------------
-- "Concluiu o onboarding" é accounts.maioridade_verificada_em: completar o
-- onboarding é o único momento em que essa coluna é gravada. A data não sai
-- daqui: a lista vem em ordem (mais novos primeiro) e sem dizer quando.
--
-- Quem aparece: conta ativa (onboarding completo, maior de idade, não
-- banida), da mesma instituição, sem bloqueio em nenhuma direção e com a
-- versão vigente dos Termos aceita. Leitor inativo recebe zero linhas.
-- Quem lê não entra na própria lista. Quem a pessoa já segue entra (é uma
-- vitrine de quem chegou, não uma fila de sugestões), e "seguindo" diz qual
-- é o estado do botão.
--
-- As tags em comum são só gostos: tag sensível não é lida aqui.
create index accounts_recem_chegados
  on private.accounts (institution_id, maioridade_verificada_em desc)
  where maioridade_verificada_em is not null;

create function public.recem_chegados(p_limite integer default 5)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_path text,
  avatar_preset smallint,
  seguindo boolean,
  tags_em_comum jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (
    select a.user_id, a.institution_id
    from private.accounts a
    where a.user_id = (select auth.uid())
      and private.is_active(a.user_id)
  )
  select
    p.id,
    p.username,
    p.display_name,
    case when p.avatar_status = 'aprovado' then p.avatar_path end,
    p.avatar_preset,
    exists (
      select 1 from public.follows f where f.follower_id = eu.user_id and f.followee_id = p.id
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', t.id, 'slug', t.slug, 'nome', t.name,
            'categoria', t.category, 'sensivel', false
          )
          order by t.name
        )
        from public.profile_tags minha
        join public.profile_tags dela on dela.tag_id = minha.tag_id and dela.user_id = p.id
        join public.tags t on t.id = minha.tag_id
        where minha.user_id = eu.user_id and not t.is_sensitive
      ),
      '[]'::jsonb
    )
  from eu
  join private.accounts a on a.institution_id = eu.institution_id
  join public.profiles p on p.id = a.user_id
  where a.user_id <> eu.user_id
    and a.maioridade_verificada_em > now() - interval '14 days'
    and private.is_active(a.user_id)
    and private.termos_em_dia(a.user_id)
    and not private.is_blocked(eu.user_id, a.user_id)
  order by a.maioridade_verificada_em desc, p.id
  limit least(greatest(coalesce(p_limite, 5), 1), 20)
$$;

revoke all on function public.recem_chegados(integer) from public, anon;
grant execute on function public.recem_chegados(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2 · Catálogo
-- ---------------------------------------------------------------------------
--   panateneia_inicio / panateneia_fim -> a semana de abertura pública, em
--   private.config (timestamptz). Enquanto faltar uma das duas, ninguém ganha
--   a Panateneia. Como definir: docs/conquistas.md.
insert into public.achievements
  (position, slug, name, description, emoji, emoji_label, color, is_secret, private_by_default, is_manual)
values
  (15, 'eco',        'Eco',        'Alguém te seguiu de volta menos de uma hora depois de você seguir.',    '📣', 'megafone', '#6a4a9f', false, false, false),
  (16, 'eureka',     'Eureka',     'Pediu uma tag nova e ela foi aprovada.',                                   '💡', 'lâmpada',  '#b8420f', false, false, false),
  (17, 'hefesto',    'Hefesto',    'Deu uma sugestão que virou funcionalidade.',                               '🔨', 'martelo',  '#7a2e1e', false, false, true),
  (18, 'nostos',     'Nóstos',     'Voltou a publicar depois de 30 dias ou mais sem nenhum post.',             '🧭', 'bússola',  '#2e5e4e', false, false, false),
  (19, 'panateneia', 'Panateneia', 'Chegou durante a semana de abertura pública.',                             '🏺', 'ânfora',   '#8f3a7a', false, false, false);

-- ---------------------------------------------------------------------------
-- Eco: o follow de volta veio menos de uma hora depois do primeiro
-- ---------------------------------------------------------------------------
-- Quem ganha é quem seguiu primeiro. Usa follows.created_at, que já existia.
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
    perform private.notificar(new.followee_id, 'novo_seguidor', new.follower_id);
  end if;
  return null;
end
$$;

-- ---------------------------------------------------------------------------
-- Eureka: o pedido de tag foi aprovado
-- ---------------------------------------------------------------------------
-- A API não altera tag_requests.status: só a RPC resolver_pedido_tag, que é
-- da staff. Quem pediu não aprova o próprio pedido.
create function private.tag_requests_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'aprovada' and old.status is distinct from new.status then
    perform private.conceder(new.user_id, 'eureka');
  end if;
  return null;
end
$$;

create trigger tag_requests_conquistas
  after update of status on public.tag_requests
  for each row execute function private.tag_requests_after_update();

-- ---------------------------------------------------------------------------
-- Nóstos: um post 30 dias ou mais depois do post anterior
-- ---------------------------------------------------------------------------
-- O post anterior conta mesmo apagado ou ocultado: a pessoa publicou. Quem
-- nunca publicou não "voltou": o primeiro post é o Peripatético.
create or replace function private.posts_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.conquistas_de_escrita(new.author_id, new.created_at, 'peripatetico');
  if (
    select max(p.created_at)
    from public.posts p
    where p.author_id = new.author_id and p.id <> new.id
  ) <= new.created_at - interval '30 days' then
    perform private.conceder(new.author_id, 'nostos');
  end if;
  return null;
end
$$;

-- ---------------------------------------------------------------------------
-- Panateneia: concluiu o onboarding dentro da janela
-- ---------------------------------------------------------------------------
-- Entra em conquistas_do_perfil, ao lado do Fundador. A janela é
-- [panateneia_inicio, panateneia_fim): o início conta, o fim não.
create or replace function private.conquistas_do_perfil(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil    public.profiles;
  v_ate       timestamptz;
  v_inicio    timestamptz;
  v_fim       timestamptz;
  v_concluido timestamptz;
begin
  select * into v_perfil from public.profiles p where p.id = p_uid;
  if not found or not v_perfil.onboarding_completo then
    return;
  end if;

  select c.valor::timestamptz into v_ate from private.config c where c.chave = 'fundador_ate';
  if v_ate is null or v_perfil.created_at < v_ate then
    perform private.conceder(p_uid, 'fundador');
  end if;

  select c.valor::timestamptz into v_inicio from private.config c where c.chave = 'panateneia_inicio';
  select c.valor::timestamptz into v_fim from private.config c where c.chave = 'panateneia_fim';
  if v_inicio is not null and v_fim is not null then
    select a.maioridade_verificada_em into v_concluido from private.accounts a where a.user_id = p_uid;
    if v_concluido >= v_inicio and v_concluido < v_fim then
      perform private.conceder(p_uid, 'panateneia');
    end if;
  end if;

  if btrim(coalesce(v_perfil.bio, '')) <> ''
     and (v_perfil.avatar_status = 'aprovado' or v_perfil.avatar_preset is not null)
     and exists (select 1 from public.profile_tags pt where pt.user_id = p_uid) then
    perform private.conceder(p_uid, 'conhece-te-a-ti-mesmo');
  end if;
end
$$;

revoke all on function private.tag_requests_after_update() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Quem já estava aqui: o que os dados existentes justificam
-- ---------------------------------------------------------------------------
-- Como na migration 17. Hefesto é manual e a Panateneia ainda não tem janela.
do $$
begin
  -- Eco: pares mútuos em que o segundo follow veio em menos de uma hora.
  perform private.conceder(f.follower_id, 'eco')
  from public.follows f
  join public.follows g on g.follower_id = f.followee_id and g.followee_id = f.follower_id
  where g.created_at >= f.created_at and g.created_at - f.created_at < interval '1 hour';

  perform private.conceder(x.user_id, 'eureka')
  from (select distinct tr.user_id from public.tag_requests tr where tr.status = 'aprovada') x;

  perform private.conceder(x.author_id, 'nostos')
  from (
    select distinct p.author_id
    from (
      select po.author_id, po.created_at,
             lag(po.created_at) over (partition by po.author_id order by po.created_at) as anterior
      from public.posts po
    ) p
    where p.anterior <= p.created_at - interval '30 days'
  ) x;
end
$$;
