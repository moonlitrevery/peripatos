-- =============================================================================
-- 13 · Lista de bloqueados com nome
-- =============================================================================
-- Quem bloqueia deixa de enxergar o perfil do bloqueado (RLS, nas duas
-- direções). Sem esta função, a tela de configurações mostraria uma lista de
-- uuids sem nome, e a pessoa não saberia quem está desbloqueando.
--
-- Devolve só o mínimo para reconhecer alguém: username e nome de exibição.
-- Nada de bio, tags, avatar ou posts. E só dos bloqueios feitos por quem chama.
create function public.meus_bloqueios()
returns table (
  user_id uuid,
  username text,
  display_name text,
  bloqueado_em timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.blocked_id, p.username, p.display_name, b.created_at
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid())
  order by b.created_at desc
$$;

revoke all on function public.meus_bloqueios() from public, anon;
grant execute on function public.meus_bloqueios() to authenticated;
