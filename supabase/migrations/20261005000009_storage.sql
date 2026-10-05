-- =============================================================================
-- 09 · Storage: bucket privado de avatares
-- =============================================================================
-- - Bucket `avatars` privado, 2 MB, só JPEG/PNG/WebP.
-- - Cada usuário só escreve em `<próprio uid>/<arquivo>`.
-- - Upload novo (ou substituição) => avatar_status = 'pendente'.
-- - Os outros só leem o arquivo que é o avatar ATUAL e APROVADO de um perfil
--   que eles conseguem ver. O dono lê os próprios; staff lê os da instituição
--   (para moderar).
--
-- PENDENTE PARA A PRÓXIMA ETAPA (não implementado aqui):
--   Uma Edge Function vai re-encodar a imagem enviada. O re-encode descarta os
--   metadados EXIF, incluindo a localização GPS que celulares gravam na foto.
--   Até ela existir, o arquivo guardado é o original, com EXIF. Por isso nada
--   aqui torna um upload visível sozinho: ele nasce 'pendente' e só a staff o
--   vê. A aprovação (moderar_avatar) só deve ser usada em produção depois que
--   o re-encode estiver no caminho.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', false, 2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Dono do arquivo = primeira pasta do caminho, se for um uuid.
create function private.avatar_owner(p_name text)
returns uuid
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'
    then split_part(p_name, '/', 1)::uuid
  end
$$;

-- Pode gravar neste caminho? Só na própria pasta, e só sem banimento.
create function private.can_write_avatar(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and private.avatar_owner(p_name) = (select auth.uid())
     and not private.is_banned((select auth.uid()))
$$;

-- Pode ler este arquivo?
create function private.can_view_avatar(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.avatar_owner(p_name) = (select auth.uid())
    or exists (
      select 1
      from public.profiles p
      where p.id = private.avatar_owner(p_name)
        and private.is_active((select auth.uid()))
        and (
          (
            p.avatar_path = p_name
            and p.avatar_status = 'aprovado'
            and private.can_see((select auth.uid()), p.id)
          )
          or private.is_staff((select auth.uid()), p.institution_id)
        )
    )
$$;

revoke all on function
  private.avatar_owner(text),
  private.can_write_avatar(text),
  private.can_view_avatar(text)
from public, anon;
grant execute on function
  private.avatar_owner(text),
  private.can_write_avatar(text),
  private.can_view_avatar(text)
to authenticated;

-- ---------------------------------------------------------------------------
-- Políticas em storage.objects (só para authenticated; anon não tem nenhuma)
-- ---------------------------------------------------------------------------
create policy peripatos_avatars_select on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and private.can_view_avatar(name));

create policy peripatos_avatars_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and private.can_write_avatar(name));

create policy peripatos_avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and private.can_write_avatar(name))
  with check (bucket_id = 'avatars' and private.can_write_avatar(name));

create policy peripatos_avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and private.avatar_owner(name) = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Upload => pendente. Remoção do avatar atual => sem_avatar.
-- ---------------------------------------------------------------------------
create function private.avatars_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if tg_op = 'DELETE' then
    if old.bucket_id = 'avatars' then
      update public.profiles
         set avatar_path = null, avatar_status = 'sem_avatar'
       where id = private.avatar_owner(old.name) and avatar_path = old.name;
    end if;
    return null;
  end if;

  if new.bucket_id <> 'avatars' then
    return null;
  end if;

  -- Em UPDATE, só reage a troca de conteúdo ou de caminho. Atualizações de
  -- bookkeeping (last_accessed_at) não podem derrubar um avatar aprovado.
  if tg_op = 'UPDATE'
     and new.name is not distinct from old.name
     and new.metadata is not distinct from old.metadata
     and new.version is not distinct from old.version then
    return null;
  end if;

  v_owner := private.avatar_owner(new.name);
  if v_owner is not null then
    update public.profiles
       set avatar_path = new.name, avatar_status = 'pendente'
     where id = v_owner;
  end if;
  return null;
end
$$;

revoke all on function private.avatars_after_write() from public, anon, authenticated;

create trigger peripatos_avatars_after_write
  after insert or update or delete on storage.objects
  for each row execute function private.avatars_after_write();
