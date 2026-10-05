-- =============================================================================
-- 01 · Base: schemas, privilégios padrão e tipos
-- =============================================================================
-- Dois schemas:
--   public  -> exposto pela API (PostgREST). RLS forçado em tudo, default negar.
--   private -> NÃO exposto. E-mail, RA, data de nascimento, hashes de banimento
--              e funções auxiliares. Nunca adicionar a [api].schemas.
-- =============================================================================

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Privilégios: nada é concedido por padrão. Cada objeto recebe GRANT explícito.
-- ---------------------------------------------------------------------------

-- O Supabase concede, por padrão, ALL em tudo que é criado em public para
-- anon/authenticated. Removemos isso: sem GRANT explícito, ninguém acessa.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

-- Funções nascem com EXECUTE para PUBLIC no Postgres. Removemos globalmente
-- para tudo que o papel postgres criar daqui em diante (public e private).
alter default privileges for role postgres
  revoke execute on functions from public;

-- anon não tem acesso a nada: o app inteiro exige login.
-- USAGE em public vem de PUBLIC por padrão no Postgres; tirar só de anon não
-- basta. Removemos de PUBLIC e devolvemos a quem precisa.
revoke all on schema public from public;
revoke all on schema public from anon;
grant usage on schema public to authenticated, service_role;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- private: fechado. authenticated recebe apenas USAGE (necessário para as
-- políticas de RLS chamarem as funções auxiliares); nenhuma tabela é concedida.
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;
grant usage on schema private to supabase_auth_admin; -- só para o auth hook

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

create type public.avatar_status as enum ('sem_avatar', 'pendente', 'aprovado', 'recusado');

create type public.staff_role as enum ('moderador', 'admin');

create type public.report_reason as enum (
  'spam',
  'assedio',
  'discurso_de_odio',
  'conteudo_sexual',
  'violencia_ou_ameaca',
  'perfil_falso',
  'menor_de_idade',
  'exposicao_de_dados_pessoais',
  'outro'
);

create type public.report_status as enum ('aberta', 'em_analise', 'resolvida', 'rejeitada');

create type public.tag_request_status as enum ('pendente', 'aprovada', 'recusada');

create type public.moderation_action_type as enum (
  'ocultar_post',
  'restaurar_post',
  'banir_usuario',
  'desbanir_usuario',
  'aprovar_avatar',
  'recusar_avatar',
  'resolver_denuncia',
  'conceder_cargo',
  'remover_cargo',
  'resolver_pedido_tag'
);
