-- =============================================================================
-- Conquistas: cada uma, e as regras gerais (só o banco concede, permanente,
-- secreta não aparece, privada não aparece para os outros)
-- =============================================================================
-- Horários da Coruja são sempre explícitos: o teste não pode depender da hora
-- em que roda.
-- =============================================================================
begin;
\ir _helpers.psql
select plan(151);

select tests.seed_world();

create function tests.tem(p_alias text, p_slug text) returns boolean language sql stable security definer set search_path = '' as
  $$ select exists (select 1 from public.user_achievements ua where ua.user_id = tests.uid(p_alias) and ua.achievement_slug = p_slug) $$;
-- torna duas pessoas mútuas, como superusuário (sem rate limit)
create function tests.mutuos(p_a text, p_b text) returns void language sql as
  $$ insert into public.follows (follower_id, followee_id)
     values (tests.uid(p_a), tests.uid(p_b)), (tests.uid(p_b), tests.uid(p_a)) $$;
-- um post com hora escolhida (horário de Brasília)
create function tests.post_as(p_alias text, p_hora text) returns void language sql as
  $$ insert into public.posts (author_id, institution_id, body, created_at)
     select p.id, p.institution_id, 'post das ' || p_hora, (p_hora || ' America/Sao_Paulo')::timestamptz
     from public.profiles p where p.id = tests.uid(p_alias) $$;
grant execute on function tests.tem(text, text) to authenticated;

-- Contas antigas: assim a Xênia só entra em cena onde o teste quer.
update public.profiles set created_at = now() - interval '60 days';

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------
select is((select count(*) from public.achievements), 14::bigint, 'o catálogo tem as 14 conquistas');
select is(
  (select array_agg(slug order by slug) from public.achievements where is_secret),
  array['coruja-de-atena', 'minotauro'], 'secretas: Coruja de Atena e Minotauro'
);
select is(
  (select array_agg(slug) from public.achievements where private_by_default),
  array['coruja-de-atena'], 'privada por padrão: só a Coruja'
);
select is(
  (select array_agg(slug) from public.achievements where is_manual),
  array['heracles'], 'concedida à mão: só Héracles'
);
select is(
  (select count(distinct color) from public.achievements), 14::bigint, 'cada conquista tem a sua cor'
);
select is(
  (select count(distinct emoji) from public.achievements), 14::bigint, 'e o seu emoji'
);
select is(
  (select count(*) from public.achievements where btrim(emoji_label) = ''), 0::bigint,
  'todo emoji tem descrição para leitor de tela'
);

-- ---------------------------------------------------------------------------
-- Ninguém se dá conquista pela API
-- ---------------------------------------------------------------------------
select tests.login('ana');
select throws_ok(
  $$ insert into public.user_achievements (achievement_slug) values ('heracles') $$, '42501', null,
  'usuário logado não insere conquista para si'
);
select throws_ok(
  format($$ insert into public.user_achievements (user_id, achievement_slug) values (%L, 'simposio') $$, tests.uid('ana')),
  '42501', null, 'nem informando o próprio id'
);
select throws_ok(
  $$ update public.user_achievements set achievement_slug = 'simposio' where achievement_slug = 'fundador' $$, '42501', null,
  'nem trocando uma conquista que tem por outra'
);
select throws_ok(
  $$ update public.user_achievements set user_id = auth.uid() $$, '42501', null,
  'nem tomando a de outra pessoa'
);
select throws_ok($$ delete from public.user_achievements $$, '42501', null, 'conquista não se apaga: é permanente');
select throws_ok(
  $$ insert into public.achievements (slug, name, description, emoji, emoji_label, color, position)
     values ('inventada', 'Inventada', 'x', '⭐', 'estrela', '#000000', 99) $$, '42501', null,
  'nem cria conquista no catálogo'
);
select throws_ok($$ update public.achievements set is_secret = false $$, '42501', null, 'nem altera o catálogo');
select throws_ok($$ select private.conceder(auth.uid(), 'simposio') $$, '42501', null, 'nem chama a função interna que concede');
select throws_ok($$ select * from private.achievement_dates $$, '42501', null, 'nem lê a tabela das datas');
select throws_ok(
  $$ select public.conceder_conquista(auth.uid(), 'heracles', 'eu mereço') $$, 'PT403', null,
  'nem usa a RPC de admin'
);
select tests.login_anon();
select throws_ok($$ select * from public.user_achievements $$, '42501', null, 'anon não lê conquistas');
select throws_ok($$ select * from public.achievements $$, '42501', null, 'nem o catálogo');
select tests.logout();
select is(tests.tem('ana', 'heracles') or tests.tem('ana', 'simposio'), false, 'nenhuma das tentativas deu conquista');

-- ---------------------------------------------------------------------------
-- Fundador
-- ---------------------------------------------------------------------------
select is(tests.tem('ana', 'fundador'), true, 'sem data de corte (beta aberto), quem conclui o onboarding é Fundador');
select is(tests.tem('novo', 'fundador'), false, 'quem não concluiu o onboarding ainda não');

insert into private.config (chave, valor) values ('fundador_ate', (now() - interval '1 hour')::text);
select tests.mk_user('tardio');
select is(tests.tem('tardio', 'fundador'), false, 'conta criada depois do fim do beta não é Fundador');
update private.config set valor = (now() + interval '1 hour')::text where chave = 'fundador_ate';
select tests.mk_user('cedo');
select is(tests.tem('cedo', 'fundador'), true, 'conta criada antes da data de corte é');
select is(tests.tem('ana', 'fundador'), true, 'mudar a data de corte não tira a conquista de quem já tinha');
delete from private.config where chave = 'fundador_ate';

-- ---------------------------------------------------------------------------
-- Peripatético
-- ---------------------------------------------------------------------------
select is(tests.tem('ana', 'peripatetico'), false, 'antes de postar, sem Peripatético');
select tests.login('ana');
select ok(
  not exists (select 1 from public.achievements where slug = 'peripatetico') = false,
  'conquista comum aparece no catálogo mesmo antes de ser ganha'
);
select tests.logout();
select tests.post_as('ana', '2026-03-10 15:00');
select is(tests.tem('ana', 'peripatetico'), true, 'o primeiro post dá o Peripatético');

-- ---------------------------------------------------------------------------
-- Coruja de Atena
-- ---------------------------------------------------------------------------
select is(tests.tem('ana', 'coruja-de-atena'), false, 'post às 15:00 não dá a Coruja');
select tests.mk_user('h0059');
select tests.mk_user('h0100');
select tests.mk_user('h0430');
select tests.mk_user('h0431');
select tests.post_as('h0059', '2026-03-10 00:59');
select tests.post_as('h0100', '2026-03-10 01:00');
select tests.post_as('h0430', '2026-03-10 04:30');
select tests.post_as('h0431', '2026-03-10 04:31');
select is(tests.tem('h0059', 'coruja-de-atena'), false, 'post às 00:59 (Brasília) não dá');
select is(tests.tem('h0100', 'coruja-de-atena'), true, 'post à 01:00 dá');
select is(tests.tem('h0430', 'coruja-de-atena'), true, 'post às 04:30 dá');
select is(tests.tem('h0431', 'coruja-de-atena'), false, 'post às 04:31 não dá');
select is(private.hora_da_coruja(timestamptz '2026-03-10 05:30+00'), true, '05:30 UTC são 02:30 em Brasília: vale o horário de Brasília');
select is(private.hora_da_coruja(timestamptz '2026-03-10 02:30+00'), false, '02:30 UTC são 23:30 em Brasília: não vale');

-- mensagem de madrugada também dá
select tests.mutuos('bia', 'caio');
select tests.login('bia');
select public.abrir_conversa(tests.uid('caio'));
select tests.logout();
insert into public.messages (conversation_id, sender_id, body, created_at)
select c.id, tests.uid('bia'), 'mensagem de madrugada', timestamptz '2026-03-10 03:15 America/Sao_Paulo'
from public.conversations c;
select is(tests.tem('bia', 'coruja-de-atena'), true, 'mensagem às 03:15 dá a Coruja');
insert into public.messages (conversation_id, sender_id, body, created_at)
select c.id, tests.uid('caio'), 'mensagem da tarde', timestamptz '2026-03-10 16:00 America/Sao_Paulo'
from public.conversations c;
select is(tests.tem('caio', 'coruja-de-atena'), false, 'mensagem às 16:00 não dá');

-- não registra nada de novo: só existem as tabelas previstas
select is(
  (select array_agg(c.relname::text order by c.relname)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private') and c.relkind = 'r'
      and c.relname in ('achievements', 'user_achievements', 'achievement_dates', 'notifications', 'push_preferences', 'config', 'termos_versoes')),
  array['achievement_dates', 'achievements', 'config', 'notifications', 'push_preferences', 'termos_versoes', 'user_achievements'],
  'as tabelas do marco 3 são estas'
);
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private') and c.relkind = 'r'
      and c.relname ~ '(acess|access|login|sess|activity|atividade|presen|visit|last_seen|online)'),
  0::bigint, 'nenhuma tabela registra acesso, presença ou atividade'
);
select is(
  (select count(*) from information_schema.columns
    where table_schema in ('public', 'private')
      and column_name ~ '(last_seen|last_active|ultimo_acesso|ultima_atividade|visto_em|online)'),
  0::bigint, 'nem coluna'
);

-- secreta e privada por padrão
select is(
  (select hidden from public.user_achievements where user_id = tests.uid('h0100') and achievement_slug = 'coruja-de-atena'),
  true, 'a Coruja nasce escondida do perfil'
);
select tests.login('h0100');
select is(
  (select count(*) from public.user_achievements where user_id = auth.uid() and achievement_slug = 'coruja-de-atena'),
  1::bigint, 'quem ganhou vê a própria Coruja'
);
select is((select count(*) from public.achievements where slug = 'coruja-de-atena'), 1::bigint, 'e passa a vê-la no catálogo');
select tests.login('ana');
select is(
  (select count(*) from public.user_achievements where achievement_slug = 'coruja-de-atena'), 0::bigint,
  'a Coruja de outra pessoa não aparece para os outros por padrão'
);
select is(
  (select count(*) from public.achievements where slug = 'coruja-de-atena'), 0::bigint,
  'e, para quem não ganhou, a conquista secreta nem existe no catálogo'
);
select is((select count(*) from public.achievements where is_secret), 0::bigint, 'nenhuma secreta não ganha aparece');
select tests.login_mfa('adma');
select is(
  (select count(*) from public.user_achievements where achievement_slug = 'coruja-de-atena'), 0::bigint,
  'nem a administração vê a Coruja escondida de alguém'
);

-- a dona decide mostrar
select tests.login('h0100');
select lives_ok(
  $$ update public.user_achievements set hidden = false where user_id = auth.uid() and achievement_slug = 'coruja-de-atena' $$,
  'a dona pode mostrar a Coruja no perfil'
);
select tests.login('ana');
select is(
  (select array_agg(user_id) from public.user_achievements where achievement_slug = 'coruja-de-atena'),
  array[tests.uid('h0100')], 'aí os outros veem: só a de quem mostrou, não a de quem manteve escondida'
);
select is((select count(*) from public.achievements where slug = 'coruja-de-atena'), 1::bigint, 'e a conquista passa a existir no catálogo de quem viu');

-- esconder qualquer conquista
select tests.login('h0100');
select lives_ok(
  $$ update public.user_achievements set hidden = true where user_id = auth.uid() and achievement_slug = 'fundador' $$,
  'a pessoa pode esconder qualquer conquista'
);
update public.user_achievements set hidden = true where user_id = tests.uid('ana');
select tests.logout();
select is(
  (select count(*) from public.user_achievements where user_id = tests.uid('ana') and hidden), 0::bigint,
  'mas não esconde (nem mexe em) conquista de outra pessoa'
);
select is(tests.tem('h0100', 'fundador'), true, 'esconder não apaga: continua sendo dela');
select tests.login('ana');
select is(
  (select count(*) from public.user_achievements where user_id = tests.uid('h0100') and achievement_slug = 'fundador'), 0::bigint,
  'a conquista escondida some para os outros'
);

-- quem tem (a página da conquista): só quem deixou visível e é visível
select ok(
  (select count(*) from public.user_achievements where achievement_slug = 'fundador' and user_id = tests.uid('bia')) = 1,
  'a página de uma conquista mostra quem tem'
);
select is(
  (select count(*) from public.user_achievements where user_id = tests.uid('zeca')), 0::bigint,
  'não mostra gente de outra instituição'
);
insert into public.blocks (blocked_id) values (tests.uid('davi'));
select is(
  (select count(*) from public.user_achievements where user_id = tests.uid('davi')), 0::bigint,
  'nem quem a pessoa bloqueou'
);
select tests.login('davi');
select is(
  (select count(*) from public.user_achievements where user_id = tests.uid('ana')), 0::bigint,
  'nem quem bloqueou a pessoa'
);
select tests.logout();
delete from public.blocks;

-- ---------------------------------------------------------------------------
-- Conhece-te a ti mesmo
-- ---------------------------------------------------------------------------
select tests.login('davi');
update public.profiles set bio = 'Gosto de xadrez.' where id = auth.uid();
select is(tests.tem('davi', 'conhece-te-a-ti-mesmo'), false, 'só a bio não basta');
update public.profiles set avatar_preset = 3 where id = auth.uid();
select is(tests.tem('davi', 'conhece-te-a-ti-mesmo'), false, 'bio e avatar pronto, sem tags, não basta');
insert into public.profile_tags (tag_id) values (tests.tag('t-rock'));
select is(tests.tem('davi', 'conhece-te-a-ti-mesmo'), true, 'bio, avatar pronto e tags: Conhece-te a ti mesmo');
select tests.logout();

-- com foto: só depois de aprovada
update public.profiles set bio = 'Bio do caio.' where id = tests.uid('caio');
select tests.add_tag('caio', 't-rpg');
insert into storage.objects (bucket_id, name) values ('avatars', tests.uid('caio') || '/foto.webp');
select is(tests.tem('caio', 'conhece-te-a-ti-mesmo'), false, 'foto pendente de aprovação não conta');
select tests.login_mfa('moda');
select public.moderar_avatar(tests.uid('caio'), true, 'foto adequada');
select tests.logout();
select is(tests.tem('caio', 'conhece-te-a-ti-mesmo'), true, 'foto aprovada conta');

-- tag sensível não conta como "tags escolhidas"
select tests.mk_user('sens');
update public.profiles set bio = 'Bio.', avatar_preset = 1, created_at = now() - interval '60 days' where id = tests.uid('sens');
select tests.add_tag('sens', 't-sensivel');
select is(tests.tem('sens', 'conhece-te-a-ti-mesmo'), false, 'só tag sensível não dá a conquista (ela não pode denunciar a tag)');

-- ---------------------------------------------------------------------------
-- Polímata
-- ---------------------------------------------------------------------------
insert into public.tags (category, slug, name, is_sensitive) values
  ('cat-1', 'p-1', 'p-1', false), ('cat-2', 'p-2', 'p-2', false), ('cat-3', 'p-3', 'p-3', false),
  ('cat-4', 'p-4', 'p-4', false), ('cat-5', 'p-5', 'p-5', false), ('cat-1', 'p-1b', 'p-1b', false),
  ('cat-6', 'p-sens', 'p-sens', true);
select tests.mk_user('poli');
select tests.add_tag('poli', 'p-1');
select tests.add_tag('poli', 'p-1b');
select tests.add_tag('poli', 'p-2');
select tests.add_tag('poli', 'p-3');
select tests.add_tag('poli', 'p-4');
select is(tests.tem('poli', 'polimata'), false, 'cinco tags em quatro categorias não bastam');
select tests.add_tag('poli', 'p-sens');
select is(tests.tem('poli', 'polimata'), false, 'tag sensível de uma quinta categoria não conta');
select tests.login('poli');
insert into public.profile_tags (tag_id) values (tests.tag('p-5'));
select tests.logout();
select is(tests.tem('poli', 'polimata'), true, 'tags comuns em cinco categorias: Polímata');

-- ---------------------------------------------------------------------------
-- Xênia
-- ---------------------------------------------------------------------------
select tests.mk_user('recem');   -- conta de hoje
select tests.login('ana');
insert into public.follows (followee_id) values (tests.uid('recem'));
select tests.logout();
select is(tests.tem('ana', 'xenia'), false, 'seguir quem chegou agora, sem ser seguido de volta, não dá a Xênia');
select tests.login('recem');
insert into public.follows (followee_id) values (tests.uid('ana'));
select tests.logout();
select is(tests.tem('ana', 'xenia'), true, 'ser o primeiro mútuo de uma conta de até 14 dias dá a Xênia');
select is(tests.tem('recem', 'xenia'), false, 'quem chegou agora não ganha por isso (a conta da ana é antiga)');
select tests.mutuos('davi', 'recem');
select is(tests.tem('davi', 'xenia'), false, 'o segundo mútuo de quem chegou não ganha');

select tests.mk_user('antigo');
update public.profiles set created_at = now() - interval '15 days' where id = tests.uid('antigo');
select tests.mutuos('moda', 'antigo');
select is(tests.tem('moda', 'xenia'), false, 'conta com 15 dias já não é recém-chegada');

-- ---------------------------------------------------------------------------
-- Ponte
-- ---------------------------------------------------------------------------
select tests.mk_user('pta'); select tests.mk_user('ptb'); select tests.mk_user('ptc');
select tests.mk_user('ptd'); select tests.mk_user('pte'); select tests.mk_user('ptf');
select tests.add_tag('pta', 'design');
select tests.add_tag('ptb', 'letras');
select tests.add_tag('ptc', 'design');
select tests.add_tag('ptd', 'design');
select tests.add_tag('ptd', 'historia');
select tests.add_tag('pte', 'letras');
select tests.add_tag('ptf', 't-rock');   -- nenhuma tag de curso

select tests.follow('pta', 'ptb');
select is(tests.tem('pta', 'ponte') or tests.tem('ptb', 'ponte'), false, 'seguir de um lado só não dá a Ponte');
select tests.follow('ptb', 'pta');
select is(tests.tem('pta', 'ponte') and tests.tem('ptb', 'ponte'), true, 'mútuos de cursos diferentes: os dois ganham a Ponte');
select tests.mutuos('ptc', 'ptd');
select is(tests.tem('ptc', 'ponte') or tests.tem('ptd', 'ponte'), false, 'com um curso em comum não há Ponte');
select tests.mutuos('pte', 'ptf');
select is(tests.tem('pte', 'ponte') or tests.tem('ptf', 'ponte'), false, 'se um dos dois não tem tag de curso, não há Ponte');

-- ---------------------------------------------------------------------------
-- Simpósio
-- ---------------------------------------------------------------------------
select tests.mk_user('centro');
select tests.mk_user('sim' || g) from generate_series(1, 10) g;
select tests.mutuos('centro', 'sim' || g) from generate_series(1, 9) g;
select is(tests.tem('centro', 'simposio'), false, 'nove mútuos não dão o Simpósio');
select tests.follow('centro', 'sim10');
select is(tests.tem('centro', 'simposio'), false, 'o décimo ainda não seguiu de volta');
select tests.follow('sim10', 'centro');
select is(tests.tem('centro', 'simposio'), true, 'dez mútuos ao mesmo tempo: Simpósio');
select is(tests.tem('sim10', 'simposio'), false, 'quem tem um mútuo só não ganha');
delete from public.follows where follower_id = tests.uid('centro');
select is(tests.tem('centro', 'simposio'), true, 'perder os mútuos depois não tira a conquista: é permanente');

-- ---------------------------------------------------------------------------
-- Koinonia
-- ---------------------------------------------------------------------------
select tests.mk_user('koi1'); select tests.mk_user('koi2'); select tests.mk_user('koi3'); select tests.mk_user('koi4');
select tests.mutuos('koi1', 'koi2');
select tests.mutuos('koi2', 'koi3');
select tests.mutuos('koi3', 'koi4');
select is(
  tests.tem('koi1', 'koinonia') or tests.tem('koi2', 'koinonia') or tests.tem('koi3', 'koinonia'), false,
  'dois lados do triângulo não dão a Koinonia'
);
select tests.follow('koi1', 'koi3');
select is(tests.tem('koi1', 'koinonia'), false, 'o terceiro lado ainda é de mão única');
select tests.follow('koi3', 'koi1');
select is(
  tests.tem('koi1', 'koinonia') and tests.tem('koi2', 'koinonia') and tests.tem('koi3', 'koinonia'), true,
  'fechou o trio: os três ganham a Koinonia'
);
select is(tests.tem('koi4', 'koinonia'), false, 'quem é mútuo de um só do trio não ganha');

-- não vaza os outros dois
select is(
  (select array_agg(k order by k) from public.user_achievements ua, jsonb_object_keys(to_jsonb(ua)) k
    where ua.user_id = tests.uid('koi2') and ua.achievement_slug = 'koinonia'),
  array['achievement_slug', 'hidden', 'user_id'],
  'a linha da conquista só tem dono, conquista e visibilidade: nada sobre os outros dois'
);
select is(
  (select count(*) from public.user_achievements ua
    where ua.achievement_slug = 'koinonia' and to_jsonb(ua)::text ~ (tests.uid('koi1')::text || '|' || tests.uid('koi3')::text)
      and ua.user_id = tests.uid('koi2')),
  0::bigint, 'nem o id deles'
);
select is(
  (select to_jsonb(n) - 'id' - 'created_at' from public.notifications n
    where n.user_id = tests.uid('koi2') and n.achievement_slug = 'koinonia'),
  jsonb_build_object(
    'user_id', tests.uid('koi2'), 'type', 'conquista', 'actor_id', null,
    'achievement_slug', 'koinonia', 'read_at', null, 'pushed_at', null),
  'a notificação da Koinonia não aponta para ninguém'
);
select tests.login('koi2');
select is(
  (select count(*) from public.minhas_notificacoes() n
    where n.conquista_slug = 'koinonia' and (n.pessoas <> '[]'::jsonb or to_jsonb(n)::text ~ 'koi1|koi3')),
  0::bigint, 'nem na aba de notificações'
);
select is(
  (select array_agg(k order by k) from public.minhas_conquistas() c, jsonb_object_keys(to_jsonb(c)) k where c.slug = 'koinonia'),
  array['ganha_em', 'oculta', 'slug'], 'minhas_conquistas devolve só a conquista, a data e se está oculta'
);
select throws_ok(
  $$ select earned_at from private.achievement_dates $$, '42501', null,
  'a data em que os outros ganharam (igual à sua, para os outros dois) não é legível'
);
select is(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'user_achievements' and data_type like 'timestamp%'),
  0::bigint, 'a tabela pública de conquistas não tem coluna de data'
);
-- k2 não vê os follows entre k1 e k3
select is(
  (select count(*) from public.follows where follower_id <> auth.uid() and followee_id <> auth.uid()), 0::bigint,
  'e quem está no trio continua sem ver quem os outros dois seguem'
);
select tests.logout();

-- ---------------------------------------------------------------------------
-- Hermes
-- ---------------------------------------------------------------------------
select tests.mk_user('msg1'); select tests.mk_user('msg2');
select tests.mutuos('msg1', 'msg2');
select tests.login('msg1');
select public.abrir_conversa(tests.uid('msg2'));
select tests.logout();
select is(tests.tem('msg1', 'hermes'), false, 'abrir a conversa sem escrever não dá o Hermes');
select tests.login('msg1');
insert into public.messages (conversation_id, body)
select c.id, 'oi' from public.conversations c where tests.uid('msg2') in (c.user_a, c.user_b);
select tests.logout();
select is(tests.tem('msg1', 'hermes'), true, 'a primeira mensagem enviada dá o Hermes');
select is(tests.tem('msg2', 'hermes'), false, 'quem só recebeu não ganha');

-- ---------------------------------------------------------------------------
-- Philia e Odisseia: o job diário
-- ---------------------------------------------------------------------------
select tests.mk_user('phi1'); select tests.mk_user('phi2'); select tests.mk_user('phi3');
select tests.mk_user('phi4'); select tests.mk_user('phi5'); select tests.mk_user('phi6');
select tests.mutuos('phi1', 'phi2');
select tests.mutuos('phi3', 'phi4');
select tests.mutuos('phi5', 'phi6');
update public.follows set created_at = now() - interval '7 months'
 where follower_id in (tests.uid('phi1'), tests.uid('phi2'), tests.uid('phi5'), tests.uid('phi6'));
update public.follows set created_at = now() - interval '5 months'
 where follower_id in (tests.uid('phi3'), tests.uid('phi4'));
-- f5 deixou de seguir e voltou: o follow novo tem data de hoje
delete from public.follows where follower_id = tests.uid('phi5') and followee_id = tests.uid('phi6');
select tests.follow('phi5', 'phi6');

select tests.mk_user('odi1'); select tests.mk_user('odi2');
update public.profiles set created_at = now() - interval '1 year 1 day' where id = tests.uid('odi1');
update public.profiles set created_at = now() - interval '11 months' where id = tests.uid('odi2');

select is(tests.tem('phi1', 'philia') or tests.tem('odi1', 'odisseia'), false, 'antes do job diário, nada');
select private.tarefas_diarias();
select is(tests.tem('phi1', 'philia') and tests.tem('phi2', 'philia'), true, 'mútuos há sete meses: os dois ganham a Philia');
select is(tests.tem('phi3', 'philia') or tests.tem('phi4', 'philia'), false, 'mútuos há cinco meses ainda não');
select is(tests.tem('phi5', 'philia') or tests.tem('phi6', 'philia'), false, 'deixar de seguir zera: quem voltou a seguir hoje recomeça a contagem');
select is(tests.tem('odi1', 'odisseia'), true, 'um ano de conta: Odisseia');
select is(tests.tem('odi2', 'odisseia'), false, 'onze meses ainda não');
select is(tests.tem('novo', 'odisseia'), false, 'conta sem onboarding não ganha');
select lives_ok($$ select private.tarefas_diarias() $$, 'rodar o job de novo não dá erro nem duplica');
select is(
  (select count(*) from public.notifications n where n.user_id = tests.uid('odi1') and n.achievement_slug = 'odisseia'),
  1::bigint, 'a conquista dada pelo job gera uma notificação, uma vez só'
);

-- ---------------------------------------------------------------------------
-- Héracles: só admin, sempre registrado
-- ---------------------------------------------------------------------------
select tests.login('bia');
select throws_ok(
  format($$ select public.conceder_conquista(%L, 'heracles', 'achou um bug') $$, tests.uid('ana')), 'PT403', null,
  'usuário comum não concede Héracles'
);
select tests.login_mfa('moda');
select throws_ok(
  format($$ select public.conceder_conquista(%L, 'heracles', 'achou um bug') $$, tests.uid('ana')), 'PT403', null,
  'moderador não concede: só admin'
);
select tests.login('adma');
select throws_ok(
  format($$ select public.conceder_conquista(%L, 'heracles', 'achou um bug') $$, tests.uid('ana')), 'PT403', null,
  'admin sem o segundo fator não concede'
);
select tests.login_mfa('adma');
select throws_ok(
  format($$ select public.conceder_conquista(%L, 'heracles', '') $$, tests.uid('ana')), 'PT400', null,
  'sem motivo não concede'
);
select throws_ok(
  format($$ select public.conceder_conquista(%L, 'simposio', 'porque sim') $$, tests.uid('ana')), 'PT400', null,
  'admin não concede à mão uma conquista que não é manual'
);
select throws_ok(
  format($$ select public.conceder_conquista(%L, 'minotauro', 'porque sim') $$, tests.uid('ana')), 'PT400', null,
  'nem uma secreta'
);
select throws_ok(
  $$ select public.conceder_conquista(auth.uid(), 'heracles', 'eu mesmo achei') $$, 'PT400', null,
  'nem a si mesmo'
);
select throws_ok(
  format($$ select public.conceder_conquista(%L, 'heracles', 'achou um bug') $$, tests.uid('zeca')), 'PT403', null,
  'nem a alguém de outra instituição'
);
select lives_ok(
  format($$ select public.conceder_conquista(%L, 'heracles', 'reportou o bug do feed duplicado') $$, tests.uid('ana')),
  'admin com o segundo fator concede Héracles'
);
select throws_ok(
  format($$ select public.conceder_conquista(%L, 'heracles', 'de novo') $$, tests.uid('ana')), 'PT409', null,
  'duas vezes não'
);
select tests.logout();
select is(tests.tem('ana', 'heracles'), true, 'a ana tem Héracles');
select is(
  (select jsonb_build_object('ator', actor_id, 'alvo', target_user_id, 'motivo', reason, 'meta', metadata)
     from public.moderation_actions where action = 'conceder_conquista'),
  jsonb_build_object(
    'ator', tests.uid('adma'), 'alvo', tests.uid('ana'),
    'motivo', 'reportou o bug do feed duplicado', 'meta', jsonb_build_object('conquista', 'heracles')),
  'e a concessão ficou registrada em moderation_actions, com quem, para quem e por quê'
);
select is(
  (select count(*) from public.moderation_actions where action = 'conceder_conquista'), 1::bigint,
  'as tentativas recusadas não deixaram registro de concessão'
);

-- ---------------------------------------------------------------------------
-- Minotauro
-- ---------------------------------------------------------------------------
select tests.login('bia');
select is(public.responder_enigma('qualquer coisa'), false, 'sem resposta definida no banco, ninguém acerta');
select throws_ok($$ select public.responder_enigma(null) $$, 'PT400', null, 'resposta nula é recusada');
select throws_ok($$ select public.responder_enigma(repeat('a', 201)) $$, 'PT400', null, 'resposta enorme também');
select throws_ok($$ select private.definir_resposta_do_enigma('abracadabra') $$, '42501', null, 'usuário logado não define a resposta');
select throws_ok($$ select * from private.config $$, '42501', null, 'nem lê a configuração (onde fica o hash)');
select tests.login_anon();
select throws_ok($$ select public.responder_enigma('x') $$, '42501', null, 'anon não tenta o enigma');
select tests.login('novo');
select throws_ok($$ select public.responder_enigma('x') $$, 'PT403', null, 'conta sem onboarding também não');
select tests.logout();

select private.definir_resposta_do_enigma('Fio de Ariadne');
select ok(
  (select valor ~ '^\$2[aby]\$10\$' and valor !~* 'ariadne' from private.config where chave = 'enigma_hash'),
  'o banco guarda um hash bcrypt, não a resposta'
);
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosrc ~* 'ariadne'),
  0::bigint, 'a resposta não está no código de nenhuma função'
);
delete from private.rate_limit_events where action = 'enigma';

-- força bruta
select tests.login('bia');
select is(public.responder_enigma('teseu'), false, 'resposta errada: false');
select is(public.responder_enigma('labirinto'), false, 'outra errada');
select is(public.responder_enigma('creta'), false, 'outra');
select is(public.responder_enigma('minos'), false, 'outra');
select is(public.responder_enigma('dédalo'), false, 'a quinta');
select throws_ok(
  $$ select public.responder_enigma('Fio de Ariadne') $$, 'PT429', null,
  'a sexta tentativa em uma hora é recusada, MESMO com a resposta certa'
);
select throws_ok($$ select public.responder_enigma('ícaro') $$, 'PT429', null, 'e continua recusando');
select tests.logout();
select is(tests.tem('bia', 'minotauro'), false, 'força bruta não deu o Minotauro');
select is(
  (select count(*) from private.rate_limit_events where user_id = tests.uid('bia') and action = 'enigma'), 5::bigint,
  'cada tentativa errada ficou registrada'
);

-- o limite é por pessoa
select tests.login('davi');
select is(public.responder_enigma('teseu'), false, 'o limite de uma pessoa não trava a outra');
select tests.logout();

-- passou uma hora: mais cinco. Mas há também o teto do dia.
update private.rate_limit_events set created_at = now() - interval '2 hours'
 where user_id = tests.uid('bia') and action = 'enigma';
insert into private.rate_limit_events (user_id, action, created_at)
select tests.uid('bia'), 'enigma', now() - interval '3 hours' from generate_series(1, 15);
select tests.login('bia');
select throws_ok(
  $$ select public.responder_enigma('Fio de Ariadne') $$, 'PT429', null,
  'vinte tentativas no dia: recusa, mesmo espaçadas e mesmo com a resposta certa'
);
select tests.logout();
select is(tests.tem('bia', 'minotauro'), false, 'ainda sem Minotauro');

-- no dia seguinte, com a resposta certa
update private.rate_limit_events set created_at = now() - interval '25 hours'
 where user_id = tests.uid('bia') and action = 'enigma';
select tests.login('bia');
select is((select count(*) from public.achievements where slug = 'minotauro'), 0::bigint, 'antes de resolver, o Minotauro não aparece no catálogo');
select is(public.responder_enigma('  FIO   de ariadne '), true, 'resposta certa (maiúsculas e espaços não contam): true');
select is((select count(*) from public.achievements where slug = 'minotauro'), 1::bigint, 'depois de resolver, aparece');
select is(
  (select hidden from public.user_achievements where user_id = auth.uid() and achievement_slug = 'minotauro'), false,
  'o Minotauro é secreto, mas não nasce escondido: aparece no perfil de quem resolveu'
);
select is(public.responder_enigma('qualquer coisa'), true, 'quem já resolveu não gasta mais tentativas');
select tests.logout();
select is(tests.tem('bia', 'minotauro'), true, 'a bia tem o Minotauro');

-- trocar a resposta
select private.definir_resposta_do_enigma('novelo');
select tests.login('davi');
select is(public.responder_enigma('Fio de Ariadne'), false, 'depois de trocar o hash, a resposta antiga não vale');
select is(public.responder_enigma('Novelo'), true, 'a nova vale');
select tests.logout();
select is(tests.tem('bia', 'minotauro'), true, 'e quem tinha resolvido antes continua com a conquista');

-- ---------------------------------------------------------------------------
-- Excluir conta leva as conquistas
-- ---------------------------------------------------------------------------
create temp table saiu as select tests.uid('bia') as id;
select tests.login('bia');
select lives_ok($$ select public.excluir_conta('EXCLUIR') $$, 'a bia exclui a conta');
select tests.logout();
select is((select count(*) from public.user_achievements where user_id = (select id from saiu)), 0::bigint, 'as conquistas dela foram apagadas');
select is((select count(*) from private.achievement_dates where user_id = (select id from saiu)), 0::bigint, 'e as datas');

select * from finish();
rollback;
