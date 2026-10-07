-- =============================================================================
-- 13 · Auditoria: consentimentos, minimização, MFA da staff, limites, alt de GIF
-- =============================================================================
-- 1. Aceite dos Termos e da Política no onboarding, com versão e data.
-- 2. Consentimento específico para tags sensíveis (LGPD, art. 11), revogável.
-- 3. Minimização: a data de nascimento e o RA deixam de ser guardados.
-- 4. Staff só age com sessão aal2 (segundo fator confirmado).
-- 5. Limite de buscas de GIF por pessoa.
-- 6. Texto alternativo do GIF guardado junto do post.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 3 · Minimização
-- ---------------------------------------------------------------------------
-- DATA DE NASCIMENTO. Só servia para responder "tem 18 ou mais?". Quem informa
-- data de menor tem a conta apagada na hora (migration 12), então toda conta
-- que conclui o onboarding já passou pela verificação, e idade só aumenta.
-- Guardar a data inteira depois disso é guardar mais do que a finalidade
-- pede. Fica só o instante em que a maioridade foi verificada.
--
-- RA. Só servia para impedir duas contas com o mesmo RA na mesma instituição
-- (nomes diferentes antes do ponto). Para isso basta saber se dois RAs são
-- iguais, não qual é o RA: fica um HMAC com a chave do Vault, o mesmo
-- mecanismo do banimento. O RA em claro continua existindo num único lugar, o
-- próprio e-mail em auth.users, sem o qual não há login.
--
-- O banimento não muda: ele é HMAC do E-MAIL, não do RA.
alter table private.accounts
  add column maioridade_verificada_em timestamptz,
  add column ra_hmac bytea check (octet_length(ra_hmac) = 32),
  add column termos_versao text check (termos_versao ~ '^[0-9a-z.-]{1,40}$'),
  add column termos_aceitos_em timestamptz,
  add column sensivel_consentido_em timestamptz,
  add constraint accounts_termos_coerentes check ((termos_versao is null) = (termos_aceitos_em is null));

-- HMAC-SHA256("ra:" || instituição || ":" || RA). O prefixo separa este uso do
-- HMAC de e-mail, que usa a mesma chave. Falha fechado, como email_hmac.
create function private.ra_hmac(p_institution_id uuid, p_ra text)
returns bytea
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  select ds.decrypted_secret into v_key
  from vault.decrypted_secrets ds
  where ds.name = 'peripatos_ban_hmac_key';

  if v_key is null or char_length(v_key) < 32 then
    raise exception 'Segredo peripatos_ban_hmac_key ausente no Vault.';
  end if;
  if p_institution_id is null or p_ra is null then
    raise exception 'ra_hmac: instituição e RA são obrigatórios.';
  end if;

  return extensions.hmac(
    convert_to('ra:' || p_institution_id::text || ':' || p_ra, 'UTF8'),
    decode(v_key, 'hex'),
    'sha256'
  );
end
$$;
revoke all on function private.ra_hmac(uuid, text) from public, anon, authenticated;

update private.accounts set ra_hmac = private.ra_hmac(institution_id, ra);

-- Quem já tinha concluído o onboarding como adulto fica verificado. Uma conta
-- com data de menor (possível antes da migration 12) fica sem verificação e,
-- portanto, inativa.
update private.accounts a
   set maioridade_verificada_em = now()
  from public.profiles p
 where p.id = a.user_id
   and p.onboarding_completo
   and a.birth_date is not null
   and a.birth_date <= private.adult_cutoff();

alter table private.accounts
  alter column ra_hmac set not null,
  add constraint accounts_ra_unico unique (institution_id, ra_hmac),
  drop column ra,
  drop column birth_date;

comment on column private.accounts.maioridade_verificada_em is
  'Quando a pessoa declarou data de nascimento de maior de 18. A data em si não é guardada.';
comment on column private.accounts.ra_hmac is
  'HMAC do RA (chave do Vault). Serve só para impedir duas contas com o mesmo RA.';

create or replace function private.auth_users_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  select * into v from private.parse_signup_email(new.email);
  if v.erro is not null then
    raise exception '%', v.erro using errcode = 'PT403';
  end if;

  begin
    insert into private.accounts (user_id, institution_id, ra_hmac)
    values (new.id, v.institution_id, private.ra_hmac(v.institution_id, v.ra));
  exception when unique_violation then
    -- Mesma mensagem genérica do banimento: não confirma que o RA existe.
    raise exception 'Cadastro não permitido para este e-mail.' using errcode = 'PT403';
  end;

  insert into public.profiles (id, institution_id)
  values (new.id, v.institution_id);

  return new;
end
$$;

-- Conta ativa = onboarding completo + maioridade verificada + não banida.
create or replace function private.is_active(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join private.accounts a on a.user_id = p.id
    where p.id = p_uid
      and p.onboarding_completo
      and p.banned_at is null
      and a.maioridade_verificada_em is not null
  )
$$;

create or replace function private.afinidades(p_reader uuid)
returns table (
  user_id uuid,
  afinidade double precision,
  tags_em_comum integer[],
  mutual boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select a.institution_id
    from private.accounts a
    where a.user_id = p_reader
      and private.is_active(p_reader)
  ),
  ativos as materialized (
    select p.id
    from public.profiles p
    join private.accounts a on a.user_id = p.id
    join me on me.institution_id = p.institution_id
    where p.onboarding_completo
      and p.banned_at is null
      and a.maioridade_verificada_em is not null
  ),
  n as (
    select count(*)::double precision as total from ativos
  ),
  pesos as (
    select pt.tag_id, ln(n.total / count(*)::double precision) as peso
    from public.profile_tags pt
    join ativos on ativos.id = pt.user_id
    cross join n
    group by pt.tag_id, n.total
  ),
  candidatos as materialized (
    select at.id, private.is_mutual(p_reader, at.id) as mutual
    from ativos at
    where at.id <> p_reader
      and not private.is_blocked(p_reader, at.id)
  ),
  minhas as materialized (
    select pt.tag_id, pesos.peso, false as sensivel
    from public.profile_tags pt
    join pesos on pesos.tag_id = pt.tag_id
    where pt.user_id = p_reader
    union all
    select st.tag_id, ln(n.total) / 2, true
    from public.profile_sensitive_tags st
    cross join n
    where st.user_id = p_reader
  ),
  totais as (
    select
      coalesce(sum(m.peso) filter (where not m.sensivel), 0) as comuns,
      coalesce(sum(m.peso) filter (where m.sensivel), 0) as sensiveis
    from minhas m
  ),
  em_comum as (
    select c.id, sum(m.peso) as soma, array_agg(m.tag_id order by m.tag_id) as tags
    from candidatos c
    join minhas m on (
      (
        not m.sensivel
        and exists (
          select 1 from public.profile_tags o
          where o.user_id = c.id and o.tag_id = m.tag_id
        )
      )
      or (
        m.sensivel
        and c.mutual
        and exists (
          select 1 from public.profile_sensitive_tags o
          where o.user_id = c.id and o.tag_id = m.tag_id
        )
      )
    )
    group by c.id
  )
  select
    c.id,
    coalesce(
      ec.soma / nullif(t.comuns + case when c.mutual then t.sensiveis else 0 end, 0),
      0
    )::double precision,
    coalesce(ec.tags, '{}'::integer[]),
    c.mutual
  from candidatos c
  cross join totais t
  left join em_comum ec on ec.id = c.id
$$;

-- ---------------------------------------------------------------------------
-- 1 · Termos e Política: versão vigente
-- ---------------------------------------------------------------------------
-- A versão vigente mora no banco. O app envia a versão que MOSTROU à pessoa e
-- o banco só aceita se for a vigente: não dá para registrar o aceite de um
-- texto que não é o atual. Mudou o texto: nova migration troca este valor, e
-- o app troca a constante em src/lib/legal.ts.
create function private.termos_versao_atual()
returns text
language sql
immutable
set search_path = ''
as $$ select '2026-10-06-rascunho'::text $$;
revoke all on function private.termos_versao_atual() from public, anon;
grant execute on function private.termos_versao_atual() to authenticated;

-- ---------------------------------------------------------------------------
-- Onboarding: maioridade verificada (sem guardar a data) + aceite dos termos
-- ---------------------------------------------------------------------------
drop function public.completar_onboarding(text, text, date, text);

create function public.completar_onboarding(
  p_username text,
  p_display_name text,
  p_data_nascimento date,
  p_bio text default null,
  p_termos_versao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_done  boolean;
  v_hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_uid is null then
    raise exception 'Login necessário.' using errcode = 'PT401';
  end if;

  select p.onboarding_completo
    into v_done
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

  if p_termos_versao is distinct from private.termos_versao_atual() then
    raise exception 'Para continuar é preciso aceitar a versão atual dos Termos de uso e da Política de privacidade.'
      using errcode = 'PT400';
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

  -- A data serviu para a comparação acima e não é gravada.
  update private.accounts
     set maioridade_verificada_em = now(),
         termos_versao = p_termos_versao,
         termos_aceitos_em = now()
   where user_id = v_uid;

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

-- Estado da própria conta. Nunca devolve dado pessoal, só resultados.
create or replace function public.conta_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'onboarding_completo', p.onboarding_completo,
    'maior_de_idade', a.maioridade_verificada_em is not null,
    'banido', p.banned_at is not null,
    'ativo', private.is_active(p.id),
    'termos_versao', a.termos_versao,
    'termos_aceitos_em', a.termos_aceitos_em,
    'termos_em_dia', coalesce(a.termos_versao = private.termos_versao_atual(), false),
    'sensiveis_consentido_em', a.sensivel_consentido_em
  )
  from public.profiles p
  join private.accounts a on a.user_id = p.id
  where p.id = (select auth.uid())
$$;

revoke all on function public.completar_onboarding(text, text, date, text, text) from public, anon;
grant execute on function public.completar_onboarding(text, text, date, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2 · Tags sensíveis: consentimento específico e destacado (LGPD, art. 11, I)
-- ---------------------------------------------------------------------------
-- Orientação sexual, identidade de gênero, religião e posição política são
-- dados sensíveis. A base legal é o consentimento específico e destacado,
-- separado do aceite geral dos termos:
--   - sem consentimento registrado, o banco recusa gravar qualquer tag sensível;
--   - revogar apaga todas as tags sensíveis e o registro do consentimento, na
--     mesma transação. Não existe "revoguei mas as tags ficaram".
create function public.consentir_tags_sensiveis()
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
  if private.is_banned(v_uid) then
    raise exception 'Conta banida.' using errcode = 'PT403';
  end if;

  update private.accounts
     set sensivel_consentido_em = coalesce(sensivel_consentido_em, now())
   where user_id = v_uid
  returning sensivel_consentido_em into v_em;

  if not found then
    raise exception 'Conta não encontrada.' using errcode = 'PT404';
  end if;
  return v_em;
end
$$;

create function public.revogar_tags_sensiveis()
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

  -- o mesmo lock do trigger de inserção: uma inserção paralela espera e, ao
  -- continuar, já encontra o consentimento revogado
  perform pg_advisory_xact_lock(hashtextextended('peripatos:tags:' || v_uid::text, 0));

  delete from public.profile_sensitive_tags where user_id = v_uid;
  update private.accounts set sensivel_consentido_em = null where user_id = v_uid;
end
$$;

revoke all on function public.consentir_tags_sensiveis(), public.revogar_tags_sensiveis() from public, anon;
grant execute on function public.consentir_tags_sensiveis(), public.revogar_tags_sensiveis() to authenticated;

-- Vale para qualquer caminho de escrita, inclusive seed e service role.
create function private.sensiveis_exigem_consentimento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('peripatos:tags:' || new.user_id::text, 0));
  if not exists (
    select 1 from private.accounts a
    where a.user_id = new.user_id and a.sensivel_consentido_em is not null
  ) then
    raise exception 'Para marcar identidade ou crenças é preciso dar o consentimento específico antes.'
      using errcode = 'PT403';
  end if;
  return new;
end
$$;
revoke all on function private.sensiveis_exigem_consentimento() from public, anon, authenticated;

-- "a_" para rodar antes de profile_sensitive_tags_valida (ordem alfabética).
create trigger a_sensiveis_consentimento
  before insert on public.profile_sensitive_tags
  for each row execute function private.sensiveis_exigem_consentimento();

-- ---------------------------------------------------------------------------
-- 4 · Staff só age com segundo fator (aal2)
-- ---------------------------------------------------------------------------
-- O Auth grava no JWT o nível da sessão: aal1 (só o código por e-mail) ou
-- aal2 (código + TOTP confirmado). O cargo continua vindo de staff_roles;
-- o que muda é que, para QUEM ESTÁ CHAMANDO, ter o cargo não basta.
--
-- A checagem fica em is_staff/is_admin, e não só nas RPCs, porque as mesmas
-- funções decidem o que a staff LÊ (fila de denúncias, registro de moderação,
-- fotos pendentes). Sem aal2 a pessoa não age nem lê como staff.
--
-- Quando p_uid não é quem chama (ex.: conferir o cargo do alvo), a sessão de
-- quem chama não diz nada sobre essa pessoa, e vale só o cargo.
create function private.sessao_aal2()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
$$;
revoke all on function private.sessao_aal2() from public, anon;
grant execute on function private.sessao_aal2() to authenticated;

create or replace function private.is_staff(p_uid uuid, p_institution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_roles s
    where s.user_id = p_uid
      and s.institution_id = p_institution_id
  )
  and private.is_active(p_uid)
  and (p_uid is distinct from (select auth.uid()) or private.sessao_aal2())
$$;

create or replace function private.is_admin(p_uid uuid, p_institution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_roles s
    where s.user_id = p_uid
      and s.institution_id = p_institution_id
      and s.role = 'admin'
  )
  and private.is_active(p_uid)
  and (p_uid is distinct from (select auth.uid()) or private.sessao_aal2())
$$;

-- Mesma porta de antes, com uma mensagem própria para quem TEM o cargo mas
-- ainda não confirmou o segundo fator (só a própria pessoa recebe essa
-- mensagem; para os outros continua "Sem permissão").
create or replace function private.exigir_staff(p_institution_id uuid, p_apenas_admin boolean default false)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Login necessário.' using errcode = 'PT401';
  end if;
  if not private.sessao_aal2()
     and exists (select 1 from public.staff_roles s where s.user_id = v_uid) then
    raise exception 'Confirme a verificação em duas etapas para agir como moderação.' using errcode = 'PT403';
  end if;
  -- Mesma resposta para "não existe" e "não é da sua instituição".
  if p_institution_id is null
     or (p_apenas_admin and not private.is_admin(v_uid, p_institution_id))
     or (not p_apenas_admin and not private.is_staff(v_uid, p_institution_id)) then
    raise exception 'Sem permissão para esta ação.' using errcode = 'PT403';
  end if;
  return v_uid;
end
$$;

-- ---------------------------------------------------------------------------
-- 5 · Limite de buscas de GIF
-- ---------------------------------------------------------------------------
-- A chave do Giphy é uma só para o app inteiro, com cota por hora. A rota
-- /api/giphy chama esta função antes de falar com o Giphy: o contador mora no
-- banco porque o servidor do app não guarda estado entre requisições.
create function public.registrar_busca_gif()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_min integer;
  v_dia integer;
begin
  if v_uid is null then
    raise exception 'Login necessário.' using errcode = 'PT401';
  end if;
  if not private.is_active(v_uid) then
    raise exception 'Conta inativa.' using errcode = 'PT403';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('peripatos:rate:gif:' || v_uid::text, 0));

  delete from private.rate_limit_events e
  where e.user_id = v_uid and e.action = 'gif_busca' and e.created_at <= now() - interval '1 day';

  select count(*) filter (where e.created_at > now() - interval '1 minute'), count(*)
    into v_min, v_dia
  from private.rate_limit_events e
  where e.user_id = v_uid and e.action = 'gif_busca';

  if v_min >= 30 then
    raise exception 'Muitas buscas de GIF em pouco tempo. Espere um minuto.'
      using errcode = 'PT429', detail = 'Limite: 30 por minuto.';
  end if;
  if v_dia >= 400 then
    raise exception 'Você chegou ao limite de buscas de GIF por hoje.'
      using errcode = 'PT429', detail = 'Limite: 400 por dia.';
  end if;

  insert into private.rate_limit_events (user_id, action) values (v_uid, 'gif_busca');
end
$$;
revoke all on function public.registrar_busca_gif() from public, anon;
grant execute on function public.registrar_busca_gif() to authenticated;

-- ---------------------------------------------------------------------------
-- 6 · Texto alternativo do GIF
-- ---------------------------------------------------------------------------
-- O título que o Giphy dá ao GIF, para leitores de tela. Vem do cliente, então
-- é tratado como texto do usuário: tamanho limitado, sem caracteres de
-- controle, e só existe junto de um gif_id.
alter table public.posts
  add column gif_alt text,
  add constraint posts_gif_alt_valido check (
    gif_alt is null
    or (gif_id is not null and char_length(gif_alt) between 1 and 200 and gif_alt !~ '[[:cntrl:]]')
  );

grant insert (gif_alt) on public.posts to authenticated;
grant update (gif_alt) on public.posts to authenticated;

drop function public.feed(text, integer);

create function public.feed(p_cursor text default null, p_limite integer default 20)
returns table (
  post_id uuid,
  author_id uuid,
  username text,
  display_name text,
  avatar_path text,
  avatar_preset smallint,
  body text,
  gif_id text,
  gif_alt text,
  created_at timestamptz,
  edited_at timestamptz,
  afinidade numeric,
  score numeric,
  origem text,
  next_cursor text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid    uuid := auth.uid();
  v_inst   uuid;
  v_ts     timestamptz := now();
  v_offset integer := 0;
  v_limit  integer := least(greatest(coalesce(p_limite, 20), 1), 50);
  v_micros bigint;
begin
  if v_uid is null then
    raise exception 'Login necessário.' using errcode = 'PT401';
  end if;
  if not private.is_active(v_uid) then
    return;
  end if;
  v_inst := private.my_institution();

  if p_cursor is not null then
    if p_cursor !~ '^[0-9]{1,18}:[0-9]{1,4}$' then
      raise exception 'Cursor inválido.' using errcode = 'PT400';
    end if;
    v_ts := 'epoch'::timestamptz + split_part(p_cursor, ':', 1)::bigint * interval '1 microsecond';
    v_offset := split_part(p_cursor, ':', 2)::integer;
    if v_ts > now() or v_ts < now() - interval '6 hours' then
      raise exception 'Cursor expirado: recarregue o feed.' using errcode = 'PT400';
    end if;
  end if;

  v_micros := (extract(epoch from v_ts) * 1000000)::bigint;
  v_ts := 'epoch'::timestamptz + v_micros * interval '1 microsecond';

  return query
  with af as materialized (
    select a.user_id, a.afinidade, cardinality(a.tags_em_comum) > 0 as tem_comum
    from private.afinidades(v_uid) a
  ),
  janela as (
    select po.id, po.author_id, po.body, po.gif_id, po.gif_alt, po.created_at, po.edited_at,
           af.afinidade, af.tem_comum
    from public.posts po
    join af on af.user_id = po.author_id
    where po.institution_id = v_inst
      and po.deleted_at is null
      and po.hidden_at is null
      and po.created_at <= v_ts
      and po.created_at > v_ts - interval '30 days'
    order by po.created_at desc, po.id desc
    limit 500
  ),
  pontuado as (
    select j.*,
           0.6 * j.afinidade
             + 0.4 * exp(-(extract(epoch from (v_ts - j.created_at)) / 3600.0)::double precision / 24.0) as score
    from janela j
  ),
  ranqueado as (
    select pt.*,
           case
             when pt.tem_comum then
               row_number() over (partition by pt.tem_comum order by pt.score desc, pt.created_at desc, pt.id desc)
             else
               row_number() over (partition by pt.tem_comum order by pt.created_at desc, pt.id desc)
           end as rk
    from pontuado pt
  ),
  intercalado as (
    select r.*,
           case when r.tem_comum then r.rk + (r.rk - 1) / 3 else r.rk * 4 end as pos,
           count(*) over () as total
    from ranqueado r
  )
  select
    i.id,
    i.author_id,
    p.username,
    p.display_name,
    case when p.avatar_status = 'aprovado' then p.avatar_path end,
    p.avatar_preset,
    i.body,
    i.gif_id,
    i.gif_alt,
    i.created_at,
    i.edited_at,
    round(i.afinidade::numeric, 4),
    round(i.score::numeric, 6),
    case when i.tem_comum then 'afinidade' else 'descoberta' end,
    case when i.total > v_offset + v_limit
         then v_micros::text || ':' || (v_offset + v_limit)::text
    end
  from intercalado i
  join public.profiles p on p.id = i.author_id
  order by i.pos
  offset v_offset
  limit v_limit;
end
$$;

revoke all on function public.feed(text, integer) from public, anon;
grant execute on function public.feed(text, integer) to authenticated;
