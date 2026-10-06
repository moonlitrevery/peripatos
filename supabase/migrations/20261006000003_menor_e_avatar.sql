-- =============================================================================
-- 12 · Menor de idade não fica guardado; avatar só entra reprocessado
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Onboarding: menor de 18 tem a conta apagada na hora
-- ---------------------------------------------------------------------------
-- Antes, o menor concluía o onboarding e ficava inativo até fazer 18. Isso
-- guardava e-mail, RA e data de nascimento de um menor num app que é 18+.
-- Agora, se a data informada for de menor, a conta inteira é apagada dentro da
-- própria chamada e nada é retido: nem a data, nem um marcador de que tentou.
--
-- A função devolve um JSON em vez de levantar erro: um erro desfaria a
-- transação, e com ela a exclusão.
--
-- Consequência assumida: como nada fica guardado, a mesma pessoa pode se
-- cadastrar de novo e informar outra data. O banco nunca teve como conferir a
-- data; o que mudou é que não guardamos mais dados de quem se declarou menor.
-- private.is_active continua conferindo a idade (defesa em profundidade).
create or replace function public.completar_onboarding(
  p_username text,
  p_display_name text,
  p_data_nascimento date,
  p_bio text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_birth date;
  v_done  boolean;
  v_hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_uid is null then
    raise exception 'Login necessário.' using errcode = 'PT401';
  end if;

  select a.birth_date, p.onboarding_completo
    into v_birth, v_done
  from private.accounts a
  join public.profiles p on p.id = a.user_id
  where a.user_id = v_uid
  for update;

  if not found then
    raise exception 'Conta não encontrada.' using errcode = 'PT404';
  end if;
  if private.is_banned(v_uid) then
    raise exception 'Conta banida.' using errcode = 'PT403';
  end if;
  if v_done then
    raise exception 'O onboarding já foi concluído.' using errcode = 'PT409';
  end if;
  if p_data_nascimento is null or p_data_nascimento > v_hoje or p_data_nascimento < date '1900-01-01' then
    raise exception 'Data de nascimento inválida.' using errcode = 'PT400';
  end if;

  -- Menor de 18: apaga tudo e avisa. Vem antes de qualquer outra validação
  -- para que nenhum dado do formulário chegue a ser gravado.
  if p_data_nascimento > private.adult_cutoff() then
    delete from auth.users where id = v_uid;
    return jsonb_build_object(
      'onboarding_completo', false,
      'ativo', false,
      'menor_de_idade', true,
      'conta_apagada', true
    );
  end if;

  if p_username is null or p_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Username inválido: use de 3 a 20 caracteres entre a-z, 0-9 e _.' using errcode = 'PT400';
  end if;
  if p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 50 then
    raise exception 'Nome de exibição inválido (1 a 50 caracteres).' using errcode = 'PT400';
  end if;
  if char_length(p_bio) > 300 then
    raise exception 'Bio muito longa (máximo de 300 caracteres).' using errcode = 'PT400';
  end if;

  update private.accounts set birth_date = p_data_nascimento where user_id = v_uid;

  begin
    update public.profiles
       set username = p_username,
           display_name = btrim(p_display_name),
           bio = nullif(btrim(p_bio), ''),
           onboarding_completo = true
     where id = v_uid;
  exception when unique_violation then
    raise exception 'Este username já está em uso.' using errcode = 'PT409';
  end;

  return jsonb_build_object(
    'onboarding_completo', true,
    'ativo', private.is_active(v_uid),
    'menor_de_idade', false,
    'conta_apagada', false
  );
end
$$;

-- ---------------------------------------------------------------------------
-- Avatar: bucket de entrada + bucket final
-- ---------------------------------------------------------------------------
--   avatar-uploads  -> onde o usuário envia. Só o dono escreve e lê; ninguém
--                      mais enxerga, nem a staff. Nada daqui é exibido.
--   avatars         -> só a Edge Function `processar-avatar` (service role)
--                      escreve. Ela re-encoda a imagem, o que descarta todos
--                      os metadados (EXIF, inclusive a localização GPS), grava
--                      aqui e apaga o original.
--
-- Como authenticated não tem mais INSERT/UPDATE em `avatars`, todo arquivo que
-- chega à fila de moderação, e depois aos outros usuários, passou pelo
-- re-encode. Não existe caminho para um original com EXIF ser exibido.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatar-uploads', 'avatar-uploads', false, 2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

update storage.buckets set allowed_mime_types = array['image/webp'] where id = 'avatars';

drop policy peripatos_avatars_insert on storage.objects;
drop policy peripatos_avatars_update on storage.objects;

-- Só conta ativa envia foto (antes bastava não estar banida).
create or replace function private.can_write_avatar(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and private.avatar_owner(p_name) = (select auth.uid())
     and private.is_active((select auth.uid()))
$$;

create policy peripatos_avatar_uploads_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatar-uploads' and private.can_write_avatar(name));

create policy peripatos_avatar_uploads_select on storage.objects
  for select to authenticated
  using (bucket_id = 'avatar-uploads' and private.avatar_owner(name) = (select auth.uid()));

create policy peripatos_avatar_uploads_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatar-uploads' and private.avatar_owner(name) = (select auth.uid()));

-- A exclusão de conta também exige o bucket de entrada vazio.
create or replace function public.excluir_conta(p_confirmacao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_hmac  text;
begin
  if v_uid is null then
    raise exception 'Login necessário.' using errcode = 'PT401';
  end if;
  if p_confirmacao is distinct from 'EXCLUIR' then
    raise exception 'Confirmação inválida: envie EXCLUIR para apagar a conta.' using errcode = 'PT400';
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid for update;
  if not found then
    raise exception 'Conta não encontrada.' using errcode = 'PT404';
  end if;

  if exists (
    select 1
    from storage.objects o
    where o.bucket_id in ('avatars', 'avatar-uploads')
      and private.avatar_owner(o.name) = v_uid
  ) then
    raise exception 'Apague seus arquivos de avatar antes de excluir a conta.' using errcode = 'PT409';
  end if;

  v_hmac := encode(private.email_hmac(v_email), 'hex');

  update public.moderation_actions
     set metadata = metadata || jsonb_build_object('alvo_excluido_hmac', v_hmac)
   where target_user_id = v_uid;
  update public.moderation_actions
     set metadata = metadata || jsonb_build_object('ator_excluido_hmac', v_hmac)
   where actor_id = v_uid;

  delete from auth.users where id = v_uid;
end
$$;
