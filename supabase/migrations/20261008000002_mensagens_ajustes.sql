-- =============================================================================
-- 15 · Mensagens: exclusão de conta, novo aceite dos termos, push pelo banco
-- =============================================================================
-- 1. Excluir a conta apaga só as mensagens de quem saiu. As da outra pessoa
--    ficam, e a conversa aparece para ela como sendo com "conta excluída".
-- 2. Quem não aceitou a versão vigente dos Termos não posta nem manda
--    mensagem, até aceitar.
-- 3. A notificação push passa a ser pedida pelo banco, a cada mensagem
--    gravada, venha ela do app ou de uma chamada direta à API.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1 · Exclusão de conta
-- ---------------------------------------------------------------------------
-- Antes: a conversa inteira caía em cascata, com as mensagens dos dois.
-- Agora: o lugar de quem saiu fica vazio (NULL). As mensagens DELA continuam
-- caindo em cascata (messages.sender_id), e as da outra pessoa ficam.
alter table public.conversations
  drop constraint conversations_user_a_institution_id_fkey,
  drop constraint conversations_user_b_institution_id_fkey,
  alter column user_a drop not null,
  alter column user_b drop not null;

-- "set null (user_x)": só a coluna da pessoa é anulada; a instituição fica.
alter table public.conversations
  add constraint conversations_user_a_institution_id_fkey
    foreign key (user_a, institution_id) references public.profiles (id, institution_id) on delete set null (user_a),
  add constraint conversations_user_b_institution_id_fkey
    foreign key (user_b, institution_id) references public.profiles (id, institution_id) on delete set null (user_b);

-- Se os dois excluíram a conta, não sobrou ninguém nem mensagem: a conversa vai embora.
create function private.conversations_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_a is null and new.user_b is null then
    delete from public.conversations where id = new.id;
  end if;
  return null;
end
$$;
revoke all on function private.conversations_after_update() from public, anon, authenticated;

create trigger conversations_sem_ninguem
  after update of user_a, user_b on public.conversations
  for each row execute function private.conversations_after_update();

-- A cópia numa denúncia continua como está quando quem escreveu a mensagem
-- exclui a conta: some só a ligação com a conta.
alter table public.reports
  drop constraint reports_message_sender_id_fkey,
  drop constraint reports_copia_coerente,
  add constraint reports_message_sender_id_fkey
    foreign key (message_sender_id) references public.profiles (id) on delete set null;

-- A conversa existe para esta pessoa: participa, está ativa, e a outra pessoa
-- OU excluiu a conta (lugar vazio) OU é visível para ela.
create or replace function private.conversa_visivel(p_conversa uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_uid is not null
     and private.is_active(p_uid)
     and exists (
       select 1
       from public.conversations c
       cross join lateral (select case when c.user_a = p_uid then c.user_b else c.user_a end as outro) o
       where c.id = p_conversa
         and p_uid in (c.user_a, c.user_b)
         and (o.outro is null or private.can_see(p_uid, o.outro))
     )
$$;

drop function public.total_nao_lidas();
drop function public.minhas_conversas();

create function public.minhas_conversas()
returns table (
  conversa_id uuid,
  outro_id uuid,
  -- a outra pessoa excluiu a conta: os campos dela vêm nulos
  outro_excluido boolean,
  username text,
  display_name text,
  avatar_path text,
  avatar_preset smallint,
  ultima_em timestamptz,
  previa text,
  previa_minha boolean,
  nao_lidas integer,
  aberta boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (select auth.uid() as id),
  minhas as (
    select c.id, c.last_message_at, c.created_at,
           case when c.user_a = eu.id then c.user_b else c.user_a end as outro,
           coalesce(private.pode_conversar(c.user_a, c.user_b), false) as aberta
    from public.conversations c
    cross join eu
    where eu.id in (c.user_a, c.user_b)
      and private.conversa_visivel(c.id, eu.id)
  )
  select
    m.id,
    p.id,
    m.outro is null,
    p.username,
    p.display_name,
    case when p.avatar_status = 'aprovado' then p.avatar_path end,
    p.avatar_preset,
    coalesce(m.last_message_at, m.created_at),
    case when u.id is null then null
         when btrim(u.body) <> '' then left(u.body, 80)
         else 'GIF' end,
    u.sender_id = (select id from eu),
    (
      select count(*)::integer
      from public.messages x
      where x.conversation_id = m.id
        and x.sender_id <> (select id from eu)
        and x.created_at > coalesce(
          (select r.last_read_at from public.conversation_reads r
            where r.conversation_id = m.id and r.user_id = (select id from eu)),
          '-infinity'::timestamptz)
    ),
    m.aberta
  from minhas m
  left join public.profiles p on p.id = m.outro
  left join lateral (
    select x.id, x.body, x.sender_id
    from public.messages x
    where x.conversation_id = m.id
    order by x.created_at desc, x.id desc
    limit 1
  ) u on true
  order by coalesce(m.last_message_at, m.created_at) desc, m.id
$$;

create function public.total_nao_lidas()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(c.nao_lidas), 0)::integer from public.minhas_conversas() c
$$;

revoke all on function public.minhas_conversas(), public.total_nao_lidas() from public, anon;
grant execute on function public.minhas_conversas(), public.total_nao_lidas() to authenticated;

-- ---------------------------------------------------------------------------
-- 2 · Novo aceite dos Termos
-- ---------------------------------------------------------------------------
create function private.termos_em_dia(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select a.termos_versao = private.termos_versao_atual() from private.accounts a where a.user_id = p_uid),
    false
  )
$$;
revoke all on function private.termos_em_dia(uuid) from public, anon;
grant execute on function private.termos_em_dia(uuid) to authenticated;

-- Políticas RESTRITIVAS: somam-se (com E) às que já existem. Sem o aceite da
-- versão vigente, nenhum outro caminho libera postar ou mandar mensagem.
create policy posts_termos_em_dia on public.posts
  as restrictive for insert to authenticated
  with check ((select private.termos_em_dia((select auth.uid()))));

create policy messages_termos_em_dia on public.messages
  as restrictive for insert to authenticated
  with check ((select private.termos_em_dia((select auth.uid()))));

-- Registra o aceite da versão vigente. Como no onboarding, o banco só aceita a
-- versão que está valendo: não dá para "aceitar" um texto antigo.
create function public.aceitar_termos(p_versao text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_em  timestamptz;
begin
  if v_uid is null then
    raise exception 'Login necessário.' using errcode = 'PT401';
  end if;
  if p_versao is distinct from private.termos_versao_atual() then
    raise exception 'Esta não é a versão atual dos Termos. Recarregue a página.' using errcode = 'PT400';
  end if;
  update private.accounts
     set termos_versao = p_versao, termos_aceitos_em = now()
   where user_id = v_uid
  returning termos_aceitos_em into v_em;
  if not found then
    raise exception 'Conta não encontrada.' using errcode = 'PT404';
  end if;
  return v_em;
end
$$;
revoke all on function public.aceitar_termos(text) from public, anon;
grant execute on function public.aceitar_termos(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3 · Notificação push pedida pelo banco
-- ---------------------------------------------------------------------------
-- A cada mensagem gravada, o banco pede à Edge Function notificar-mensagem que
-- avise quem recebeu. O pedido leva SÓ o id da mensagem. A chamada é
-- assíncrona (pg_net): sai depois do commit e não atrasa nem derruba o envio.
--
-- O endereço da função e o segredo que prova que o pedido veio do banco ficam
-- no Vault, porque mudam por ambiente e não podem ir para o git:
--   peripatos_push_url      -> https://<ref>.supabase.co/functions/v1/notificar-mensagem
--   peripatos_push_segredo  -> o mesmo valor do segredo SEGREDO_DO_BANCO da função
-- Sem os dois, o banco simplesmente não pede notificação.
create extension if not exists pg_net with schema extensions;

create function private.pedir_notificacao(p_mensagem uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_segredo text;
begin
  select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'peripatos_push_url';
  select ds.decrypted_secret into v_segredo from vault.decrypted_secrets ds where ds.name = 'peripatos_push_segredo';
  if coalesce(v_url, '') = '' or coalesce(v_segredo, '') = '' then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('mensagemId', p_mensagem),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-peripatos-segredo', v_segredo),
    timeout_milliseconds := 8000
  );
exception when others then
  -- A notificação é conveniência. Uma falha aqui não pode desfazer a mensagem.
  null;
end
$$;
revoke all on function private.pedir_notificacao(uuid) from public, anon, authenticated;

-- O que a Edge Function precisa saber para notificar, e nada além disso.
-- Decide aqui, com as regras do banco, se a notificação sai: mensagem recente,
-- ainda não notificada, conversa aberta. Marca como notificada na mesma
-- chamada, então pedir duas vezes não notifica duas vezes.
-- Não devolve o texto da mensagem: a função nem tem como pô-lo na notificação.
create function public.preparar_notificacao(p_mensagem uuid)
returns table (destinatario uuid, remetente text, conversa uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg record;
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

  update public.messages set notified_at = now() where id = v_msg.id;

  return query
  select case when v_msg.user_a = v_msg.sender_id then v_msg.user_b else v_msg.user_a end,
         p.display_name,
         v_msg.conversation_id
  from public.profiles p
  where p.id = v_msg.sender_id;
end
$$;
-- Só a service role (a Edge Function) chama. Nenhum usuário, nem logado.
revoke all on function public.preparar_notificacao(uuid) from public, anon, authenticated;
grant execute on function public.preparar_notificacao(uuid) to service_role;

create or replace function private.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a uuid;
  v_b uuid;
  v_outro uuid;
begin
  update public.conversations
     set last_message_at = new.created_at
   where id = new.conversation_id
  returning user_a, user_b into v_a, v_b;

  v_outro := case when v_a = new.sender_id then v_b else v_a end;

  -- quem enviou já leu até aqui
  insert into public.conversation_reads (conversation_id, user_id, last_read_at)
  values (new.conversation_id, new.sender_id, new.created_at)
  on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;

  perform private.avisar(new.sender_id, 'nova', new.conversation_id, new.id);
  -- A política de INSERT já exigiu isto; conferir de novo custa pouco e
  -- garante que nenhum outro caminho de escrita avise quem não deve.
  if coalesce(private.pode_conversar(v_a, v_b), false) then
    perform private.avisar(v_outro, 'nova', new.conversation_id, new.id);
    perform private.pedir_notificacao(new.id);
  end if;
  return null;
end
$$;
