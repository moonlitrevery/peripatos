-- =============================================================================
-- Seed · SÓ dados de teste locais
-- =============================================================================
-- Roda em `supabase db reset`. Nunca roda no projeto hospedado.
-- A instituição, o domínio e o vocabulário de tags NÃO ficam aqui: são a
-- migration 20261006000001_vocabulario.sql, para que produção suba com eles.
--
-- Contas de demonstração (todas da UNISAGRADO, onboarding completo, adultas).
-- Para entrar com uma delas: peça o código em /entrar e leia o e-mail no
-- Mailpit local (http://127.0.0.1:54324).
--
--   admin.900001@alunos.unisagrado.edu.br       admin
--   moderadora.900002@alunos.unisagrado.edu.br  moderadora
--   lia.900003@…  caue.900004@…  nina.900005@…  tomas.900006@…
--   iris.900007@…  beto.900008@…                usuários comuns
-- =============================================================================

create temporary table seed_users (
  n            integer primary key,
  alias        text not null,
  username     text not null,
  display_name text not null,
  bio          text,
  tags         text[] not null,
  sensitive    text[] not null default '{}'
) on commit drop;

insert into seed_users (n, alias, username, display_name, bio, tags, sensitive) values
  (1, 'admin',      'admin',      'Admin do beta', 'Cuido do Peripatos por aqui.',
      array['desenvolvimento-de-software', 'cafe', 'filosofia-antiga', 'rock'], '{}'),
  (2, 'moderadora', 'moderadora', 'Helena',        'Moderação. Pode chamar.',
      array['psicologia', 'series', 'cafe', 'mpb', 'pets'], '{}'),
  (3, 'lia',        'lia',        'Lia',           'Design de dia, RPG de noite.',
      array['design', 'rpg-de-mesa', 'jogos-indie', 'desenho-e-ilustracao', 'cafe', 'rock'], array['bissexual']),
  (4, 'caue',       'caue',       'Cauê',          'Procurando mesa de RPG às quintas.',
      array['ciencia-da-computacao', 'rpg-de-mesa', 'jogos-indie', 'anime', 'rock', 'metal'], array['bissexual']),
  (5, 'nina',       'nina',       'Nina',          'Corro, cozinho e leio fantasia.',
      array['nutricao', 'corrida', 'culinaria', 'fantasia', 'pop'], array['catolicismo']),
  (6, 'tomas',      'tomas',      'Tomás',         'Cinema de terror e café coado.',
      array['jornalismo-e-publicidade', 'cinema', 'terror', 'cafe', 'fotografia'], '{}'),
  (7, 'iris',       'iris',       'Íris',          'Mangá, k-pop e gatos.',
      array['letras', 'manga', 'anime', 'k-pop', 'pets'], '{}'),
  (8, 'beto',       'beto',       'Beto',          'Futebol no fim de semana, xadrez nunca.',
      array['educacao-fisica', 'futebol', 'musculacao', 'sertanejo'], '{}');

-- INSERT em auth.users dispara os mesmos triggers do cadastro real: valida o
-- e-mail e cria private.accounts + public.profiles.
insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select
  ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  alias || '.' || (900000 + n) || '@alunos.unisagrado.edu.br', now(),
  '{"provider": "email", "providers": ["email"]}', '{}', now(), now(),
  '', '', '', '', '', '', '', ''
from seed_users
order by n;

insert into auth.identities (user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
from auth.users u
where u.id::text like '00000000-0000-4000-8000-%';

update private.accounts a
   set maioridade_verificada_em = now(),
       termos_versao = private.termos_versao_atual(),
       termos_aceitos_em = now(),
       -- quem tem tag sensível no seed já deu o consentimento específico
       sensivel_consentido_em = case when cardinality(s.sensitive) > 0 then now() end
  from seed_users s
 where a.user_id = ('00000000-0000-4000-8000-' || lpad(s.n::text, 12, '0'))::uuid;

update public.profiles p
   set username = s.username, display_name = s.display_name, bio = s.bio, onboarding_completo = true
  from seed_users s
 where p.id = ('00000000-0000-4000-8000-' || lpad(s.n::text, 12, '0'))::uuid;

insert into public.staff_roles (user_id, institution_id, role)
select p.id, p.institution_id, r.role::public.staff_role
from (values ('admin', 'admin'), ('moderadora', 'moderador')) as r (username, role)
join public.profiles p on p.username = r.username;

insert into public.profile_tags (user_id, tag_id)
select p.id, t.id
from seed_users s
join public.profiles p on p.username = s.username
join public.tags t on t.slug = any (s.tags) and not t.is_sensitive;

insert into public.profile_sensitive_tags (user_id, tag_id)
select p.id, t.id
from seed_users s
join public.profiles p on p.username = s.username
join public.tags t on t.slug = any (s.sensitive) and t.is_sensitive;

-- lia <-> caue são mutuals; os outros follows são de mão única.
insert into public.follows (follower_id, followee_id)
select a.id, b.id
from (values ('lia', 'caue'), ('caue', 'lia'), ('nina', 'lia'), ('tomas', 'moderadora'), ('iris', 'caue')) as f (de, para)
join public.profiles a on a.username = f.de
join public.profiles b on b.username = f.para;

insert into public.posts (author_id, institution_id, body, gif_id, created_at)
select p.id, p.institution_id, x.body, x.gif_id, now() - x.idade
from (values
  ('caue',       'Alguém topa uma mesa de RPG às quintas, depois da aula?',            null, interval '25 minutes'),
  ('lia',        'Terminei Hollow Knight e não sei mais o que fazer da vida.',         null, interval '1 hour'),
  ('nina',       'Corrida de 5 km no sábado cedo, saindo do bosque. Quem vem?',        null, interval '2 hours'),
  ('tomas',      'Sessão de terror no cineclube sexta. Levo o café.',                  null, interval '3 hours'),
  ('iris',       'Recomendem um mangá curto, por favor. Estou sem tempo e sem juízo.', null, interval '5 hours'),
  ('beto',       'Fechando time para o interclasses. Falta goleiro.',                  null, interval '8 hours'),
  ('moderadora', 'Lembrete: denúncia é anônima para quem foi denunciado. Usem.',       null, interval '20 hours'),
  ('admin',      'Bem-vindos ao beta do Peripatos. Contem o que estiver estranho.',    null, interval '2 days')
) as x (username, body, gif_id, idade)
join public.profiles p on p.username = x.username;

-- ---------------------------------------------------------------------------
-- Notificações push no ambiente LOCAL
-- ---------------------------------------------------------------------------
-- Em produção estes dois segredos são criados à mão (docs/deploy.md), com um
-- valor aleatório. Aqui o endereço é o do gateway local, de dentro da rede do
-- Docker, e o segredo é fixo e conhecido: só serve para o Supabase local, e é
-- o mesmo que scripts/gerar-vapid.mjs grava em supabase/functions/.env.
select vault.create_secret('http://kong:8000/functions/v1/notificar-mensagem', 'peripatos_push_url', 'Endereço da função de notificação (local)')
where not exists (select 1 from vault.secrets where name = 'peripatos_push_url');
select vault.create_secret('segredo-so-do-ambiente-local', 'peripatos_push_segredo', 'Prova que o pedido de notificação veio do banco (local)')
where not exists (select 1 from vault.secrets where name = 'peripatos_push_segredo');
