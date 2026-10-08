-- =============================================================================
-- 14 · Mensagens diretas (marco 2)
-- =============================================================================
-- Regras, todas impostas aqui:
--   - só entre mutuals ativos, da mesma instituição, sem bloqueio;
--   - deixou de ser mútuo: a conversa continua legível, mas fechada para
--     mensagens novas; voltou a ser mútuo, reabre;
--   - bloqueio esconde a conversa dos dois lados;
--   - só duas pessoas por conversa;
--   - apagar a própria mensagem apaga de verdade; não existe edição;
--   - NÃO existe confirmação de leitura: o marcador de leitura de cada pessoa
--     só é visível para ela mesma;
--   - staff NÃO lê conversas: nenhuma política cita cargo. Uma denúncia leva
--     uma CÓPIA da mensagem, e só a cópia chega à moderação;
--   - tempo real: cada pessoa só assina o próprio canal, e o banco decide a
--     cada evento quem recebe. O evento leva identificadores, nunca o texto.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
-- user_a < user_b: um par de pessoas tem no máximo uma conversa, e a tabela
-- não tem como representar um grupo.
create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null,
  user_a          uuid not null,
  user_b          uuid not null,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz,
  constraint conversations_ordem check (user_a < user_b),
  constraint conversations_par_unico unique (user_a, user_b),
  -- as duas pessoas são da instituição da conversa; excluir a conta de
  -- qualquer uma apaga a conversa e, com ela, todas as mensagens
  foreign key (user_a, institution_id) references public.profiles (id, institution_id) on delete cascade,
  foreign key (user_b, institution_id) references public.profiles (id, institution_id) on delete cascade
);
create index conversations_de_b on public.conversations (user_b);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body            text not null default '' check (char_length(body) <= 1000),
  -- mesmas regras do post: só o ID do GIF, nunca uma URL
  gif_id          text check (gif_id ~ '^[A-Za-z0-9]{1,64}$'),
  gif_alt         text,
  -- clock_timestamp, e não now(): duas mensagens da mesma transação precisam
  -- de instantes diferentes, porque a ordem e o contador de não lidas dependem disso
  created_at      timestamptz not null default clock_timestamp(),
  -- quando a notificação push desta mensagem foi enviada (no máximo uma)
  notified_at     timestamptz,
  constraint messages_nao_vazia check (btrim(body) <> '' or gif_id is not null),
  constraint messages_gif_alt_valido check (
    gif_alt is null
    or (gif_id is not null and char_length(gif_alt) between 1 and 200 and gif_alt !~ '[[:cntrl:]]')
  )
);
create index messages_da_conversa on public.messages (conversation_id, created_at desc, id);

-- Até onde cada pessoa leu cada conversa. Serve só para o contador de não
-- lidas DELA. A outra pessoa nunca lê esta tabela: não há "visto".
create table public.conversation_reads (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Regras de quem conversa com quem
-- ---------------------------------------------------------------------------
create function private.pode_conversar(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_a is not null
     and p_b is not null
     and p_a <> p_b
     and private.same_institution(p_a, p_b)
     and private.is_active(p_a)
     and private.is_active(p_b)
     and private.is_mutual(p_a, p_b)
     and not private.is_blocked(p_a, p_b)
$$;

-- A outra pessoa da conversa, ou NULL se p_uid não participa dela.
create function private.outro_da_conversa(p_conversa uuid, p_uid uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when c.user_a = p_uid then c.user_b when c.user_b = p_uid then c.user_a end
  from public.conversations c
  where c.id = p_conversa
$$;

-- A conversa existe PARA esta pessoa: participa, está ativa, e a outra pessoa
-- é visível para ela (mesma instituição, ativa, sem bloqueio em nenhuma
-- direção). Não exige mútuo: conversa de ex-mútuos continua legível.
create function private.conversa_visivel(p_conversa uuid, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_uid is not null
     and private.is_active(p_uid)
     and coalesce(private.can_see(p_uid, private.outro_da_conversa(p_conversa, p_uid)), false)
$$;

-- A conversa aceita mensagens novas agora.
create function private.conversa_aberta(p_conversa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.pode_conversar(c.user_a, c.user_b) from public.conversations c where c.id = p_conversa),
    false
  )
$$;

revoke all on function
  private.pode_conversar(uuid, uuid),
  private.outro_da_conversa(uuid, uuid),
  private.conversa_visivel(uuid, uuid),
  private.conversa_aberta(uuid)
from public, anon;
grant execute on function
  private.pode_conversar(uuid, uuid),
  private.outro_da_conversa(uuid, uuid),
  private.conversa_visivel(uuid, uuid),
  private.conversa_aberta(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.conversations      enable row level security;
alter table public.conversations      force row level security;
alter table public.messages           enable row level security;
alter table public.messages           force row level security;
alter table public.conversation_reads enable row level security;
alter table public.conversation_reads force row level security;

revoke all on public.conversations, public.messages, public.conversation_reads from anon, authenticated, public;

-- Conversas: só leitura, e só as próprias. Criar é pela RPC abrir_conversa.
grant select on public.conversations to authenticated;
create policy conversations_select on public.conversations
  for select to authenticated
  using ((select private.conversa_visivel(id, (select auth.uid()))));

-- Mensagens. Repare no que NÃO existe: política para staff, UPDATE, e
-- qualquer coluna de escrita além do conteúdo.
grant select, delete on public.messages to authenticated;
grant insert (conversation_id, body, gif_id, gif_alt) on public.messages to authenticated;

create policy messages_select on public.messages
  for select to authenticated
  using ((select private.conversa_visivel(conversation_id, (select auth.uid()))));

create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and private.outro_da_conversa(conversation_id, (select auth.uid())) is not null
    and private.conversa_aberta(conversation_id)
  );

create policy messages_delete on public.messages
  for delete to authenticated
  using (
    sender_id = (select auth.uid())
    and (select private.conversa_visivel(conversation_id, (select auth.uid())))
  );

-- Marcadores de leitura: cada pessoa lê só o próprio. Escrever é pela RPC.
grant select on public.conversation_reads to authenticated;
create policy conversation_reads_select on public.conversation_reads
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Tempo real: um canal privado por pessoa
-- ---------------------------------------------------------------------------
-- O tópico é "usuario:<uid>". A única política em realtime.messages deixa
-- cada pessoa RECEBER do próprio tópico. Não há política de INSERT: nenhum
-- cliente publica em canal privado, só o banco.
--
-- Não existe tópico por conversa de propósito. A autorização do Realtime é
-- conferida quando o cliente entra no canal; num canal por conversa, quem já
-- estivesse dentro continuaria recebendo depois de um bloqueio. Aqui o banco
-- escolhe os destinatários a cada evento, com o estado daquele instante.
create policy peripatos_canal_proprio on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and (select realtime.topic()) = 'usuario:' || (select auth.uid())::text
  );

-- Avisa uma pessoa de que algo mudou numa conversa. Só identificadores: quem
-- recebe busca o conteúdo pela API, onde o RLS decide de novo.
create function private.avisar(p_uid uuid, p_tipo text, p_conversa uuid, p_mensagem uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('tipo', p_tipo, 'conversa', p_conversa, 'mensagem', p_mensagem),
    'mensagem',
    'usuario:' || p_uid::text,
    true  -- privado: só chega a quem passou pela política acima
  );
exception when others then
  -- O tempo real é conveniência. Uma falha aqui não pode desfazer a mensagem.
  null;
end
$$;
revoke all on function private.avisar(uuid, text, uuid, uuid) from public, anon, authenticated;

create function private.messages_after_insert()
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
  if private.pode_conversar(v_a, v_b) then
    perform private.avisar(v_outro, 'nova', new.conversation_id, new.id);
  end if;
  return null;
end
$$;

create function private.messages_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a uuid;
  v_b uuid;
begin
  select c.user_a, c.user_b into v_a, v_b from public.conversations c where c.id = old.conversation_id;
  if not found then
    return null;  -- a conversa inteira está sendo apagada (exclusão de conta)
  end if;

  perform private.avisar(old.sender_id, 'apagada', old.conversation_id, old.id);
  -- Ex-mútuo ou bloqueado não recebe evento nenhum, nem o de apagar.
  if private.pode_conversar(v_a, v_b) then
    perform private.avisar(case when v_a = old.sender_id then v_b else v_a end, 'apagada', old.conversation_id, old.id);
  end if;
  return null;
end
$$;

revoke all on function private.messages_after_insert(), private.messages_after_delete() from public, anon, authenticated;

create trigger messages_depois_de_inserir
  after insert on public.messages
  for each row execute function private.messages_after_insert();

create trigger messages_depois_de_apagar
  after delete on public.messages
  for each row execute function private.messages_after_delete();

-- Rate limit, no mesmo mecanismo dos posts (conta eventos, não linhas).
create trigger messages_rate_limit_minuto
  before insert on public.messages
  for each row execute function private.enforce_rate_limit(
    'mensagem_minuto', '30', '1 minute', 'Muitas mensagens em pouco tempo. Espere um minuto.');

create trigger messages_rate_limit_dia
  before insert on public.messages
  for each row execute function private.enforce_rate_limit(
    'mensagem_dia', '1000', '1 day', 'Você chegou ao limite de mensagens por hoje.');

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
-- Abre (ou devolve) a conversa com um mútuo.
create function public.abrir_conversa(p_outro uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
  v_a   uuid;
  v_b   uuid;
begin
  if v_uid is null then
    raise exception 'Login necessário.' using errcode = 'PT401';
  end if;

  if p_outro is not null and p_outro <> v_uid then
    v_a := least(v_uid, p_outro);
    v_b := greatest(v_uid, p_outro);
    select c.id into v_id from public.conversations c where c.user_a = v_a and c.user_b = v_b;
    -- conversa antiga de ex-mútuos: devolve, para a pessoa poder reler
    if v_id is not null and private.conversa_visivel(v_id, v_uid) then
      return v_id;
    end if;
  end if;

  -- Mesma resposta para "não existe", "não é mútuo" e "bloqueou você".
  if not private.pode_conversar(v_uid, p_outro) then
    raise exception 'Só dá para conversar com quem você segue e que te segue de volta.' using errcode = 'PT403';
  end if;

  insert into public.conversations (institution_id, user_a, user_b)
  values (private.my_institution(), v_a, v_b)
  on conflict (user_a, user_b) do update set user_a = excluded.user_a
  returning id into v_id;
  return v_id;
end
$$;

-- Lista de conversas de quem chama, com o contador de não lidas DELA.
create function public.minhas_conversas()
returns table (
  conversa_id uuid,
  outro_id uuid,
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
           private.pode_conversar(c.user_a, c.user_b) as aberta
    from public.conversations c
    cross join eu
    where eu.id in (c.user_a, c.user_b)
      and private.conversa_visivel(c.id, eu.id)
  )
  select
    m.id,
    p.id,
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
  join public.profiles p on p.id = m.outro
  left join lateral (
    select x.id, x.body, x.sender_id
    from public.messages x
    where x.conversation_id = m.id
    order by x.created_at desc, x.id desc
    limit 1
  ) u on true
  order by coalesce(m.last_message_at, m.created_at) desc, m.id
$$;

-- Total de mensagens não lidas, para o contador da aba Mensagens.
create function public.total_nao_lidas()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(c.nao_lidas), 0)::integer from public.minhas_conversas() c
$$;

-- Marca a conversa como lida até agora. Só mexe no marcador de quem chama, e
-- ninguém mais consegue ler esse marcador.
create function public.marcar_conversa_lida(p_conversa uuid)
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
  if not private.conversa_visivel(p_conversa, v_uid) then
    raise exception 'Conversa não encontrada.' using errcode = 'PT404';
  end if;
  insert into public.conversation_reads (conversation_id, user_id, last_read_at)
  values (p_conversa, v_uid, clock_timestamp())
  on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
end
$$;

-- ---------------------------------------------------------------------------
-- Denunciar uma mensagem: a denúncia leva uma CÓPIA
-- ---------------------------------------------------------------------------
-- A staff não tem acesso a public.messages. O que ela vê é o que quem
-- denunciou escolheu mostrar: esta cópia, feita pelo banco (o cliente não
-- consegue escrever nestas colunas, então não dá para forjar o conteúdo).
-- message_id não é chave estrangeira: a cópia sobrevive se o autor apagar a
-- mensagem depois de denunciado.
alter table public.reports
  add column message_id        uuid,
  add column message_sender_id uuid references public.profiles (id) on delete cascade,
  add column message_body      text,
  add column message_gif_id    text,
  add column message_gif_alt   text,
  add column message_sent_at   timestamptz;

alter table public.reports
  drop constraint reports_um_alvo,
  add constraint reports_um_alvo check (num_nonnulls(post_id, profile_id, message_id) = 1),
  add constraint reports_copia_coerente check ((message_id is null) = (message_sender_id is null)),
  add constraint reports_unico_mensagem unique (reporter_id, message_id);

create function public.denunciar_mensagem(p_mensagem uuid, p_motivo public.report_reason, p_detalhe text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_msg public.messages;
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'Login necessário.' using errcode = 'PT401';
  end if;
  if char_length(p_detalhe) > 1000 then
    raise exception 'O detalhe pode ter até 1000 caracteres.' using errcode = 'PT400';
  end if;

  select m.* into v_msg from public.messages m where m.id = p_mensagem;
  -- Mesma resposta para "não existe" e "não é de uma conversa sua".
  if not found
     or not private.conversa_visivel(v_msg.conversation_id, v_uid)
     or v_msg.sender_id = v_uid then
    raise exception 'Mensagem não encontrada.' using errcode = 'PT404';
  end if;

  begin
    insert into public.reports (
      reporter_id, institution_id, reason, details,
      message_id, message_sender_id, message_body, message_gif_id, message_gif_alt, message_sent_at
    ) values (
      v_uid, private.my_institution(), p_motivo, nullif(btrim(p_detalhe), ''),
      v_msg.id, v_msg.sender_id, v_msg.body, v_msg.gif_id, v_msg.gif_alt, v_msg.created_at
    )
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Você já denunciou esta mensagem. A moderação vai olhar.' using errcode = 'PT409';
  end;
  return v_id;
end
$$;

-- denúncias também têm limite, como as de post e perfil
-- (o trigger reports_rate_limit já cobre: ele é da tabela)

revoke all on function
  public.abrir_conversa(uuid),
  public.minhas_conversas(),
  public.total_nao_lidas(),
  public.marcar_conversa_lida(uuid),
  public.denunciar_mensagem(uuid, public.report_reason, text)
from public, anon;
grant execute on function
  public.abrir_conversa(uuid),
  public.minhas_conversas(),
  public.total_nao_lidas(),
  public.marcar_conversa_lida(uuid),
  public.denunciar_mensagem(uuid, public.report_reason, text)
to authenticated;

-- ---------------------------------------------------------------------------
-- Notificações push
-- ---------------------------------------------------------------------------
-- O endereço de entrega vem do navegador e é para onde a Edge Function vai
-- fazer uma requisição. Sem lista fechada, alguém cadastraria um endereço
-- interno e usaria a função para alcançá-lo (SSRF). Só os serviços de push
-- dos navegadores entram.
create table private.push_hosts (
  padrao text primary key,
  nota   text
);
insert into private.push_hosts (padrao, nota) values
  ('^https://fcm\.googleapis\.com/', 'Chrome, Edge, Android'),
  ('^https://[a-z0-9-]+\.push\.services\.mozilla\.com/', 'Firefox'),
  ('^https://[a-z0-9-]+\.notify\.windows\.com/', 'Edge antigo'),
  ('^https://web\.push\.apple\.com/', 'Safari e iPhone'),
  ('^https://[a-z0-9-]+\.push\.apple\.com/', 'Safari e iPhone')
on conflict (padrao) do nothing;
alter table private.push_hosts enable row level security;
alter table private.push_hosts force row level security;
revoke all on private.push_hosts from anon, authenticated, public;

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint   text not null unique check (char_length(endpoint) between 20 and 1000),
  p256dh     text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}=*$'),
  auth       text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}=*$'),
  created_at timestamptz not null default now()
);
create index push_subscriptions_do_usuario on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
alter table public.push_subscriptions force row level security;
revoke all on public.push_subscriptions from anon, authenticated, public;
grant select, delete on public.push_subscriptions to authenticated;
grant insert (endpoint, p256dh, auth) on public.push_subscriptions to authenticated;

create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy push_subscriptions_insert on public.push_subscriptions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_active((select auth.uid()))));
create policy push_subscriptions_delete on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

create function private.push_subscriptions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from private.push_hosts h where new.endpoint ~ h.padrao) then
    raise exception 'Endereço de notificação não reconhecido.' using errcode = 'PT400';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('peripatos:push:' || new.user_id::text, 0));
  if (select count(*) from public.push_subscriptions s where s.user_id = new.user_id) >= 10 then
    raise exception 'Limite de aparelhos com notificação atingido. Desative em algum deles.' using errcode = 'PT400';
  end if;
  return new;
end
$$;
revoke all on function private.push_subscriptions_before_insert() from public, anon, authenticated;

create trigger push_subscriptions_valida
  before insert on public.push_subscriptions
  for each row execute function private.push_subscriptions_before_insert();

-- ---------------------------------------------------------------------------
-- Os Termos e a Política mudaram (mensagens, notificações): versão nova
-- ---------------------------------------------------------------------------
create or replace function private.termos_versao_atual()
returns text
language sql
immutable
set search_path = ''
as $$ select '2026-10-08-rascunho'::text $$;
