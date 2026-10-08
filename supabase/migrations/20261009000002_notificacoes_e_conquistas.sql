-- =============================================================================
-- 17 · Notificações e conquistas (marco 3)
-- =============================================================================
-- Regras, todas impostas aqui:
--   - notificação e conquista só nascem no banco: por trigger no evento que as
--     causa, por um job agendado (as que dependem de tempo) ou por uma RPC de
--     admin que grava em moderation_actions. Nenhum usuário tem INSERT;
--   - só o dono lê as próprias notificações, e as que apontam para alguém que
--     ele não pode ver (bloqueio, banimento) não aparecem;
--   - bloquear apaga as notificações entre os dois; excluir a conta apaga as
--     da pessoa e as que apontam para ela;
--   - conquista ganha é permanente: não existe DELETE. A pessoa só escolhe se
--     ela aparece no perfil (coluna hidden);
--   - conquista secreta não aparece no catálogo de quem ainda não viu ninguém
--     com ela;
--   - nada aqui registra acesso nem atividade nova. A Coruja de Atena usa a
--     hora que posts e mensagens já guardavam.
-- =============================================================================

create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------------------
-- Configuração que muda por ambiente e não vai para o git
-- ---------------------------------------------------------------------------
--   fundador_ate  -> fim do beta (timestamptz). Ausente: o beta está aberto.
--   enigma_hash   -> hash da resposta do Minotauro. Ausente: ninguém acerta.
-- Como trocar: docs/conquistas.md.
create table private.config (
  chave         text primary key check (chave ~ '^[a-z_]{1,40}$'),
  valor         text not null,
  atualizado_em timestamptz not null default now()
);
alter table private.config enable row level security;
alter table private.config force row level security;
revoke all on private.config from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- Catálogo de conquistas
-- ---------------------------------------------------------------------------
create table public.achievements (
  slug               text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name               text not null check (char_length(name) between 1 and 60),
  description        text not null check (char_length(description) between 1 and 200),
  emoji              text not null check (char_length(emoji) between 1 and 8),
  -- o que o leitor de tela diz no lugar do emoji
  emoji_label        text not null check (char_length(emoji_label) between 1 and 40),
  color              text not null check (color ~ '^#[0-9a-f]{6}$'),
  -- não aparece na lista até ser ganha
  is_secret          boolean not null default false,
  -- nasce escondida do perfil; a pessoa mostra se quiser
  private_by_default boolean not null default false,
  -- só entra pela RPC de admin, com registro em moderation_actions
  is_manual          boolean not null default false,
  position           smallint not null unique
);

insert into public.achievements
  (position, slug, name, description, emoji, emoji_label, color, is_secret, private_by_default, is_manual)
values
  (1,  'fundador',              'Fundador',              'Chegou durante o beta, antes de todo mundo.',                           '🏛️', 'templo',            '#8a6d1f', false, false, false),
  (2,  'peripatetico',          'Peripatético',          'Publicou o primeiro post.',                                             '🚶', 'pessoa caminhando', '#1e7a5a', false, false, false),
  (3,  'conhece-te-a-ti-mesmo', 'Conhece-te a ti mesmo', 'Preencheu a bio, escolheu um avatar e marcou seus gostos.',             '🪞', 'espelho',           '#2f6f9f', false, false, false),
  (4,  'hermes',                'Hermes',                'Enviou a primeira mensagem.',                                           '📨', 'carta chegando',    '#35608f', false, false, false),
  (5,  'xenia',                 'Xênia',                 'Foi o primeiro mútuo de alguém que tinha acabado de chegar.',           '🤝', 'aperto de mãos',    '#b0562a', false, false, false),
  (6,  'ponte',                 'Ponte',                 'Virou mútuo de alguém de outro curso.',                                 '🌉', 'ponte',             '#2a7f8f', false, false, false),
  (7,  'polimata',              'Polímata',              'Marcou gostos em pelo menos cinco categorias diferentes.',              '📚', 'livros',            '#7a3f8f', false, false, false),
  (8,  'simposio',              'Simpósio',              'Teve dez mútuos ao mesmo tempo.',                                       '🍷', 'taça de vinho',     '#8f2a4a', false, false, false),
  (9,  'koinonia',              'Koinonia',              'Faz parte de um trio em que os três se seguem.',                        '🔺', 'triângulo',         '#3f6f2a', false, false, false),
  (10, 'philia',                'Philia',                'É mútuo da mesma pessoa há seis meses, sem interrupção.',               '💛', 'coração amarelo',   '#a37a00', false, false, false),
  (11, 'odisseia',              'Odisseia',              'Completou um ano de conta.',                                            '⛵', 'veleiro',           '#1f5f8a', false, false, false),
  (12, 'heracles',              'Héracles',              'Reportou um bug que foi confirmado.',                                   '🦁', 'leão',              '#9a4a12', false, false, true),
  (13, 'coruja-de-atena',       'Coruja de Atena',       'Escreveu de madrugada, quando só as corujas estão acordadas.',          '🦉', 'coruja',            '#5b4b8a', true,  true,  false),
  (14, 'minotauro',             'Minotauro',             'Encontrou a saída do labirinto.',                                       '🐂', 'touro',             '#5a3a2a', true,  false, false);

-- Quem ganhou o quê. Sem coluna que diga POR QUE ou COM QUEM: a Koinonia não
-- guarda quem são os outros dois.
create table public.user_achievements (
  user_id          uuid not null references public.profiles (id) on delete cascade,
  achievement_slug text not null references public.achievements (slug),
  hidden           boolean not null default false,
  primary key (user_id, achievement_slug)
);
create index user_achievements_visiveis on public.user_achievements (achievement_slug) where not hidden;

-- A data fica fora da API. Três pessoas que fecham um trio ganham a Koinonia
-- no mesmo instante, e a data igual diria quem são as outras duas. Cada um lê
-- a própria data pela RPC minhas_conquistas().
create table private.achievement_dates (
  user_id          uuid not null,
  achievement_slug text not null,
  earned_at        timestamptz not null default now(),
  primary key (user_id, achievement_slug),
  foreign key (user_id, achievement_slug)
    references public.user_achievements (user_id, achievement_slug) on delete cascade
);
alter table private.achievement_dates enable row level security;
alter table private.achievement_dates force row level security;
revoke all on private.achievement_dates from anon, authenticated, public;

alter table public.achievements      enable row level security;
alter table public.achievements      force row level security;
alter table public.user_achievements enable row level security;
alter table public.user_achievements force row level security;
revoke all on public.achievements, public.user_achievements from anon, authenticated, public;

-- Repare no que NÃO existe: INSERT e DELETE.
grant select on public.user_achievements to authenticated;
grant update (hidden) on public.user_achievements to authenticated;

-- As próprias, sempre. As dos outros, só as que a pessoa deixou à mostra, e
-- só de quem é visível para quem lê (mesma instituição, ativa, sem bloqueio).
create policy user_achievements_select on public.user_achievements
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      not hidden
      and (select private.is_active((select auth.uid())))
      and private.can_see((select auth.uid()), user_id)
    )
  );

create policy user_achievements_update on public.user_achievements
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- O catálogo. Uma conquista secreta só existe para quem consegue ver alguém
-- com ela (a própria pessoa ou outra que a deixou à mostra): a subconsulta
-- passa pelo RLS de user_achievements de quem está lendo.
grant select on public.achievements to authenticated;
create policy achievements_select on public.achievements
  for select to authenticated
  using (
    not is_secret
    or exists (
      select 1 from public.user_achievements ua where ua.achievement_slug = achievements.slug
    )
  );

-- ---------------------------------------------------------------------------
-- Notificações
-- ---------------------------------------------------------------------------
-- actor_id é a pessoa para quem a notificação aponta (quem seguiu, o mútuo).
-- As duas chaves são ON DELETE CASCADE: excluir a conta apaga as notificações
-- da pessoa e as que apontam para ela.
--
-- "Sua denúncia foi analisada" não guarda qual denúncia nem o que foi
-- decidido: não há o que revelar sobre a medida tomada contra a outra pessoa.
create table public.notifications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  type             public.notification_type not null,
  actor_id         uuid references public.profiles (id) on delete cascade,
  achievement_slug text references public.achievements (slug),
  -- clock_timestamp: duas notificações da mesma transação precisam de ordem
  created_at       timestamptz not null default clock_timestamp(),
  read_at          timestamptz,
  -- quando o push desta notificação foi enviado (no máximo um)
  pushed_at        timestamptz,
  constraint notifications_forma check (
    (type in ('novo_seguidor', 'mutuo')) = (actor_id is not null)
    and (type = 'conquista') = (achievement_slug is not null)
  ),
  constraint notifications_sem_si_mesmo check (actor_id is null or actor_id <> user_id)
);
create index notifications_do_dono on public.notifications (user_id, created_at desc);
create index notifications_do_ator on public.notifications (actor_id) where actor_id is not null;
create index notifications_por_idade on public.notifications (created_at);

alter table public.notifications enable row level security;
alter table public.notifications force row level security;
revoke all on public.notifications from anon, authenticated, public;

-- Só leitura, só do dono. Marcar como lida é pela RPC.
grant select on public.notifications to authenticated;
create policy notifications_select on public.notifications
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and (actor_id is null or private.can_see((select auth.uid()), actor_id))
  );

-- Quais tipos viram notificação push. É da conta, não do aparelho: o aparelho
-- continua sendo ligado e desligado em push_subscriptions. Sem linha, valem
-- os padrões: mensagens sim (como já era), o resto não.
create table public.push_preferences (
  user_id       uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  mensagem      boolean not null default true,
  novo_seguidor boolean not null default false,
  mutuo         boolean not null default false,
  avatar        boolean not null default false,
  denuncia      boolean not null default false,
  termos        boolean not null default false,
  conquista     boolean not null default false
);
alter table public.push_preferences enable row level security;
alter table public.push_preferences force row level security;
revoke all on public.push_preferences from anon, authenticated, public;
grant select on public.push_preferences to authenticated;
grant insert (mensagem, novo_seguidor, mutuo, avatar, denuncia, termos, conquista) on public.push_preferences to authenticated;
grant update (mensagem, novo_seguidor, mutuo, avatar, denuncia, termos, conquista) on public.push_preferences to authenticated;

create policy push_preferences_select on public.push_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy push_preferences_insert on public.push_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy push_preferences_update on public.push_preferences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- p_tipo: 'mensagem' ou um valor de notification_type.
create function private.quer_push(p_uid uuid, p_tipo text)
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
        else false
      end
      from public.push_preferences pp
      where pp.user_id = p_uid
    ),
    p_tipo = 'mensagem'
  )
$$;

-- Avisa o canal privado da pessoa de que há notificação nova. Sem conteúdo: a
-- tela busca pela API, onde o RLS decide de novo.
create function private.avisar_notificacao(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(jsonb_build_object('tipo', 'nova'), 'notificacao', 'usuario:' || p_uid::text, true);
exception when others then
  -- O tempo real é conveniência. Uma falha aqui não pode desfazer o que gerou a notificação.
  null;
end
$$;

-- Pede o push de UMA notificação à mesma Edge Function das mensagens, com o
-- mesmo endereço e o mesmo segredo do Vault. O pedido leva só o id. Só sai se
-- a pessoa escolheu receber este tipo e tem algum aparelho inscrito.
create function private.pedir_push_de_notificacao(p_notificacao uuid, p_uid uuid, p_tipo public.notification_type)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_segredo text;
begin
  if not private.quer_push(p_uid, p_tipo::text)
     or not exists (select 1 from public.push_subscriptions s where s.user_id = p_uid) then
    return;
  end if;
  select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'peripatos_push_url';
  select ds.decrypted_secret into v_segredo from vault.decrypted_secrets ds where ds.name = 'peripatos_push_segredo';
  if coalesce(v_url, '') = '' or coalesce(v_segredo, '') = '' then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('notificacaoId', p_notificacao),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-peripatos-segredo', v_segredo),
    timeout_milliseconds := 8000
  );
exception when others then
  null;
end
$$;

create function private.notifications_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.avisar_notificacao(new.user_id);
  perform private.pedir_push_de_notificacao(new.id, new.user_id, new.type);
  return null;
end
$$;

create trigger notifications_depois_de_inserir
  after insert on public.notifications
  for each row execute function private.notifications_after_insert();

-- O único jeito de uma notificação nascer.
create function private.notificar(
  p_uid uuid,
  p_tipo public.notification_type,
  p_ator uuid default null,
  p_conquista text default null
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
  insert into public.notifications (user_id, type, actor_id, achievement_slug)
  values (p_uid, p_tipo, p_ator, p_conquista);
end
$$;

-- ---------------------------------------------------------------------------
-- Conceder: o único jeito de uma conquista nascer
-- ---------------------------------------------------------------------------
create function private.conceder(p_uid uuid, p_slug text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_achievements (user_id, achievement_slug, hidden)
  select p.id, a.slug, a.private_by_default
  from public.achievements a
  join public.profiles p on p.id = p_uid
  where a.slug = p_slug
  on conflict (user_id, achievement_slug) do nothing;
  if not found then
    return false;
  end if;
  insert into private.achievement_dates (user_id, achievement_slug) values (p_uid, p_slug);
  return true;
end
$$;

-- Ganhar conquista gera notificação.
create function private.user_achievements_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notificar(new.user_id, 'conquista', null, new.achievement_slug);
  return null;
end
$$;

create trigger user_achievements_notifica
  after insert on public.user_achievements
  for each row execute function private.user_achievements_after_insert();

-- ---------------------------------------------------------------------------
-- As regras de cada conquista
-- ---------------------------------------------------------------------------
create function private.mutuos_de(p_uid uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select f.followee_id
  from public.follows f
  join public.follows g on g.follower_id = f.followee_id and g.followee_id = f.follower_id
  where f.follower_id = p_uid
$$;

-- Entre 01:00 e 04:30 no horário de Brasília.
create function private.hora_da_coruja(p_quando timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (p_quando at time zone 'America/Sao_Paulo')::time between time '01:00' and time '04:30'
$$;

-- Fundador (conta criada antes do fim do beta) e Conhece-te a ti mesmo (bio,
-- avatar aprovado ou pronto, e ao menos um gosto). Só as tags comuns contam:
-- uma conquista pública não pode denunciar que alguém tem tag sensível.
create function private.conquistas_do_perfil(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil public.profiles;
  v_ate    timestamptz;
begin
  select * into v_perfil from public.profiles p where p.id = p_uid;
  if not found or not v_perfil.onboarding_completo then
    return;
  end if;

  select c.valor::timestamptz into v_ate from private.config c where c.chave = 'fundador_ate';
  if v_ate is null or v_perfil.created_at < v_ate then
    perform private.conceder(p_uid, 'fundador');
  end if;

  if btrim(coalesce(v_perfil.bio, '')) <> ''
     and (v_perfil.avatar_status = 'aprovado' or v_perfil.avatar_preset is not null)
     and exists (select 1 from public.profile_tags pt where pt.user_id = p_uid) then
    perform private.conceder(p_uid, 'conhece-te-a-ti-mesmo');
  end if;
end
$$;

-- Polímata: tags comuns em cinco categorias ou mais. profile_tags só tem tag
-- comum (o banco recusa sensível nessa tabela), mas a conta confere de novo.
create function private.conquistas_das_tags(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select count(distinct t.category)
    from public.profile_tags pt
    join public.tags t on t.id = pt.tag_id
    where pt.user_id = p_uid and not t.is_sensitive
  ) >= 5 then
    perform private.conceder(p_uid, 'polimata');
  end if;
  perform private.conquistas_do_perfil(p_uid);
end
$$;

-- Peripatético / Hermes (p_primeira) e a Coruja, pela hora do que foi escrito.
create function private.conquistas_de_escrita(p_uid uuid, p_quando timestamptz, p_primeira text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.conceder(p_uid, p_primeira);
  if private.hora_da_coruja(p_quando) then
    perform private.conceder(p_uid, 'coruja-de-atena');
  end if;
end
$$;

-- p_a e p_b acabaram de virar mútuos.
create function private.conquistas_de_mutuo(p_a uuid, p_b uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_par      record;
  v_terceiro uuid;
  v_trio     boolean := false;
begin
  for v_par in select * from (values (p_a, p_b), (p_b, p_a)) as x (eu, outro) loop
    -- Xênia: ser o primeiro mútuo de quem tem conta de até 14 dias.
    if exists (
         select 1 from public.profiles p
         where p.id = v_par.outro and p.created_at > now() - interval '14 days'
       )
       and (select count(*) from private.mutuos_de(v_par.outro)) = 1 then
      perform private.conceder(v_par.eu, 'xenia');
    end if;

    -- Simpósio: dez mútuos ao mesmo tempo.
    if (select count(*) from private.mutuos_de(v_par.eu)) >= 10 then
      perform private.conceder(v_par.eu, 'simposio');
    end if;
  end loop;

  -- Ponte: os dois têm tag de curso e nenhuma em comum.
  if exists (select 1 from public.profile_tags pt join public.tags t on t.id = pt.tag_id
             where pt.user_id = p_a and t.category = 'cursos')
     and exists (select 1 from public.profile_tags pt join public.tags t on t.id = pt.tag_id
                 where pt.user_id = p_b and t.category = 'cursos')
     and not exists (
       select 1
       from public.profile_tags ta
       join public.profile_tags tb on tb.tag_id = ta.tag_id
       join public.tags t on t.id = ta.tag_id
       where ta.user_id = p_a and tb.user_id = p_b and t.category = 'cursos'
     ) then
    perform private.conceder(p_a, 'ponte');
    perform private.conceder(p_b, 'ponte');
  end if;

  -- Koinonia: quem é mútuo dos dois fecha um trio com eles. Os três ganham, e
  -- nada do que é gravado diz com quem.
  for v_terceiro in
    select m from private.mutuos_de(p_a) m
    intersect
    select m from private.mutuos_de(p_b) m
  loop
    v_trio := true;
    perform private.conceder(v_terceiro, 'koinonia');
  end loop;
  if v_trio then
    perform private.conceder(p_a, 'koinonia');
    perform private.conceder(p_b, 'koinonia');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Triggers: cada evento gera suas notificações e suas conquistas
-- ---------------------------------------------------------------------------
create function private.follows_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serializa por par: se os dois seguem ao mesmo tempo, em transações
  -- diferentes, a segunda a chegar aqui enxerga a primeira e o "viraram
  -- mútuos" acontece uma vez, e não nenhuma.
  perform pg_advisory_xact_lock(hashtextextended(
    'peripatos:par:' || least(new.follower_id, new.followee_id)::text || ':' || greatest(new.follower_id, new.followee_id)::text, 0));

  if exists (
    select 1 from public.follows f
    where f.follower_id = new.followee_id and f.followee_id = new.follower_id
  ) then
    perform private.notificar(new.followee_id, 'mutuo', new.follower_id);
    perform private.notificar(new.follower_id, 'mutuo', new.followee_id);
    perform private.conquistas_de_mutuo(new.follower_id, new.followee_id);
  else
    perform private.notificar(new.followee_id, 'novo_seguidor', new.follower_id);
  end if;
  return null;
end
$$;

create trigger follows_notifica
  after insert on public.follows
  for each row execute function private.follows_after_insert();

-- Bloquear apaga as notificações entre os dois, nos dois sentidos. (A
-- política de leitura já as esconderia; apagar faz com que não voltem se o
-- bloqueio for desfeito.)
create function private.blocks_apaga_notificacoes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications n
  where (n.user_id = new.blocker_id and n.actor_id = new.blocked_id)
     or (n.user_id = new.blocked_id and n.actor_id = new.blocker_id);
  return null;
end
$$;

create trigger blocks_apaga_notificacoes
  after insert on public.blocks
  for each row execute function private.blocks_apaga_notificacoes();

create function private.profiles_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.avatar_status = 'pendente' and new.avatar_status = 'aprovado' then
    perform private.notificar(new.id, 'avatar_aprovado');
  elsif old.avatar_status = 'pendente' and new.avatar_status = 'recusado' then
    perform private.notificar(new.id, 'avatar_recusado');
  end if;
  perform private.conquistas_do_perfil(new.id);
  return null;
end
$$;

create trigger profiles_notifica
  after update of onboarding_completo, bio, avatar_status, avatar_preset on public.profiles
  for each row execute function private.profiles_after_update();

create function private.profile_tags_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.conquistas_das_tags(new.user_id);
  return null;
end
$$;

create trigger profile_tags_conquistas
  after insert on public.profile_tags
  for each row execute function private.profile_tags_after_insert();

create function private.posts_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.conquistas_de_escrita(new.author_id, new.created_at, 'peripatetico');
  return null;
end
$$;

create trigger posts_conquistas
  after insert on public.posts
  for each row execute function private.posts_after_insert();

create function private.messages_conquistas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.conquistas_de_escrita(new.sender_id, new.created_at, 'hermes');
  return null;
end
$$;

create trigger messages_conquistas
  after insert on public.messages
  for each row execute function private.messages_conquistas();

-- A denúncia saiu da fila: quem denunciou fica sabendo que foi analisada, e
-- só isso.
create function private.reports_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('resolvida', 'rejeitada') and old.status not in ('resolvida', 'rejeitada') then
    perform private.notificar(new.reporter_id, 'denuncia_analisada');
  end if;
  return null;
end
$$;

create trigger reports_notifica
  after update of status on public.reports
  for each row execute function private.reports_after_update();

-- ---------------------------------------------------------------------------
-- Termos: a versão vigente passa a ser uma linha, e publicar uma é um evento
-- ---------------------------------------------------------------------------
-- Antes a versão era o corpo de uma função, e trocar a função não dispara
-- nada. Agora publicar uma versão é um INSERT: o trigger avisa quem tinha
-- aceitado a anterior. Para mudar os Termos, uma migration nova insere a
-- versão aqui (e o app troca a constante em src/lib/legal.ts).
create table private.termos_versoes (
  versao       text primary key check (versao ~ '^[0-9a-z.-]{1,40}$'),
  publicada_em timestamptz not null default clock_timestamp()
);
alter table private.termos_versoes enable row level security;
alter table private.termos_versoes force row level security;
revoke all on private.termos_versoes from anon, authenticated, public;

-- A versão que valia até aqui entra antes do trigger existir: não é novidade.
insert into private.termos_versoes (versao, publicada_em)
values ('2026-10-08-rascunho', now() - interval '1 day');

create or replace function private.termos_versao_atual()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select v.versao from private.termos_versoes v order by v.publicada_em desc, v.versao desc limit 1
$$;

create function private.termos_versoes_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notificar(a.user_id, 'termos_atualizados')
  from private.accounts a
  join public.profiles p on p.id = a.user_id
  where p.onboarding_completo
    and a.termos_versao is distinct from new.versao;
  return null;
end
$$;

create trigger termos_versoes_notifica
  after insert on private.termos_versoes
  for each row execute function private.termos_versoes_after_insert();

-- ---------------------------------------------------------------------------
-- Job diário (pg_cron): o que depende de tempo
-- ---------------------------------------------------------------------------
create function private.tarefas_diarias()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Notificações com mais de 60 dias são apagadas.
  delete from public.notifications n where n.created_at < now() - interval '60 days';

  -- Odisseia: um ano de conta.
  perform private.conceder(p.id, 'odisseia')
  from public.profiles p
  where p.onboarding_completo
    and p.created_at <= now() - interval '1 year'
    and not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = p.id and ua.achievement_slug = 'odisseia'
    );

  -- Philia: mútuos há seis meses sem interrupção. O mútuo começa quando o
  -- segundo dos dois follows foi criado; deixar de seguir apaga a linha, e
  -- seguir de novo cria outra, com data nova. É isso que zera a contagem.
  perform private.conceder(f.follower_id, 'philia')
  from public.follows f
  join public.follows g on g.follower_id = f.followee_id and g.followee_id = f.follower_id
  where greatest(f.created_at, g.created_at) <= now() - interval '6 months'
    and not exists (
      select 1 from public.user_achievements ua
      where ua.user_id = f.follower_id and ua.achievement_slug = 'philia'
    );
end
$$;

-- 03:23 em Brasília. Agendar de novo com o mesmo nome só atualiza o job.
select cron.schedule('peripatos-tarefas-diarias', '23 6 * * *', $$select private.tarefas_diarias()$$);

revoke all on function
  private.quer_push(uuid, text),
  private.avisar_notificacao(uuid),
  private.pedir_push_de_notificacao(uuid, uuid, public.notification_type),
  private.notifications_after_insert(),
  private.notificar(uuid, public.notification_type, uuid, text),
  private.conceder(uuid, text),
  private.user_achievements_after_insert(),
  private.mutuos_de(uuid),
  private.hora_da_coruja(timestamptz),
  private.conquistas_do_perfil(uuid),
  private.conquistas_das_tags(uuid),
  private.conquistas_de_escrita(uuid, timestamptz, text),
  private.conquistas_de_mutuo(uuid, uuid),
  private.follows_after_insert(),
  private.blocks_apaga_notificacoes(),
  private.profiles_after_update(),
  private.profile_tags_after_insert(),
  private.posts_after_insert(),
  private.messages_conquistas(),
  private.reports_after_update(),
  private.termos_versoes_after_insert(),
  private.tarefas_diarias()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs de quem usa o app
-- ---------------------------------------------------------------------------
-- A aba de notificações de quem chama, já agrupada: seguidores novos (e
-- denúncias analisadas) do mesmo dia viram uma linha só, "3 pessoas te
-- seguiram". "Viraram mútuos" nunca é agrupado: cada um é um momento.
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
  conquista_cor text
)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (select auth.uid() as id),
  visiveis as (
    select n.id, n.type, n.actor_id, n.achievement_slug, n.created_at,
           n.read_at is not null as lida,
           case when n.type in ('novo_seguidor', 'denuncia_analisada')
                then n.type::text || ':' || (n.read_at is not null)::text || ':'
                     || ((n.created_at at time zone 'America/Sao_Paulo')::date)::text
                else n.id::text
           end as grupo
    from public.notifications n
    cross join eu
    where n.user_id = eu.id
      -- o mesmo filtro da política: quem você bloqueou (ou foi banido) some
      and (n.actor_id is null or private.can_see(eu.id, n.actor_id))
  ),
  grupos as (
    select v.grupo, v.type, v.achievement_slug,
           count(*)::integer as quantidade, max(v.created_at) as ultima_em, bool_and(v.lida) as lida
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
    a.slug, a.name, a.emoji, a.emoji_label, a.color
  from grupos g
  left join public.achievements a on a.slug = g.achievement_slug
  order by g.ultima_em desc, g.grupo
  limit 100
$$;

-- O contador da aba conta o que a aba mostra: grupos, não linhas.
create function public.total_notificacoes_nao_lidas()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.minhas_notificacoes() n where not n.lida
$$;

create function public.marcar_notificacoes_lidas()
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
  update public.notifications set read_at = now() where user_id = v_uid and read_at is null;
end
$$;

-- As conquistas de quem chama, com a data. É o único lugar em que a data sai.
create function public.minhas_conquistas()
returns table (slug text, ganha_em timestamptz, oculta boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select ua.achievement_slug, d.earned_at, ua.hidden
  from public.user_achievements ua
  join private.achievement_dates d on d.user_id = ua.user_id and d.achievement_slug = ua.achievement_slug
  where ua.user_id = (select auth.uid())
  order by d.earned_at desc, ua.achievement_slug
$$;

-- ---------------------------------------------------------------------------
-- Conquista dada à mão (Héracles): só admin, sempre com registro
-- ---------------------------------------------------------------------------
create function public.conceder_conquista(p_user_id uuid, p_conquista text, p_motivo text)
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

  -- Mesma resposta para "não existe" e "não é das que se concede à mão": não
  -- confirma a existência de uma conquista secreta.
  if not exists (select 1 from public.achievements a where a.slug = p_conquista and a.is_manual) then
    raise exception 'Esta conquista não pode ser concedida à mão.' using errcode = 'PT400';
  end if;
  if p_user_id = v_uid then
    raise exception 'Você não pode conceder uma conquista a si mesmo.' using errcode = 'PT400';
  end if;
  if not private.is_active(p_user_id) then
    raise exception 'Só contas ativas recebem conquista.' using errcode = 'PT400';
  end if;
  if not private.conceder(p_user_id, p_conquista) then
    raise exception 'Esta pessoa já tem esta conquista.' using errcode = 'PT409';
  end if;

  insert into public.moderation_actions (institution_id, actor_id, action, target_user_id, reason, metadata)
  values (v_inst, v_uid, 'conceder_conquista', p_user_id, v_motivo, jsonb_build_object('conquista', p_conquista));
end
$$;

-- ---------------------------------------------------------------------------
-- Minotauro: só a mecânica
-- ---------------------------------------------------------------------------
-- A resposta certa nunca está no código nem no git: o banco guarda só um hash
-- bcrypt dela em private.config ('enigma_hash'). Sem hash, ninguém acerta.
-- Maiúsculas, espaços nas pontas e espaços repetidos não contam.
create function private.normalizar_resposta(p_resposta text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(btrim(p_resposta), '\s+', ' ', 'g'))
$$;

-- Define (ou troca) a resposta. Só roda por SQL direto, com o papel do banco;
-- nenhum papel da API executa. Ver docs/conquistas.md.
create function private.definir_resposta_do_enigma(p_resposta text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_resposta is null or char_length(private.normalizar_resposta(p_resposta)) not between 1 and 72 then
    raise exception 'A resposta precisa ter de 1 a 72 caracteres.';
  end if;
  insert into private.config (chave, valor)
  values ('enigma_hash', extensions.crypt(private.normalizar_resposta(p_resposta), extensions.gen_salt('bf', 10)))
  on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
end
$$;

-- Recebe uma tentativa. Devolve true se acertou (e concede o Minotauro).
-- Errar devolve false em vez de levantar erro: um erro desfaria a transação, e
-- com ela o registro da tentativa. Limite: 5 por hora e 20 por dia, e toda
-- tentativa conta, certa ou errada.
create function public.responder_enigma(p_resposta text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_hash text;
begin
  if v_uid is null then
    raise exception 'Login necessário.' using errcode = 'PT401';
  end if;
  if not private.is_active(v_uid) then
    raise exception 'Sem permissão para esta ação.' using errcode = 'PT403';
  end if;
  if p_resposta is null or char_length(p_resposta) not between 1 and 200 then
    raise exception 'Resposta inválida.' using errcode = 'PT400';
  end if;
  if exists (
    select 1 from public.user_achievements ua
    where ua.user_id = v_uid and ua.achievement_slug = 'minotauro'
  ) then
    return true;
  end if;

  -- serializa por pessoa: tentativas paralelas não furam o limite
  perform pg_advisory_xact_lock(hashtextextended('peripatos:rate:enigma:' || v_uid::text, 0));
  delete from private.rate_limit_events e
  where e.user_id = v_uid and e.action = 'enigma' and e.created_at <= now() - interval '1 day';
  if (select count(*) from private.rate_limit_events e
       where e.user_id = v_uid and e.action = 'enigma' and e.created_at > now() - interval '1 hour') >= 5
     or (select count(*) from private.rate_limit_events e
          where e.user_id = v_uid and e.action = 'enigma') >= 20 then
    raise exception 'Muitas tentativas. Volte mais tarde.'
      using errcode = 'PT429', hint = 'Tente novamente mais tarde.';
  end if;
  insert into private.rate_limit_events (user_id, action) values (v_uid, 'enigma');

  select c.valor into v_hash from private.config c where c.chave = 'enigma_hash';
  if v_hash is null
     or extensions.crypt(private.normalizar_resposta(p_resposta), v_hash) is distinct from v_hash then
    return false;
  end if;

  perform private.conceder(v_uid, 'minotauro');
  return true;
end
$$;

revoke all on function
  private.normalizar_resposta(text),
  private.definir_resposta_do_enigma(text)
from public, anon, authenticated;

revoke all on function
  public.minhas_notificacoes(),
  public.total_notificacoes_nao_lidas(),
  public.marcar_notificacoes_lidas(),
  public.minhas_conquistas(),
  public.conceder_conquista(uuid, text, text),
  public.responder_enigma(text)
from public, anon;
grant execute on function
  public.minhas_notificacoes(),
  public.total_notificacoes_nao_lidas(),
  public.marcar_notificacoes_lidas(),
  public.minhas_conquistas(),
  public.conceder_conquista(uuid, text, text),
  public.responder_enigma(text)
to authenticated;

-- ---------------------------------------------------------------------------
-- Push: o que a Edge Function precisa saber, e nada além disso
-- ---------------------------------------------------------------------------
-- Como em preparar_notificacao (mensagens): o banco decide se o push sai e
-- marca como enviado na mesma chamada. Devolve só o destinatário e o tipo. O
-- texto do push é fixo por tipo e não cita ninguém: nem quem seguiu, nem qual
-- conquista (ela pode ser secreta), nem se a foto foi aprovada ou recusada.
create function public.preparar_push_de_notificacao(p_notificacao uuid)
returns table (destinatario uuid, tipo text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n record;
begin
  select n.id, n.user_id, n.type, n.actor_id
    into v_n
  from public.notifications n
  where n.id = p_notificacao
    and n.pushed_at is null
    and n.read_at is null
    and n.created_at > now() - interval '5 minutes'
  for update;

  if not found
     or not private.quer_push(v_n.user_id, v_n.type::text)
     or (v_n.actor_id is not null and not private.can_see(v_n.user_id, v_n.actor_id)) then
    return;
  end if;

  update public.notifications set pushed_at = now() where id = v_n.id;
  return query select v_n.user_id, v_n.type::text;
end
$$;
revoke all on function public.preparar_push_de_notificacao(uuid) from public, anon, authenticated;
grant execute on function public.preparar_push_de_notificacao(uuid) to service_role;

-- O push de mensagem passa a respeitar a escolha por tipo.
create or replace function public.preparar_notificacao(p_mensagem uuid)
returns table (destinatario uuid, remetente text, conversa uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg record;
  v_destino uuid;
begin
  select m.id, m.sender_id, m.conversation_id, c.user_a, c.user_b
    into v_msg
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where m.id = p_mensagem
    and m.notified_at is null
    and m.created_at > now() - interval '5 minutes'
  for update of m;

  if not found or not coalesce(private.pode_conversar(v_msg.user_a, v_msg.user_b), false) then
    return;
  end if;

  v_destino := case when v_msg.user_a = v_msg.sender_id then v_msg.user_b else v_msg.user_a end;
  if not private.quer_push(v_destino, 'mensagem') then
    return;
  end if;

  update public.messages set notified_at = now() where id = v_msg.id;

  return query
  select v_destino, p.display_name, v_msg.conversation_id
  from public.profiles p
  where p.id = v_msg.sender_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Quem já estava aqui: as conquistas que o que já existe no banco justifica
-- ---------------------------------------------------------------------------
-- Usa só o que já estava guardado (perfis, tags, posts, mensagens, follows).
-- Cada conquista dada aqui gera a notificação de conquista nova.
do $$
begin
  perform private.conquistas_das_tags(p.id) from public.profiles p where p.onboarding_completo;

  perform private.conceder(x.author_id, 'peripatetico')
  from (select distinct po.author_id from public.posts po) x;
  perform private.conceder(x.sender_id, 'hermes')
  from (select distinct m.sender_id from public.messages m) x;
  perform private.conceder(x.uid, 'coruja-de-atena')
  from (
    select po.author_id as uid from public.posts po where private.hora_da_coruja(po.created_at)
    union
    select m.sender_id from public.messages m where private.hora_da_coruja(m.created_at)
  ) x;

  perform private.conquistas_de_mutuo(f.follower_id, f.followee_id)
  from public.follows f
  join public.follows g on g.follower_id = f.followee_id and g.followee_id = f.follower_id
  where f.follower_id < f.followee_id;

  perform private.tarefas_diarias();
end
$$;

-- ---------------------------------------------------------------------------
-- Os Termos e a Política mudaram (notificações, conquistas): versão nova
-- ---------------------------------------------------------------------------
-- É o primeiro INSERT depois do trigger: quem já tinha conta recebe a
-- notificação de termos atualizados.
insert into private.termos_versoes (versao) values ('2026-10-09-rascunho');
