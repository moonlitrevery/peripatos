-- =============================================================================
-- 05 · RLS e GRANTs
-- =============================================================================
-- Toda tabela de public: RLS ativo E forçado. Sem política = negado.
-- GRANTs são por coluna onde importa: o cliente literalmente não consegue
-- enviar author_id, institution_id, created_at, status etc. O WITH CHECK das
-- políticas é a segunda trava.
--
-- Escritas privilegiadas (moderação, cargos, banimento, soft delete) NÃO têm
-- GRANT nem política: só acontecem pelas RPCs de 07_moderacao.
-- =============================================================================

do $$
declare
  t record;
begin
  for t in
    select c.oid::regclass as rel
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private') and c.relkind in ('r', 'p')
  loop
    execute format('alter table %s enable row level security', t.rel);
    execute format('alter table %s force row level security', t.rel);
    execute format('revoke all on table %s from anon, authenticated, public', t.rel);
  end loop;
end
$$;
-- As tabelas de private também ficam com RLS forçado e sem nenhuma política:
-- mesmo que alguém conceda acesso por engano, o default continua sendo negar.

-- ---------------------------------------------------------------------------
-- institutions / tags: leitura para qualquer autenticado
-- ---------------------------------------------------------------------------
grant select on public.institutions to authenticated;
create policy institutions_select on public.institutions
  for select to authenticated
  using (true);

grant select on public.tags to authenticated;
create policy tags_select on public.tags
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (username, display_name, bio) on public.profiles to authenticated;

-- Vê: o próprio perfil sempre. Os dos outros só se quem lê é ativo, e então
-- (a) perfis ativos da mesma instituição sem bloqueio, ou (b) é staff da
-- instituição (precisa enxergar banidos e pendentes para moderar).
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (
      institution_id = (select private.my_institution())
      and (select private.is_active((select auth.uid())))
      and (
        private.can_see((select auth.uid()), id)
        or (select private.is_staff((select auth.uid()), (select private.my_institution())))
      )
    )
  );

-- Edita só o próprio perfil, e só se não estiver banido.
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and banned_at is null)
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- profile_tags
-- ---------------------------------------------------------------------------
grant select, delete on public.profile_tags to authenticated;
grant insert (tag_id) on public.profile_tags to authenticated;

create policy profile_tags_select on public.profile_tags
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      (select private.is_active((select auth.uid())))
      and private.can_see((select auth.uid()), user_id)
    )
  );

create policy profile_tags_insert on public.profile_tags
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not (select private.is_banned((select auth.uid())))
  );

create policy profile_tags_delete on public.profile_tags
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- profile_sensitive_tags: dono e mutuals. Nem staff lê.
-- ---------------------------------------------------------------------------
grant select, delete on public.profile_sensitive_tags to authenticated;
grant insert (tag_id) on public.profile_sensitive_tags to authenticated;

create policy profile_sensitive_tags_select on public.profile_sensitive_tags
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      (select private.is_active((select auth.uid())))
      and private.can_see((select auth.uid()), user_id)
      and private.is_mutual((select auth.uid()), user_id)
    )
  );

create policy profile_sensitive_tags_insert on public.profile_sensitive_tags
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not (select private.is_banned((select auth.uid())))
  );

create policy profile_sensitive_tags_delete on public.profile_sensitive_tags
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- tag_requests
-- ---------------------------------------------------------------------------
grant select on public.tag_requests to authenticated;
grant insert (name, category, justification) on public.tag_requests to authenticated;

create policy tag_requests_select on public.tag_requests
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_staff((select auth.uid()), institution_id))
  );

create policy tag_requests_insert on public.tag_requests
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and institution_id = (select private.my_institution())
    and status = 'pendente'
    and (select private.is_active((select auth.uid())))
  );

-- ---------------------------------------------------------------------------
-- follows
-- ---------------------------------------------------------------------------
grant select, delete on public.follows to authenticated;
grant insert (followee_id) on public.follows to authenticated;

-- Cada um vê só as relações em que participa.
create policy follows_select on public.follows
  for select to authenticated
  using (
    follower_id = (select auth.uid())
    or followee_id = (select auth.uid())
  );

-- Segue só quem é ativo, e só quem consegue ver (mesma instituição, ativo,
-- sem bloqueio em nenhuma direção).
create policy follows_insert on public.follows
  for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and (select private.is_active((select auth.uid())))
    and private.can_see((select auth.uid()), followee_id)
  );

-- Deixar de seguir OU remover um seguidor (é assim que se desfaz um mutual,
-- e com ele o acesso às tags sensíveis, sem precisar bloquear).
create policy follows_delete on public.follows
  for delete to authenticated
  using (
    follower_id = (select auth.uid())
    or followee_id = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- blocks
-- ---------------------------------------------------------------------------
grant select, delete on public.blocks to authenticated;
grant insert (blocked_id) on public.blocks to authenticated;

-- Só quem bloqueou vê o bloqueio. O bloqueado não é informado.
create policy blocks_select on public.blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy blocks_insert on public.blocks
  for insert to authenticated
  with check (
    blocker_id = (select auth.uid())
    and private.same_institution((select auth.uid()), blocked_id)
  );

create policy blocks_delete on public.blocks
  for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------
grant select on public.posts to authenticated;
grant insert (body, gif_id) on public.posts to authenticated;
grant update (body, gif_id) on public.posts to authenticated;

-- Leitor ativo, mesma instituição, post não apagado nem ocultado, autor
-- visível (ativo, não banido, sem bloqueio). Staff da instituição vê tudo,
-- inclusive apagados e ocultados, para poder moderar.
create policy posts_select on public.posts
  for select to authenticated
  using (
    institution_id = (select private.my_institution())
    and (select private.is_active((select auth.uid())))
    and (
      (
        deleted_at is null
        and hidden_at is null
        and (
          author_id = (select auth.uid())
          or private.can_see((select auth.uid()), author_id)
        )
      )
      or (select private.is_staff((select auth.uid()), (select private.my_institution())))
    )
  );

create policy posts_insert on public.posts
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and institution_id = (select private.my_institution())
    and deleted_at is null
    and hidden_at is null
    and (select private.is_active((select auth.uid())))
  );

-- Edita só o próprio post, enquanto visível. O soft delete é a RPC apagar_post.
create policy posts_update on public.posts
  for update to authenticated
  using (
    author_id = (select auth.uid())
    and deleted_at is null
    and hidden_at is null
    and (select private.is_active((select auth.uid())))
  )
  with check (
    author_id = (select auth.uid())
    and institution_id = (select private.my_institution())
  );

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
grant select on public.reports to authenticated;
grant insert (post_id, profile_id, reason, details) on public.reports to authenticated;

-- Só staff da instituição lê. Quem denunciou acompanha as próprias pela RPC
-- minhas_denuncias(), que não expõe quem resolveu.
create policy reports_select on public.reports
  for select to authenticated
  using ((select private.is_staff((select auth.uid()), institution_id)));

create policy reports_insert on public.reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and institution_id = (select private.my_institution())
    and status = 'aberta'
    and resolved_by is null
    and (select private.is_active((select auth.uid())))
    and private.report_target_ok((select auth.uid()), post_id, profile_id)
  );

-- ---------------------------------------------------------------------------
-- staff_roles: leitura como "título" do perfil; escrita só por RPC de admin
-- ---------------------------------------------------------------------------
grant select on public.staff_roles to authenticated;

create policy staff_roles_select on public.staff_roles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      (select private.is_active((select auth.uid())))
      and private.can_see((select auth.uid()), user_id)
    )
  );

-- ---------------------------------------------------------------------------
-- moderation_actions: staff da instituição lê; ninguém escreve pela API
-- ---------------------------------------------------------------------------
grant select on public.moderation_actions to authenticated;

create policy moderation_actions_select on public.moderation_actions
  for select to authenticated
  using ((select private.is_staff((select auth.uid()), institution_id)));
