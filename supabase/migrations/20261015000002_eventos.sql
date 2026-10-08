-- =============================================================================
-- 25 · Eventos
-- =============================================================================
-- Um evento diz onde uma pessoa vai estar e quando. Por isso quase tudo aqui é
-- sobre quem NÃO pode ver. Regras, todas impostas no banco:
--
--   - só a mesma instituição vê eventos; bloqueio em qualquer direção esconde
--     o evento e esconde que a pessoa vai nele; banido some;
--   - quem vai: só quem organiza e quem já está confirmado enxerga. Para o
--     resto não sai nada sobre quem vai. Com vagas, todos veem quantas sobram;
--     sem vagas, nenhum número existe;
--   - local exato e link: tabela separada (event_details), que só quem
--     organiza e quem está confirmado lê;
--   - a staff não tem caminho nenhum para a lista de participantes nem para o
--     local exato. A denúncia de evento leva uma CÓPIA do título, da descrição
--     e do local geral, como nas mensagens;
--   - nada se escreve direto nas tabelas: criar, editar, cancelar, participar,
--     desistir, aceitar, recusar e remover são RPCs. Organizador, instituição,
--     aprovação e vagas não vêm da API;
--   - vagas nunca são excedidas: toda confirmação trava a linha do evento
--     (FOR UPDATE) antes de contar.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.events (
  id               uuid primary key default gen_random_uuid(),
  organizer_id     uuid not null,
  institution_id   uuid not null,
  title            text not null check (char_length(btrim(title)) between 3 and 80),
  description      text not null default '' check (char_length(description) <= 1000),
  starts_at        timestamptz not null,
  ends_at          timestamptz check (ends_at > starts_at),
  -- quando o evento deixa de ser "próximo": o fim, ou duas horas depois do
  -- início quando não há fim. Gravado pelas RPCs (timestamptz + interval não
  -- é imutável, então não pode ser coluna gerada).
  over_at          timestamptz not null,
  modality         public.event_modality not null,
  -- "no campus", "centro": é o que todo mundo da instituição vê
  general_location text check (char_length(btrim(general_location)) between 2 and 80),
  kind             public.event_kind not null,
  capacity         integer check (capacity between 1 and 500),
  cancelled_at     timestamptz,
  hidden_at        timestamptz,           -- ocultado pela moderação
  hidden_by        uuid references public.profiles (id) on delete set null,
  reminded_at      timestamptz,           -- o lembrete de duas horas já saiu
  settled_at       timestamptz,           -- as conquistas de "aconteceu" já foram conferidas
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint events_local_coerente check ((modality = 'presencial') = (general_location is not null)),
  constraint events_fim_coerente check (over_at > starts_at),
  -- a instituição do evento é sempre a de quem organiza
  foreign key (organizer_id, institution_id) references public.profiles (id, institution_id) on delete cascade
);
create index events_proximos on public.events (institution_id, starts_at) where cancelled_at is null and hidden_at is null;
create index events_do_organizador on public.events (organizer_id, starts_at desc);
create index events_a_lembrar on public.events (starts_at) where reminded_at is null and cancelled_at is null and hidden_at is null;
create index events_a_fechar on public.events (over_at) where settled_at is null;

-- O que só quem vai pode ler. Numa tabela à parte porque o RLS decide por
-- linha, não por coluna.
create table public.event_details (
  event_id       uuid primary key references public.events (id) on delete cascade,
  exact_location text check (char_length(btrim(exact_location)) between 2 and 200),
  -- só http e https, sem espaço nem aspas: nunca "javascript:"
  link           text check (link ~* '^https?://[^[:space:]<>"'']+$' and char_length(link) between 10 and 500)
);

create table public.event_tags (
  event_id uuid not null references public.events (id) on delete cascade,
  tag_id   integer not null references public.tags (id) on delete cascade,
  primary key (event_id, tag_id)
);
create index event_tags_tag on public.event_tags (tag_id);

-- Quem organiza não tem linha aqui. 'recusado' serve para o pedido recusado e
-- para quem foi removido: a pessoa não volta a pedir, e o motivo não existe.
create table public.event_participants (
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  status     public.event_participation not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (event_id, user_id)
);
create index event_participants_da_pessoa on public.event_participants (user_id, status);

alter table public.events             enable row level security;
alter table public.events             force row level security;
alter table public.event_details      enable row level security;
alter table public.event_details      force row level security;
alter table public.event_tags         enable row level security;
alter table public.event_tags         force row level security;
alter table public.event_participants enable row level security;
alter table public.event_participants force row level security;
revoke all on public.events, public.event_details, public.event_tags, public.event_participants from anon, authenticated, public;

-- Repare no que NÃO existe: INSERT, UPDATE e DELETE.
grant select on public.events, public.event_details, public.event_tags, public.event_participants to authenticated;

-- ---------------------------------------------------------------------------
-- Quem vê o quê
-- ---------------------------------------------------------------------------
create function private.organiza_evento(p_evento uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.events e where e.id = p_evento and e.organizer_id = p_uid)
$$;

-- Vai: organiza ou está confirmado. É quem lê a lista, o local exato e o link.
create function private.vai_ao_evento(p_evento uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.organiza_evento(p_evento, p_uid)
      or exists (
        select 1 from public.event_participants ep
        where ep.event_id = p_evento and ep.user_id = p_uid and ep.status = 'confirmado'
      )
$$;

-- O evento existe para esta pessoa? Mesma instituição, leitora ativa, e:
--   - é dela; ou
--   - quem organiza é visível (ativo, sem bloqueio em nenhuma direção), o
--     evento não foi ocultado e, ou ainda vai acontecer, ou ela está nele
--     (pediu ou confirmou): evento que acabou ou foi cancelado só existe para
--     quem estava envolvido.
create function private.ve_evento(p_uid uuid, p_evento uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events e
    join private.accounts a on a.user_id = p_uid and a.institution_id = e.institution_id
    where e.id = p_evento
      and private.is_active(p_uid)
      and (
        e.organizer_id = p_uid
        or (
          private.can_see(p_uid, e.organizer_id)
          and e.hidden_at is null
          and (
            (e.cancelled_at is null and e.over_at > now())
            or exists (
              select 1 from public.event_participants ep
              where ep.event_id = e.id and ep.user_id = p_uid and ep.status in ('pendente', 'confirmado')
            )
          )
        )
      )
  )
$$;

revoke all on function
  private.organiza_evento(uuid, uuid),
  private.vai_ao_evento(uuid, uuid),
  private.ve_evento(uuid, uuid)
from public, anon;
grant execute on function
  private.organiza_evento(uuid, uuid),
  private.vai_ao_evento(uuid, uuid),
  private.ve_evento(uuid, uuid)
to authenticated;

create policy events_select on public.events
  for select to authenticated
  using (private.ve_evento((select auth.uid()), id));

create policy event_tags_select on public.event_tags
  for select to authenticated
  using (private.ve_evento((select auth.uid()), event_id));

-- Local exato e link: só quem vai. Nenhuma cláusula de staff.
create policy event_details_select on public.event_details
  for select to authenticated
  using (
    private.ve_evento((select auth.uid()), event_id)
    and private.vai_ao_evento(event_id, (select auth.uid()))
  );

-- A própria linha, sempre (é como a pessoa sabe se pediu, se vai, ou se não
-- foi aceita). As dos outros: quem organiza vê todas; quem está confirmado vê
-- os outros confirmados. Em qualquer caso, só de quem a pessoa pode ver:
-- bloqueio esconde que o outro vai, e banido some. Nenhuma cláusula de staff.
create policy event_participants_select on public.event_participants
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      private.ve_evento((select auth.uid()), event_id)
      and private.can_see((select auth.uid()), user_id)
      and (
        private.organiza_evento(event_id, (select auth.uid()))
        or (status = 'confirmado' and private.vai_ao_evento(event_id, (select auth.uid())))
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Limites: 5 eventos criados por dia, 30 pedidos ou confirmações por dia
-- ---------------------------------------------------------------------------
-- O mesmo trigger dos posts e dos follows: conta eventos, não linhas, então
-- cancelar e pedir de novo não devolve cota.
create trigger events_rate_limit
  before insert on public.events
  for each row execute function private.enforce_rate_limit(
    'evento_criar', '5', '1 day', 'Limite de 5 eventos criados por dia atingido.');

create trigger event_participants_rate_limit
  before insert on public.event_participants
  for each row execute function private.enforce_rate_limit(
    'evento_participar', '30', '1 day', 'Limite de 30 pedidos ou confirmações por dia atingido.');

-- ---------------------------------------------------------------------------
-- Notificações: o evento entra na estrutura que já existe
-- ---------------------------------------------------------------------------
-- event_id some junto com o evento. O cancelamento guarda o TÍTULO (até 60
-- dias, como toda notificação): quando a conta de quem organizava é excluída
-- o evento deixa de existir, e sem o título quem ia não saberia qual foi.
alter table public.notifications
  add column event_id    uuid references public.events (id) on delete cascade,
  add column event_title text check (char_length(event_title) <= 80),
  drop constraint notifications_forma,
  add constraint notifications_forma check (
    (type in ('novo_seguidor', 'mutuo', 'evento_pedido')) = (actor_id is not null)
    and (type = 'conquista') = (achievement_slug is not null)
    and (event_id is null or type in ('evento_pedido', 'evento_aceito', 'evento_alterado', 'evento_cancelado', 'evento_lembrete'))
    and (event_title is null or type = 'evento_cancelado')
  );
create index notifications_do_evento on public.notifications (event_id) where event_id is not null;

alter table public.push_preferences add column evento boolean not null default false;
grant insert (evento), update (evento) on public.push_preferences to authenticated;

-- notificar() ganha o evento e o título guardado. São parâmetros a mais, então
-- a função antiga sai.
drop function private.notificar(uuid, public.notification_type, uuid, text, uuid);

create function private.notificar(
  p_uid uuid,
  p_tipo public.notification_type,
  p_ator uuid default null,
  p_conquista text default null,
  p_post uuid default null,
  p_evento uuid default null,
  p_titulo_do_evento text default null
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
    -- (Vale para seguidor e mútuo. O pedido de participação é um por evento.)
    if p_tipo in ('novo_seguidor', 'mutuo') and exists (
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
  insert into public.notifications (user_id, type, actor_id, achievement_slug, post_id, event_id, event_title)
  values (p_uid, p_tipo, p_ator, p_conquista, p_post, p_evento, p_titulo_do_evento);
end
$$;

revoke all on function private.notificar(uuid, public.notification_type, uuid, text, uuid, uuid, text) from public, anon, authenticated;

-- Um interruptor só para todos os avisos de evento.
create or replace function private.quer_push(p_uid uuid, p_tipo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case p_tipo
        when 'mensagem' then pp.mensagem
        when 'novo_seguidor' then pp.novo_seguidor
        when 'mutuo' then pp.mutuo
        when 'avatar_aprovado' then pp.avatar
        when 'avatar_recusado' then pp.avatar
        when 'denuncia_analisada' then pp.denuncia
        when 'termos_atualizados' then pp.termos
        when 'conquista' then pp.conquista
        when 'evento_pedido' then pp.evento
        when 'evento_aceito' then pp.evento
        when 'evento_alterado' then pp.evento
        when 'evento_cancelado' then pp.evento
        when 'evento_lembrete' then pp.evento
        else false
      end
      from public.push_preferences pp
      where pp.user_id = p_uid
    ),
    p_tipo = 'mensagem'
  )
$$;

-- A aba de notificações passa a devolver o evento.
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
  post_trecho text,
  -- nulo quando o evento não existe mais para quem lê (o título ainda vem)
  evento_id uuid,
  evento_titulo text
)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (select auth.uid() as id),
  minhas as (
    select n.id, n.type, n.actor_id, n.achievement_slug, n.created_at, ev.id as evento_id,
           coalesce(ev.title, n.event_title) as evento_titulo,
           n.read_at is not null as lida,
           -- só post de quem lê, e só se ainda está no ar
           (
             select po.body from public.posts po
             where po.id = n.post_id and po.author_id = n.user_id
               and po.deleted_at is null and po.hidden_at is null
           ) as post_corpo
    from public.notifications n
    cross join eu
    -- o evento, só se ainda existe para quem lê (bloqueio, ocultação)
    left join public.events ev on ev.id = n.event_id and private.ve_evento(eu.id, ev.id)
    where n.user_id = eu.id
      -- aviso sobre um evento que a pessoa não vê mais não aparece; o de
      -- cancelamento fica, com o título que foi guardado
      and (n.type not in ('evento_pedido', 'evento_aceito', 'evento_alterado', 'evento_lembrete') or ev.id is not null)
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
           max(v.post_corpo) as post_corpo,
           -- notificação de evento nunca é agrupada: uma linha por grupo
           (array_agg(v.evento_id))[1] as evento_id, max(v.evento_titulo) as evento_titulo
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
    ),
    g.evento_id, g.evento_titulo
  from grupos g
  left join public.achievements a on a.slug = g.achievement_slug
  order by g.ultima_em desc, g.grupo
  limit 100
$$;

-- ---------------------------------------------------------------------------
-- O que cada pessoa enxerga de um evento
-- ---------------------------------------------------------------------------
-- vagas_restantes só existe quando o evento tem vagas. local_exato e link só
-- vêm para quem vai. pedidos_pendentes só para quem organiza. Nada aqui diz
-- QUEM vai: isso é a tabela event_participants, com a política dela.
create type public.evento_visto as (
  id                       uuid,
  titulo                   text,
  descricao                text,
  inicio                   timestamptz,
  fim                      timestamptz,
  modalidade               public.event_modality,
  local_geral              text,
  tipo                     public.event_kind,
  vagas                    integer,
  vagas_restantes          integer,
  organizador_id           uuid,
  organizador_username     text,
  organizador_nome         text,
  organizador_avatar_path  text,
  organizador_avatar_preset smallint,
  tags                     jsonb,
  tags_em_comum            integer,
  -- 'organizo', 'confirmado', 'pendente', 'recusado' ou nulo
  meu_status               text,
  cancelado                boolean,
  oculto                   boolean,
  acabou                   boolean,
  local_exato              text,
  link                     text,
  pedidos_pendentes        integer
);

create function private.eventos_de(p_uid uuid)
returns setof public.evento_visto
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.id, e.title, e.description, e.starts_at, e.ends_at, e.modality, e.general_location, e.kind, e.capacity,
    case when e.capacity is not null then greatest(e.capacity - c.confirmados, 0) end,
    p.id, p.username, p.display_name,
    case when p.avatar_status = 'aprovado' then p.avatar_path end,
    p.avatar_preset,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', t.id, 'slug', t.slug, 'nome', t.name, 'categoria', t.category, 'sensivel', false)
          order by t.name
        )
        from public.event_tags et
        join public.tags t on t.id = et.tag_id
        where et.event_id = e.id and not t.is_sensitive
      ),
      '[]'::jsonb
    ),
    (
      select count(*)::integer
      from public.event_tags et
      join public.profile_tags pt on pt.tag_id = et.tag_id and pt.user_id = p_uid
      where et.event_id = e.id
    ),
    case when e.organizer_id = p_uid then 'organizo' else m.status::text end,
    e.cancelled_at is not null,
    e.hidden_at is not null,
    e.over_at <= now(),
    case when v.vai then d.exact_location end,
    case when v.vai then d.link end,
    case when e.organizer_id = p_uid then c.pendentes end
  from public.events e
  join public.profiles p on p.id = e.organizer_id
  left join public.event_details d on d.event_id = e.id
  left join public.event_participants m on m.event_id = e.id and m.user_id = p_uid
  cross join lateral (
    select count(*) filter (where ep.status = 'confirmado')::integer as confirmados,
           count(*) filter (where ep.status = 'pendente')::integer as pendentes
    from public.event_participants ep
    where ep.event_id = e.id
  ) c
  cross join lateral (select e.organizer_id = p_uid or coalesce(m.status = 'confirmado', false) as vai) v
  where private.ve_evento(p_uid, e.id)
$$;
revoke all on function private.eventos_de(uuid) from public, anon, authenticated;

-- A aba Eventos: o que ainda vai acontecer, em ordem de data.
create function public.eventos_proximos(
  p_com_meus_gostos boolean default false,
  p_modalidade public.event_modality default null
)
returns setof public.evento_visto
language sql
stable
security definer
set search_path = ''
as $$
  select e.*
  from private.eventos_de((select auth.uid())) e
  where not e.cancelado and not e.oculto and not e.acabou
    and (not coalesce(p_com_meus_gostos, false) or e.tags_em_comum > 0)
    and (p_modalidade is null or e.modalidade = p_modalidade)
  order by e.inicio, e.id
  limit 100
$$;

-- "Meus eventos": os que organizo e os que vou (ou pedi). Os que já acabaram
-- vêm marcados: são o histórico de quem organizou ou esteve confirmado.
create function public.meus_eventos()
returns setof public.evento_visto
language sql
stable
security definer
set search_path = ''
as $$
  select e.*
  from private.eventos_de((select auth.uid())) e
  where e.meu_status in ('organizo', 'confirmado')
     or (e.meu_status = 'pendente' and not e.acabou)
  order by e.acabou, case when e.acabou then null else e.inicio end, e.inicio desc, e.id
  limit 200
$$;

create function public.evento(p_evento uuid)
returns setof public.evento_visto
language sql
stable
security definer
set search_path = ''
as $$
  select e.* from private.eventos_de((select auth.uid())) e where e.id = p_evento
$$;

-- ---------------------------------------------------------------------------
-- Criar e editar
-- ---------------------------------------------------------------------------
create function private.exigir_para_eventos()
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
  if not private.is_active(v_uid) then
    raise exception 'Sem permissão para esta ação.' using errcode = 'PT403';
  end if;
  return v_uid;
end
$$;

-- Criar e participar exigem os Termos em dia; ler, não.
create function private.exigir_termos_para_eventos(p_uid uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.termos_em_dia(p_uid) then
    raise exception 'Aceite a versão atual dos Termos de uso para criar ou participar de eventos.' using errcode = 'PT403';
  end if;
end
$$;

-- Confere e grava os campos que criar e editar têm em comum. O evento já
-- existe (criar insere antes, com o mínimo) e a linha já está travada.
create function private.gravar_evento(
  p_evento uuid,
  p_titulo text,
  p_descricao text,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_modalidade public.event_modality,
  p_local_geral text,
  p_local_exato text,
  p_link text,
  p_vagas integer,
  p_tags integer[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titulo text := btrim(coalesce(p_titulo, ''));
  v_desc   text := btrim(coalesce(p_descricao, ''));
  v_geral  text := nullif(btrim(coalesce(p_local_geral, '')), '');
  v_exato  text := nullif(btrim(coalesce(p_local_exato, '')), '');
  v_link   text := nullif(btrim(coalesce(p_link, '')), '');
  v_tags   integer[] := coalesce((select array_agg(distinct t) from unnest(p_tags) t where t is not null), '{}');
begin
  if char_length(v_titulo) not between 3 and 80 then
    raise exception 'O título precisa ter de 3 a 80 caracteres.' using errcode = 'PT400';
  end if;
  if char_length(v_desc) > 1000 then
    raise exception 'A descrição pode ter até 1000 caracteres.' using errcode = 'PT400';
  end if;
  if p_inicio is null or p_inicio <= now() then
    raise exception 'O início precisa ser uma data futura.' using errcode = 'PT400';
  end if;
  if p_inicio > now() + interval '1 year' then
    raise exception 'O início pode ser no máximo daqui a um ano.' using errcode = 'PT400';
  end if;
  if p_fim is not null and (p_fim <= p_inicio or p_fim > p_inicio + interval '7 days') then
    raise exception 'O fim precisa ser depois do início, e no máximo sete dias depois.' using errcode = 'PT400';
  end if;
  if p_modalidade is null then
    raise exception 'Escolha se o evento é presencial ou online.' using errcode = 'PT400';
  end if;
  if p_vagas is not null and p_vagas not between 1 and 500 then
    raise exception 'As vagas vão de 1 a 500.' using errcode = 'PT400';
  end if;

  if p_modalidade = 'presencial' then
    if v_geral is null or char_length(v_geral) not between 2 and 80 then
      raise exception 'Diga onde é, de forma geral (de 2 a 80 caracteres).' using errcode = 'PT400';
    end if;
    if v_exato is not null and char_length(v_exato) not between 2 and 200 then
      raise exception 'O local exato pode ter de 2 a 200 caracteres.' using errcode = 'PT400';
    end if;
    v_link := null;
  else
    -- Só http e https. O CHECK da coluna repete a regra.
    if v_link is null or v_link !~* '^https?://[^[:space:]<>"'']+$' or char_length(v_link) not between 10 and 500 then
      raise exception 'Informe o link do evento, começando com http:// ou https://.' using errcode = 'PT400';
    end if;
    v_geral := null;
    v_exato := null;
  end if;

  if cardinality(v_tags) > 5 then
    raise exception 'Um evento pode ter até 5 tags.' using errcode = 'PT400';
  end if;
  -- Só gostos do vocabulário: tag sensível não marca evento.
  if (select count(*) from public.tags t where t.id = any (v_tags) and not t.is_sensitive) <> cardinality(v_tags) then
    raise exception 'Tag inválida para um evento.' using errcode = 'PT400';
  end if;
  -- Vagas nunca ficam abaixo de quem já está confirmado.
  if p_vagas is not null and p_vagas < (
    select count(*) from public.event_participants ep where ep.event_id = p_evento and ep.status = 'confirmado'
  ) then
    raise exception 'Já há mais pessoas confirmadas do que essas vagas.' using errcode = 'PT400';
  end if;

  update public.events
     set title = v_titulo,
         description = v_desc,
         starts_at = p_inicio,
         ends_at = p_fim,
         over_at = coalesce(p_fim, p_inicio + interval '2 hours'),
         modality = p_modalidade,
         general_location = v_geral,
         capacity = p_vagas,
         updated_at = now()
   where id = p_evento;

  insert into public.event_details (event_id, exact_location, link)
  values (p_evento, v_exato, v_link)
  on conflict (event_id) do update set exact_location = excluded.exact_location, link = excluded.link;

  delete from public.event_tags et where et.event_id = p_evento and et.tag_id <> all (v_tags);
  insert into public.event_tags (event_id, tag_id)
  select p_evento, t from unnest(v_tags) t
  on conflict do nothing;
end
$$;

-- Quem organiza é sempre quem chama, e a instituição é a dela.
create function public.criar_evento(
  p_titulo text,
  p_descricao text,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_modalidade public.event_modality,
  p_local_geral text,
  p_local_exato text,
  p_link text,
  p_tipo public.event_kind,
  p_vagas integer,
  p_tags integer[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.exigir_para_eventos();
  v_id  uuid;
begin
  perform private.exigir_termos_para_eventos(v_uid);
  if p_tipo is null then
    raise exception 'Escolha se o evento é aberto ou com aprovação.' using errcode = 'PT400';
  end if;
  if p_inicio is null or p_modalidade is null then
    raise exception 'Informe o início e a modalidade do evento.' using errcode = 'PT400';
  end if;

  -- O mínimo para a linha existir (é aqui que o limite de 5 por dia conta); o
  -- resto é conferido e gravado por gravar_evento, na mesma transação.
  insert into public.events (organizer_id, institution_id, title, starts_at, over_at, modality, general_location, kind)
  values (v_uid, private.my_institution(), 'Evento', p_inicio, p_inicio + interval '2 hours', p_modalidade,
          case when p_modalidade = 'presencial' then 'A definir' end, p_tipo)
  returning id into v_id;

  perform private.gravar_evento(v_id, p_titulo, p_descricao, p_inicio, p_fim, p_modalidade, p_local_geral, p_local_exato, p_link, p_vagas, p_tags);
  return v_id;
end
$$;

-- O tipo (aberto ou com aprovação) não muda depois de criado: mudaria o que
-- os pedidos e as confirmações já feitos significam.
create function public.editar_evento(
  p_evento uuid,
  p_titulo text,
  p_descricao text,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_modalidade public.event_modality,
  p_local_geral text,
  p_local_exato text,
  p_link text,
  p_vagas integer,
  p_tags integer[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.exigir_para_eventos();
  v_antes record;
  v_agora record;
begin
  select e.organizer_id, e.cancelled_at, e.over_at, e.starts_at, e.ends_at, e.modality, e.general_location,
         d.exact_location, d.link
    into v_antes
  from public.events e
  left join public.event_details d on d.event_id = e.id
  where e.id = p_evento
  for update of e;
  -- Mesma resposta para "não existe" e "não é seu".
  if not found or v_antes.organizer_id <> v_uid then
    raise exception 'Evento não encontrado.' using errcode = 'PT404';
  end if;
  if v_antes.cancelled_at is not null or v_antes.over_at <= now() then
    raise exception 'Este evento já acabou ou foi cancelado.' using errcode = 'PT409';
  end if;

  perform private.gravar_evento(p_evento, p_titulo, p_descricao, p_inicio, p_fim, p_modalidade, p_local_geral, p_local_exato, p_link, p_vagas, p_tags);

  select e.starts_at, e.ends_at, e.modality, e.general_location, d.exact_location, d.link, e.title
    into v_agora
  from public.events e
  left join public.event_details d on d.event_id = e.id
  where e.id = p_evento;

  -- Mudou a data, o local ou o link: quem vai fica sabendo. Uma notificação
  -- não lida sobre o mesmo evento é trocada pela nova, em vez de empilhar.
  if (v_antes.starts_at, v_antes.ends_at, v_antes.modality, v_antes.general_location, v_antes.exact_location, v_antes.link)
     is distinct from
     (v_agora.starts_at, v_agora.ends_at, v_agora.modality, v_agora.general_location, v_agora.exact_location, v_agora.link) then
    delete from public.notifications n
    where n.event_id = p_evento and n.type = 'evento_alterado' and n.read_at is null;
    -- o lembrete vale para a data nova
    update public.events set reminded_at = null where id = p_evento and starts_at is distinct from v_antes.starts_at;
    perform private.notificar(ep.user_id, 'evento_alterado', null, null, null, p_evento)
    from public.event_participants ep
    where ep.event_id = p_evento and ep.status = 'confirmado';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Cancelar
-- ---------------------------------------------------------------------------
-- Avisa quem ia (confirmados e quem tinha pedido) e, se o evento continua
-- existindo, marca como cancelado. p_guardar = false é a exclusão de conta: o
-- evento vai sumir em seguida, então a notificação fica só com o título.
create function private.cancelar_evento_interno(p_evento uuid, p_guardar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_titulo text;
begin
  select e.title into v_titulo
  from public.events e
  where e.id = p_evento and e.cancelled_at is null and e.over_at > now()
  for update;
  if not found then
    return;
  end if;

  -- Os avisos anteriores sobre este evento perdem o sentido.
  delete from public.notifications n where n.event_id = p_evento;

  -- O join com profiles cobre contas apagadas no mesmo comando (várias de uma
  -- vez): a participação delas ainda não saiu em cascata, mas a pessoa já não
  -- existe para ser avisada.
  perform private.notificar(ep.user_id, 'evento_cancelado', null, null, null, case when p_guardar then p_evento end, v_titulo)
  from public.event_participants ep
  join public.profiles p on p.id = ep.user_id
  where ep.event_id = p_evento and ep.status in ('pendente', 'confirmado');

  if p_guardar then
    update public.events set cancelled_at = now(), updated_at = now() where id = p_evento;
  end if;
end
$$;

create function public.cancelar_evento(p_evento uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.exigir_para_eventos();
  v_e   record;
begin
  select e.organizer_id, e.cancelled_at, e.over_at into v_e from public.events e where e.id = p_evento for update;
  if not found or v_e.organizer_id <> v_uid then
    raise exception 'Evento não encontrado.' using errcode = 'PT404';
  end if;
  if v_e.cancelled_at is not null or v_e.over_at <= now() then
    raise exception 'Este evento já acabou ou foi cancelado.' using errcode = 'PT409';
  end if;
  perform private.cancelar_evento_interno(p_evento, true);
end
$$;

-- ---------------------------------------------------------------------------
-- Participar, desistir, aceitar, recusar, remover
-- ---------------------------------------------------------------------------
-- Devolve o status em que a pessoa ficou: 'confirmado' (evento aberto) ou
-- 'pendente' (com aprovação). A linha do evento é travada antes de contar as
-- vagas: duas pessoas pedindo a última vaga ao mesmo tempo passam uma de cada
-- vez, e a segunda encontra o evento cheio.
create function public.participar_evento(p_evento uuid)
returns public.event_participation
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.exigir_para_eventos();
  v_e      public.events;
  v_status public.event_participation;
begin
  perform private.exigir_termos_para_eventos(v_uid);

  -- Mesma resposta para "não existe", "é de outra instituição", "quem
  -- organiza te bloqueou" e "foi ocultado".
  if not private.ve_evento(v_uid, p_evento) then
    raise exception 'Evento não encontrado.' using errcode = 'PT404';
  end if;
  select * into v_e from public.events e where e.id = p_evento for update;
  if v_e.organizer_id = v_uid then
    raise exception 'Você organiza este evento.' using errcode = 'PT400';
  end if;
  if v_e.cancelled_at is not null or v_e.hidden_at is not null or v_e.over_at <= now() then
    raise exception 'Este evento já acabou ou foi cancelado.' using errcode = 'PT409';
  end if;

  select ep.status into v_status from public.event_participants ep where ep.event_id = p_evento and ep.user_id = v_uid;
  if v_status = 'recusado' then
    -- discreto: sem motivo, e sem dizer se foi recusa ou remoção
    raise exception 'Não é possível participar deste evento.' using errcode = 'PT403';
  elsif v_status is not null then
    raise exception 'Você já está neste evento.' using errcode = 'PT409';
  end if;

  if v_e.kind = 'aberto' then
    if v_e.capacity is not null and (
      select count(*) from public.event_participants ep where ep.event_id = p_evento and ep.status = 'confirmado'
    ) >= v_e.capacity then
      raise exception 'Não há mais vagas neste evento.' using errcode = 'PT409';
    end if;
    insert into public.event_participants (event_id, user_id, status, decided_at)
    values (p_evento, v_uid, 'confirmado', now());
    return 'confirmado';
  end if;

  insert into public.event_participants (event_id, user_id, status) values (p_evento, v_uid, 'pendente');
  perform private.notificar(v_e.organizer_id, 'evento_pedido', v_uid, null, null, p_evento);
  return 'pendente';
end
$$;

-- Cancelar o pedido ou desistir. Quem não foi aceito não tem o que desfazer
-- (e a linha fica, para o pedido não se repetir).
create function public.sair_do_evento(p_evento uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.exigir_para_eventos();
begin
  perform 1 from public.events e where e.id = p_evento for update;
  delete from public.event_participants ep
  where ep.event_id = p_evento and ep.user_id = v_uid and ep.status in ('pendente', 'confirmado');
  if not found then
    raise exception 'Você não está neste evento.' using errcode = 'PT409';
  end if;
  -- o pedido que quem organiza ainda não viu some junto
  delete from public.notifications n
  where n.event_id = p_evento and n.type = 'evento_pedido' and n.actor_id = v_uid;
  -- e o que a pessoa tinha recebido sobre o evento também
  delete from public.notifications n
  where n.event_id = p_evento and n.user_id = v_uid and n.type in ('evento_aceito', 'evento_alterado', 'evento_lembrete');
end
$$;

-- Só quem organiza. Aceitar confere as vagas com a linha do evento travada.
-- Recusar não avisa ninguém e não guarda motivo.
create function public.responder_pedido(p_evento uuid, p_user_id uuid, p_aceitar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.exigir_para_eventos();
  v_e   public.events;
begin
  if p_aceitar is null then
    raise exception 'Informe se o pedido foi aceito ou recusado.' using errcode = 'PT400';
  end if;
  select * into v_e from public.events e where e.id = p_evento for update;
  if not found or v_e.organizer_id <> v_uid then
    raise exception 'Evento não encontrado.' using errcode = 'PT404';
  end if;
  if v_e.cancelled_at is not null or v_e.over_at <= now() then
    raise exception 'Este evento já acabou ou foi cancelado.' using errcode = 'PT409';
  end if;
  if not exists (
    select 1 from public.event_participants ep
    where ep.event_id = p_evento and ep.user_id = p_user_id and ep.status = 'pendente'
  ) then
    raise exception 'Não há pedido pendente desta pessoa.' using errcode = 'PT409';
  end if;

  if p_aceitar then
    if v_e.capacity is not null and (
      select count(*) from public.event_participants ep where ep.event_id = p_evento and ep.status = 'confirmado'
    ) >= v_e.capacity then
      raise exception 'Não há mais vagas neste evento.' using errcode = 'PT409';
    end if;
    update public.event_participants
       set status = 'confirmado', decided_at = now()
     where event_id = p_evento and user_id = p_user_id;
    perform private.notificar(p_user_id, 'evento_aceito', null, null, null, p_evento);
  else
    update public.event_participants
       set status = 'recusado', decided_at = now()
     where event_id = p_evento and user_id = p_user_id;
  end if;

  delete from public.notifications n
  where n.event_id = p_evento and n.type = 'evento_pedido' and n.actor_id = p_user_id;
end
$$;

-- Tira alguém que estava confirmado. Sem aviso: a pessoa só deixa de ver o
-- local exato, o link e a lista.
create function public.remover_participante(p_evento uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.exigir_para_eventos();
  v_e   public.events;
begin
  select * into v_e from public.events e where e.id = p_evento for update;
  if not found or v_e.organizer_id <> v_uid then
    raise exception 'Evento não encontrado.' using errcode = 'PT404';
  end if;
  update public.event_participants
     set status = 'recusado', decided_at = now()
   where event_id = p_evento and user_id = p_user_id and status = 'confirmado';
  if not found then
    raise exception 'Esta pessoa não está confirmada neste evento.' using errcode = 'PT409';
  end if;
  delete from public.notifications n
  where n.event_id = p_evento and n.user_id = p_user_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Bloqueio, banimento e exclusão de conta
-- ---------------------------------------------------------------------------
-- Bloquear tira cada um dos eventos do outro e apaga os avisos entre os dois.
-- (A política de leitura já esconderia; apagar faz com que não voltem se o
-- bloqueio for desfeito.)
create function private.blocks_eventos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications n
  using public.events e
  where n.event_id = e.id
    and ((n.user_id = new.blocker_id and e.organizer_id = new.blocked_id)
      or (n.user_id = new.blocked_id and e.organizer_id = new.blocker_id));

  delete from public.event_participants ep
  using public.events e
  where ep.event_id = e.id
    and ((ep.user_id = new.blocker_id and e.organizer_id = new.blocked_id)
      or (ep.user_id = new.blocked_id and e.organizer_id = new.blocker_id));
  return null;
end
$$;

create trigger blocks_eventos
  after insert on public.blocks
  for each row execute function private.blocks_eventos();

-- Banido: os eventos que organizava são cancelados (quem ia é avisado) e as
-- participações em eventos que ainda vão acontecer saem, liberando as vagas.
create function private.profiles_banido_eventos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.banned_at is not null and old.banned_at is null then
    perform private.cancelar_evento_interno(e.id, true) from public.events e where e.organizer_id = new.id;
    delete from public.event_participants ep
    using public.events e
    where ep.event_id = e.id and ep.user_id = new.id and e.over_at > now();
    delete from public.notifications n
    where n.type = 'evento_pedido' and n.actor_id = new.id;
  end if;
  return null;
end
$$;

create trigger profiles_banido_eventos
  after update of banned_at on public.profiles
  for each row execute function private.profiles_banido_eventos();

-- Excluir a conta: quem ia aos eventos dela é avisado ANTES de os eventos
-- sumirem em cascata. As participações dela saem pela cascata.
create function private.profiles_excluido_eventos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.cancelar_evento_interno(e.id, false) from public.events e where e.organizer_id = old.id;
  return old;
end
$$;

create trigger profiles_excluido_eventos
  before delete on public.profiles
  for each row execute function private.profiles_excluido_eventos();

-- ---------------------------------------------------------------------------
-- Denúncia e moderação
-- ---------------------------------------------------------------------------
-- A denúncia leva uma CÓPIA do que todo mundo da instituição já via: título,
-- descrição e local geral. Nada de local exato, link ou participantes: a
-- moderação decide por essa cópia e não ganha acesso ao resto.
-- event_id não é chave estrangeira: a cópia sobrevive se o evento for apagado.
alter table public.reports
  add column event_id               uuid,
  add column event_organizer_id     uuid references public.profiles (id) on delete cascade,
  add column event_title            text,
  add column event_description      text,
  add column event_general_location text,
  drop constraint reports_um_alvo,
  add constraint reports_um_alvo check (num_nonnulls(post_id, profile_id, message_id, event_id) = 1),
  add constraint reports_copia_do_evento check ((event_id is null) = (event_organizer_id is null)),
  add constraint reports_unico_evento unique (reporter_id, event_id);

create function public.denunciar_evento(p_evento uuid, p_motivo public.report_reason, p_detalhe text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_e   public.events;
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'Login necessário.' using errcode = 'PT401';
  end if;
  if char_length(p_detalhe) > 1000 then
    raise exception 'O detalhe pode ter até 1000 caracteres.' using errcode = 'PT400';
  end if;

  select e.* into v_e from public.events e where e.id = p_evento;
  -- Mesma resposta para "não existe" e "você não vê".
  if not found or not private.ve_evento(v_uid, p_evento) or v_e.organizer_id = v_uid then
    raise exception 'Evento não encontrado.' using errcode = 'PT404';
  end if;

  begin
    insert into public.reports (
      reporter_id, institution_id, reason, details,
      event_id, event_organizer_id, event_title, event_description, event_general_location
    ) values (
      v_uid, private.my_institution(), p_motivo, nullif(btrim(p_detalhe), ''),
      v_e.id, v_e.organizer_id, v_e.title, v_e.description, v_e.general_location
    )
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Você já denunciou este evento. A moderação vai olhar.' using errcode = 'PT409';
  end;
  return v_id;
end
$$;

-- Ocultar: o evento some para todo mundo, menos para quem organiza, e quem ia
-- é avisado de que foi cancelado. Como no post, moderação não age sobre evento
-- de quem é da equipe.
create function public.ocultar_evento(p_evento uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := private.motivo_obrigatorio(p_motivo);
  v_e      public.events;
  v_uid    uuid;
begin
  select * into v_e from public.events e where e.id = p_evento for update;

  v_uid := private.exigir_staff(v_e.institution_id);
  perform private.exigir_admin_contra_equipe(v_uid, v_e.institution_id, v_e.organizer_id);

  if v_e.hidden_at is not null then
    raise exception 'O evento já está oculto.' using errcode = 'PT409';
  end if;

  -- avisa quem ia, sem apontar para o evento (ele deixa de existir para elas)
  delete from public.notifications n where n.event_id = p_evento;
  if v_e.cancelled_at is null and v_e.over_at > now() then
    perform private.notificar(ep.user_id, 'evento_cancelado', null, null, null, null, v_e.title)
    from public.event_participants ep
    where ep.event_id = p_evento and ep.status in ('pendente', 'confirmado');
  end if;

  update public.events set hidden_at = now(), hidden_by = v_uid, updated_at = now() where id = p_evento;

  insert into public.moderation_actions (institution_id, actor_id, action, target_user_id, reason, metadata)
  values (v_e.institution_id, v_uid, 'ocultar_evento', v_e.organizer_id, v_motivo,
          jsonb_build_object('evento', p_evento, 'titulo', v_e.title));
end
$$;


-- Quem organiza não resolve denúncia contra o próprio evento, e denúncia
-- contra evento de alguém da equipe é da administração.
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
     or v_rep.event_organizer_id = v_uid
     or exists (select 1 from public.posts po where po.id = v_rep.post_id and po.author_id = v_uid) then
    raise exception 'Você não pode resolver uma denúncia contra você.' using errcode = 'PT403';
  end if;

  -- Denúncia contra alguém da equipe (o perfil, o post ou a mensagem): só a
  -- administração decide.
  perform private.exigir_admin_contra_equipe(v_uid, v_inst, alvo)
  from (
    select v_rep.profile_id as alvo
    union all select v_rep.message_sender_id
    union all select v_rep.event_organizer_id
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
-- Conquistas e o que depende do relógio
-- ---------------------------------------------------------------------------
insert into public.achievements
  (position, slug, name, description, emoji, emoji_label, color, is_secret, private_by_default, is_manual)
values
  (20, 'argonauta', 'Argonauta', 'Confirmou presença num evento que aconteceu.',                            '🛶', 'canoa', '#2b5d7d', false, false, false),
  (21, 'dionisio',  'Dionísio',  'Organizou um evento que aconteceu com três ou mais pessoas confirmadas.', '🍇', 'uvas',  '#6f2a7f', false, false, false);

-- A cada dez minutos:
--   - lembrete para quem vai (confirmados e quem organiza) aos eventos que
--     começam nas próximas duas horas. Um por evento;
--   - eventos que acabaram: Argonauta para quem estava confirmado e Dionísio
--     para quem organizou com três ou mais confirmados. Evento cancelado ou
--     ocultado não "aconteceu".
create function private.tarefas_de_eventos()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e record;
begin
  for v_e in
    select e.id, e.organizer_id
    from public.events e
    where e.reminded_at is null and e.cancelled_at is null and e.hidden_at is null
      and e.starts_at > now() and e.starts_at <= now() + interval '2 hours'
    for update skip locked
  loop
    perform private.notificar(x.uid, 'evento_lembrete', null, null, null, v_e.id)
    from (
      select v_e.organizer_id as uid
      union all
      select ep.user_id from public.event_participants ep where ep.event_id = v_e.id and ep.status = 'confirmado'
    ) x;
    update public.events set reminded_at = now() where id = v_e.id;
  end loop;

  for v_e in
    select e.id, e.organizer_id, e.cancelled_at is null and e.hidden_at is null as aconteceu
    from public.events e
    where e.settled_at is null and e.over_at <= now()
    for update skip locked
  loop
    if v_e.aconteceu then
      perform private.conceder(ep.user_id, 'argonauta')
      from public.event_participants ep
      where ep.event_id = v_e.id and ep.status = 'confirmado';
      if (select count(*) from public.event_participants ep where ep.event_id = v_e.id and ep.status = 'confirmado') >= 3 then
        perform private.conceder(v_e.organizer_id, 'dionisio');
      end if;
    end if;
    -- o lembrete de um evento que já acabou não serve mais
    delete from public.notifications n where n.event_id = v_e.id and n.type = 'evento_lembrete';
    update public.events set settled_at = now() where id = v_e.id;
  end loop;
end
$$;

select cron.schedule('peripatos-eventos', '*/10 * * * *', $$select private.tarefas_de_eventos()$$);

revoke all on function
  private.exigir_para_eventos(),
  private.exigir_termos_para_eventos(uuid),
  private.gravar_evento(uuid, text, text, timestamptz, timestamptz, public.event_modality, text, text, text, integer, integer[]),
  private.cancelar_evento_interno(uuid, boolean),
  private.blocks_eventos(),
  private.profiles_banido_eventos(),
  private.profiles_excluido_eventos(),
  private.tarefas_de_eventos()
from public, anon, authenticated;

revoke all on function
  public.eventos_proximos(boolean, public.event_modality),
  public.meus_eventos(),
  public.evento(uuid),
  public.criar_evento(text, text, timestamptz, timestamptz, public.event_modality, text, text, text, public.event_kind, integer, integer[]),
  public.editar_evento(uuid, text, text, timestamptz, timestamptz, public.event_modality, text, text, text, integer, integer[]),
  public.cancelar_evento(uuid),
  public.participar_evento(uuid),
  public.sair_do_evento(uuid),
  public.responder_pedido(uuid, uuid, boolean),
  public.remover_participante(uuid, uuid),
  public.denunciar_evento(uuid, public.report_reason, text),
  public.ocultar_evento(uuid, text),
  public.minhas_notificacoes()
from public, anon;
grant execute on function
  public.eventos_proximos(boolean, public.event_modality),
  public.meus_eventos(),
  public.evento(uuid),
  public.criar_evento(text, text, timestamptz, timestamptz, public.event_modality, text, text, text, public.event_kind, integer, integer[]),
  public.editar_evento(uuid, text, text, timestamptz, timestamptz, public.event_modality, text, text, text, integer, integer[]),
  public.cancelar_evento(uuid),
  public.participar_evento(uuid),
  public.sair_do_evento(uuid),
  public.responder_pedido(uuid, uuid, boolean),
  public.remover_participante(uuid, uuid),
  public.denunciar_evento(uuid, public.report_reason, text),
  public.ocultar_evento(uuid, text),
  public.minhas_notificacoes()
to authenticated;
