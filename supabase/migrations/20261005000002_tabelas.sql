-- =============================================================================
-- 02 · Tabelas
-- =============================================================================
-- Aqui só estrutura e constraints. RLS e GRANTs ficam em 05_rls.
-- Regra geral: o cliente nunca informa user_id / author_id / institution_id.
-- Os DEFAULTs que dependem de funções de private são adicionados em 03_helpers.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- public.institutions
-- ---------------------------------------------------------------------------
create table public.institutions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 120),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- private.institution_domains — allowlist de domínios de e-mail
-- ---------------------------------------------------------------------------
create table private.institution_domains (
  domain         text primary key check (domain = lower(domain) and domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- public.profiles — a parte pública da conta
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  institution_id      uuid not null references public.institutions (id),
  username            text check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name        text check (char_length(btrim(display_name)) between 1 and 50),
  bio                 text check (char_length(bio) <= 300),
  avatar_path         text,
  avatar_status       public.avatar_status not null default 'sem_avatar',
  onboarding_completo boolean not null default false,
  banned_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- username único por instituição
  constraint profiles_username_por_instituicao unique (institution_id, username),
  -- alvo das FKs compostas que amarram institution_id ao dono da linha
  constraint profiles_id_institution_key unique (id, institution_id),
  -- onboarding completo exige username e display_name
  constraint profiles_onboarding_campos check (
    not onboarding_completo or (username is not null and display_name is not null)
  ),
  constraint profiles_avatar_coerente check (
    (avatar_status = 'sem_avatar') = (avatar_path is null)
  )
);

-- ---------------------------------------------------------------------------
-- private.accounts — dados pessoais que nunca saem pela API
-- ---------------------------------------------------------------------------
-- O e-mail vive só em auth.users. RA e data de nascimento vivem só aqui.
create table private.accounts (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  institution_id uuid not null references public.institutions (id),
  ra             text not null check (ra ~ '^[0-9]{3,20}$'),
  birth_date     date check (birth_date between date '1900-01-01' and date '2100-01-01'),
  created_at     timestamptz not null default now(),
  unique (institution_id, ra)
);

-- ---------------------------------------------------------------------------
-- private.banned_emails — HMAC-SHA256(e-mail, segredo do Vault)
-- ---------------------------------------------------------------------------
-- Hash puro seria reversível: nome.RA@dominio é enumerável. O HMAC depende de
-- um segredo que só existe no Vault.
create table private.banned_emails (
  email_hmac     bytea primary key check (octet_length(email_hmac) = 32),
  institution_id uuid references public.institutions (id) on delete set null,
  banned_by      uuid references auth.users (id) on delete set null,
  reason         text,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- private.rate_limit_events — base dos rate limits
-- ---------------------------------------------------------------------------
-- Contamos eventos, não linhas das tabelas: assim seguir/deixar de seguir em
-- loop não zera o contador.
create table private.rate_limit_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  action     text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_events_lookup on private.rate_limit_events (user_id, action, created_at desc);

-- ---------------------------------------------------------------------------
-- public.tags — vocabulário controlado (sem texto livre)
-- ---------------------------------------------------------------------------
create table public.tags (
  id           integer generated always as identity primary key,
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name         text not null check (char_length(name) between 1 and 60),
  category     text not null check (category ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  is_sensitive boolean not null default false,
  created_at   timestamptz not null default now()
);
create index tags_category on public.tags (category);

-- ---------------------------------------------------------------------------
-- public.tag_requests — pedidos de tag nova
-- ---------------------------------------------------------------------------
create table public.tag_requests (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid(),
  institution_id uuid not null,
  name           text not null check (char_length(btrim(name)) between 2 and 60),
  category       text check (char_length(category) <= 60),
  justification  text check (char_length(justification) <= 500),
  status         public.tag_request_status not null default 'pendente',
  resolved_by    uuid references public.profiles (id) on delete set null,
  resolved_at    timestamptz,
  created_at     timestamptz not null default now(),
  foreign key (user_id, institution_id) references public.profiles (id, institution_id) on delete cascade
);
create index tag_requests_fila on public.tag_requests (institution_id, status, created_at);

-- ---------------------------------------------------------------------------
-- public.profile_tags — tags comuns
-- ---------------------------------------------------------------------------
create table public.profile_tags (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  tag_id     integer not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tag_id)
);
create index profile_tags_tag on public.profile_tags (tag_id);

-- ---------------------------------------------------------------------------
-- public.profile_sensitive_tags — tabela SEPARADA, leitura só dono + mutuals
-- ---------------------------------------------------------------------------
create table public.profile_sensitive_tags (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  tag_id     integer not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tag_id)
);
create index profile_sensitive_tags_tag on public.profile_sensitive_tags (tag_id);

-- ---------------------------------------------------------------------------
-- public.follows
-- ---------------------------------------------------------------------------
create table public.follows (
  follower_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_sem_self_follow check (follower_id <> followee_id)
);
create index follows_followee on public.follows (followee_id);

-- ---------------------------------------------------------------------------
-- public.blocks
-- ---------------------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_sem_self_block check (blocker_id <> blocked_id)
);
create index blocks_blocked on public.blocks (blocked_id);

-- ---------------------------------------------------------------------------
-- public.posts — só texto + ID de GIF. Sem imagem, sem URL.
-- ---------------------------------------------------------------------------
create table public.posts (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null default auth.uid(),
  institution_id uuid not null,
  body           text not null default '' check (char_length(body) <= 500),
  -- Só o ID do GIF no provedor. Alfanumérico puro: impossível guardar URL.
  gif_id         text check (gif_id ~ '^[A-Za-z0-9]{1,64}$'),
  created_at     timestamptz not null default now(),
  edited_at      timestamptz,
  deleted_at     timestamptz,           -- soft delete pelo autor
  hidden_at      timestamptz,           -- ocultado pela moderação
  hidden_by      uuid references public.profiles (id) on delete set null,
  constraint posts_nao_vazio check (btrim(body) <> '' or gif_id is not null),
  -- a instituição do post é sempre a do autor
  foreign key (author_id, institution_id) references public.profiles (id, institution_id) on delete cascade
);
create index posts_feed on public.posts (institution_id, created_at desc, id desc)
  where deleted_at is null and hidden_at is null;
create index posts_autor on public.posts (author_id, created_at desc);

-- ---------------------------------------------------------------------------
-- public.reports — denúncia de post OU de perfil
-- ---------------------------------------------------------------------------
create table public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid not null default auth.uid(),
  institution_id  uuid not null,
  post_id         uuid references public.posts (id) on delete cascade,
  profile_id      uuid references public.profiles (id) on delete cascade,
  reason          public.report_reason not null,
  details         text check (char_length(details) <= 1000),
  status          public.report_status not null default 'aberta',
  resolved_by     uuid references public.profiles (id) on delete set null,
  resolved_at     timestamptz,
  resolution_note text check (char_length(resolution_note) <= 1000),
  created_at      timestamptz not null default now(),
  constraint reports_um_alvo check (num_nonnulls(post_id, profile_id) = 1),
  constraint reports_sem_autodenuncia check (profile_id is null or profile_id <> reporter_id),
  -- uma denúncia por pessoa por alvo
  constraint reports_unico_post unique (reporter_id, post_id),
  constraint reports_unico_perfil unique (reporter_id, profile_id),
  foreign key (reporter_id, institution_id) references public.profiles (id, institution_id) on delete cascade
);
create index reports_fila on public.reports (institution_id, status, created_at);

-- ---------------------------------------------------------------------------
-- public.staff_roles — cargo (e "título" exibido no perfil)
-- ---------------------------------------------------------------------------
create table public.staff_roles (
  user_id        uuid not null,
  institution_id uuid not null,
  role           public.staff_role not null,
  granted_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  primary key (user_id, institution_id),
  -- só existe staff da própria instituição
  foreign key (user_id, institution_id) references public.profiles (id, institution_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- public.moderation_actions — trilha de auditoria (append-only)
-- ---------------------------------------------------------------------------
create table public.moderation_actions (
  id             bigint generated always as identity primary key,
  institution_id uuid not null references public.institutions (id),
  actor_id       uuid references public.profiles (id) on delete set null,
  action         public.moderation_action_type not null,
  target_user_id uuid references public.profiles (id) on delete set null,
  target_post_id uuid references public.posts (id) on delete set null,
  report_id      uuid references public.reports (id) on delete set null,
  reason         text not null check (char_length(btrim(reason)) between 3 and 1000),
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index moderation_actions_instituicao on public.moderation_actions (institution_id, created_at desc);
