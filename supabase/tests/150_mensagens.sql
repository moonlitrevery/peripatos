-- =============================================================================
-- Mensagens diretas: quem conversa, quem lê, tempo real, denúncia, push
-- =============================================================================
begin;
\ir _helpers.psql
select plan(104);

select tests.seed_world();

create function tests.conv(p_a text, p_b text) returns uuid language sql stable security definer set search_path = '' as
  $$ select c.id from public.conversations c
     where c.user_a = least(tests.uid(p_a), tests.uid(p_b)) and c.user_b = greatest(tests.uid(p_a), tests.uid(p_b)) $$;
create function tests.msg(p_body text) returns uuid language sql stable security definer set search_path = '' as
  -- só mensagens das contas deste teste: num banco que já rodou o e2e existem outras
  $$ select m.id from public.messages m where m.body = p_body and m.sender_id in (select u.id from tests.users u) $$;
-- eventos de tempo real gravados pelo banco para o canal de uma pessoa
create function tests.eventos(p_alias text) returns bigint language sql stable security definer set search_path = '' as
  $$ select count(*) from realtime.messages m where m.topic = 'usuario:' || tests.uid(p_alias)::text $$;
grant execute on function tests.conv(text, text), tests.msg(text), tests.eventos(text) to authenticated;

-- ana <-> bia mútuos; caio segue ana (não mútuo); davi é um terceiro
select tests.follow('ana', 'bia');
select tests.follow('bia', 'ana');
select tests.follow('caio', 'ana');

-- ---------------------------------------------------------------------------
-- Abrir conversa: só entre mútuos ativos da mesma instituição, sem bloqueio
-- ---------------------------------------------------------------------------
select tests.login('ana');
select lives_ok(format($$ select public.abrir_conversa(%L) $$, tests.uid('bia')), 'mútuos abrem conversa');
select is(public.abrir_conversa(tests.uid('bia')), tests.conv('ana', 'bia'), 'abrir de novo devolve a mesma conversa');
select tests.login('bia');
select is(public.abrir_conversa(tests.uid('ana')), tests.conv('ana', 'bia'), 'pelo outro lado é a mesma conversa (uma por par)');

select tests.login('caio');
select throws_ok(format($$ select public.abrir_conversa(%L) $$, tests.uid('ana')), 'PT403', null, 'quem só segue (não mútuo) não abre conversa');
select tests.login('ana');
select throws_ok(format($$ select public.abrir_conversa(%L) $$, tests.uid('caio')), 'PT403', null, 'nem quem é seguido sem seguir de volta');
select throws_ok(format($$ select public.abrir_conversa(%L) $$, tests.uid('davi')), 'PT403', null, 'sem relação nenhuma, não abre');
select throws_ok(format($$ select public.abrir_conversa(%L) $$, tests.uid('ana')), 'PT403', null, 'não há conversa consigo mesma');
select throws_ok(format($$ select public.abrir_conversa(%L) $$, tests.uid('zeca')), 'PT403', null, 'outra instituição não conversa');
select throws_ok(format($$ select public.abrir_conversa(%L) $$, tests.uid('novo')), 'PT403', null, 'conta sem onboarding não conversa');
select throws_ok($$ select public.abrir_conversa(gen_random_uuid()) $$, 'PT403', null, 'usuário inexistente dá a mesma resposta');
select tests.login_anon();
select throws_ok(format($$ select public.abrir_conversa(%L) $$, tests.uid('bia')), '42501', null, 'anon não abre conversa');
select tests.login('ana');
select throws_ok(
  format($$ insert into public.conversations (institution_id, user_a, user_b) values (private.my_institution(), %L, %L) $$,
         least(tests.uid('ana'), tests.uid('davi')), greatest(tests.uid('ana'), tests.uid('davi'))),
  '42501', null, 'ninguém cria conversa direto na tabela'
);
-- sem grupos: a tabela só tem lugar para duas pessoas, e uma conversa por par
select col_is_unique('public', 'conversations', array['user_a', 'user_b'], 'um par de pessoas tem uma conversa só');

-- ---------------------------------------------------------------------------
-- Enviar e ler
-- ---------------------------------------------------------------------------
select lives_ok(
  format($$ insert into public.messages (conversation_id, body) values (%L, 'oi bia') $$, tests.conv('ana', 'bia')),
  'participante envia mensagem'
);
select lives_ok(
  format($$ insert into public.messages (conversation_id, body, gif_id, gif_alt) values (%L, '', 'abc123', 'Gato acenando') $$, tests.conv('ana', 'bia')),
  'mensagem só com GIF (ID e texto alternativo)'
);
select throws_ok(
  format($$ insert into public.messages (conversation_id, body, gif_id) values (%L, 'x', 'https://evil.example/a.gif') $$, tests.conv('ana', 'bia')),
  '23514', null, 'gif_id com URL é recusado'
);
select throws_ok(
  format($$ insert into public.messages (conversation_id, body) values (%L, '   ') $$, tests.conv('ana', 'bia')),
  '23514', null, 'mensagem vazia é recusada'
);
select throws_ok(
  format($$ insert into public.messages (conversation_id, body) values (%L, repeat('a', 1001)) $$, tests.conv('ana', 'bia')),
  '23514', null, 'mais de 1000 caracteres é recusado'
);
select throws_ok(
  format($$ insert into public.messages (conversation_id, body, sender_id) values (%L, 'forjada', %L) $$, tests.conv('ana', 'bia'), tests.uid('bia')),
  '42501', null, 'não dá para enviar em nome de outra pessoa'
);
select throws_ok(
  format($$ insert into public.messages (conversation_id, body, created_at) values (%L, 'no passado', now() - interval '1 day') $$, tests.conv('ana', 'bia')),
  '42501', null, 'nem escolher a data da mensagem'
);
select throws_ok(
  $$ update public.messages set body = 'editada' $$, '42501', null, 'não existe edição de mensagem'
);

select tests.login('bia');
select is((select count(*) from public.messages), 2::bigint, 'a outra participante lê as mensagens');
select is((select nao_lidas from public.minhas_conversas()), 2, 'bia tem 2 não lidas (as duas da ana)');
select is(public.total_nao_lidas(), 2, 'e o total da aba Mensagens é 2');
select is(
  (select previa || '|' || previa_minha::text from public.minhas_conversas()), 'GIF|false',
  'a prévia de uma mensagem só com GIF é "GIF"'
);
select lives_ok(
  format($$ insert into public.messages (conversation_id, body) values (%L, 'oi ana') $$, tests.conv('ana', 'bia')),
  'e responde'
);

-- terceiros da mesma instituição
select tests.login('caio');
select is((select count(*) from public.messages), 0::bigint, 'terceiro não lê nenhuma mensagem');
select is((select count(*) from public.conversations), 0::bigint, 'terceiro não vê a conversa');
select throws_ok(
  format($$ insert into public.messages (conversation_id, body) values (%L, 'intruso') $$, tests.conv('ana', 'bia')),
  '42501', null, 'terceiro não escreve na conversa dos outros'
);
select is(
  (select count(*) from public.messages where conversation_id = tests.conv('ana', 'bia')), 0::bigint,
  'nem sabendo o id da conversa'
);

-- ---------------------------------------------------------------------------
-- Staff NÃO lê conversas
-- ---------------------------------------------------------------------------
select tests.login_mfa('moda');
select is((select count(*) from public.messages), 0::bigint, 'moderadora com segundo fator não lê mensagens');
select is((select count(*) from public.conversations), 0::bigint, 'nem vê que a conversa existe');
select tests.login_mfa('adma');
select is((select count(*) from public.messages), 0::bigint, 'admin com segundo fator não lê mensagens');
select is((select count(*) from public.conversation_reads), 0::bigint, 'nem os marcadores de leitura');
select throws_ok(
  format($$ insert into public.messages (conversation_id, body) values (%L, 'sou admin') $$, tests.conv('ana', 'bia')),
  '42501', null, 'admin não escreve na conversa dos outros'
);
delete from public.messages where id = tests.msg('oi bia');  -- não apaga nada: ela nem enxerga a linha
select tests.logout();
select is(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename in ('messages', 'conversations', 'conversation_reads')
      and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'is_staff|is_admin|staff_roles'),
  0::bigint,
  'nenhuma política das tabelas de mensagens cita cargo de staff'
);
select is((select count(*) from public.messages where id = tests.msg('oi bia')), 1::bigint, 'a mensagem continua lá depois das tentativas da staff');

-- ---------------------------------------------------------------------------
-- Sem confirmação de leitura; não lidas só para a própria pessoa
-- ---------------------------------------------------------------------------
select tests.login('bia');
select is(
  (select count(*) from public.conversation_reads where user_id = tests.uid('ana')), 0::bigint,
  'bia não consegue ler o marcador de leitura da ana (não existe "visto")'
);
select is(public.total_nao_lidas(), 0, 'responder já conta como ter lido: o contador da bia zerou');
select lives_ok(format($$ select public.marcar_conversa_lida(%L) $$, tests.conv('ana', 'bia')), 'marcar como lida funciona');
select throws_ok(
  format($$ insert into public.conversation_reads (conversation_id, user_id) values (%L, %L) $$, tests.conv('ana', 'bia'), tests.uid('ana')),
  '42501', null, 'ninguém escreve marcador de leitura direto na tabela'
);
select tests.login('ana');
select is((select nao_lidas from public.minhas_conversas()), 1, 'ana tem 1 não lida (a resposta da bia)');
select is(
  (select count(*) from public.conversation_reads where user_id = tests.uid('bia')), 0::bigint,
  'ana não tem como saber se a bia leu'
);
select ok(
  (select previa = 'oi ana' and not previa_minha and aberta and username = 'bia' from public.minhas_conversas()),
  'a lista traz a outra pessoa, a prévia da última mensagem e se está aberta'
);
select tests.login('caio');
select throws_ok(format($$ select public.marcar_conversa_lida(%L) $$, tests.conv('ana', 'bia')), 'PT404', null, 'terceiro não marca conversa alheia como lida');
select is((select count(*) from public.minhas_conversas()), 0::bigint, 'e a lista dele está vazia');

-- ---------------------------------------------------------------------------
-- Tempo real: o banco avisa só os dois, sem o conteúdo
-- ---------------------------------------------------------------------------
select tests.logout();
select is(tests.eventos('ana'), 3::bigint, 'ana recebeu um evento por mensagem (as 2 dela e a da bia)');
select is(tests.eventos('bia'), 3::bigint, 'bia também');
select is(tests.eventos('caio') + tests.eventos('davi') + tests.eventos('moda') + tests.eventos('adma'), 0::bigint, 'ninguém mais recebeu evento');
select is(
  (select count(*) from realtime.messages where not private), 0::bigint,
  'todo evento sai em canal privado'
);
select is(
  (select count(*) from realtime.messages where payload::text ~ 'oi bia|oi ana|Gato acenando|abc123'), 0::bigint,
  'o evento não leva o texto nem o GIF da mensagem'
);
select is(
  (select count(*) from realtime.messages where topic !~ '^usuario:[0-9a-f-]{36}$'), 0::bigint,
  'não existe canal por conversa, só por pessoa'
);

-- a política de realtime.messages: cada pessoa entra só no próprio canal
select tests.login('caio');
select set_config('realtime.topic', 'usuario:' || tests.uid('ana')::text, true);
select is((select count(*) from realtime.messages), 0::bigint, 'terceiro não é autorizado no canal da ana');
select set_config('realtime.topic', 'usuario:' || tests.uid('bia')::text, true);
select is((select count(*) from realtime.messages), 0::bigint, 'nem no da bia');
select set_config('realtime.topic', 'conversa:' || tests.conv('ana', 'bia')::text, true);
select is((select count(*) from realtime.messages), 0::bigint, 'nem num canal com o id da conversa');
select tests.login_mfa('adma');
select set_config('realtime.topic', 'usuario:' || tests.uid('ana')::text, true);
select is((select count(*) from realtime.messages), 0::bigint, 'admin não é autorizado no canal de outra pessoa');
select tests.login('ana');
select set_config('realtime.topic', 'usuario:' || tests.uid('ana')::text, true);
select ok((select count(*) from realtime.messages) > 0, 'a própria ana é autorizada no canal dela');
select throws_ok(
  format($$ insert into realtime.messages (topic, extension, event, payload, private)
            values (%L, 'broadcast', 'mensagem', '{"tipo":"nova"}', true) $$, 'usuario:' || tests.uid('bia')::text),
  '42501', null, 'nenhum cliente publica no canal privado de alguém'
);
select tests.logout();
select is(
  (select count(*) from pg_policies
    where schemaname = 'realtime' and tablename = 'messages' and roles && array['anon', 'public']::name[]),
  0::bigint, 'não existe política de realtime.messages para anon'
);
select is(
  (select count(*) from pg_policies
    where schemaname = 'realtime' and tablename = 'messages' and cmd in ('INSERT', 'ALL')),
  0::bigint, 'nem política que deixe um cliente publicar'
);

-- ---------------------------------------------------------------------------
-- Apagar a própria mensagem
-- ---------------------------------------------------------------------------
select tests.login('bia');
delete from public.messages where id = tests.msg('oi bia');
select is((select count(*) from public.messages where id = tests.msg('oi bia')), 1::bigint, 'não dá para apagar a mensagem da outra pessoa');
select tests.login('ana');
delete from public.messages where id = tests.msg('oi bia');
select is((select count(*) from public.messages where id = tests.msg('oi bia')), 0::bigint, 'a autora apaga a própria mensagem');
select tests.logout();
select is((select count(*) from public.messages where id = tests.msg('oi bia')), 0::bigint, 'e ela some de verdade, para os dois');
select is(tests.eventos('ana') + tests.eventos('bia'), 8::bigint, 'apagar avisa os dois (mútuos)');

-- ---------------------------------------------------------------------------
-- Deixar de ser mútuo: legível, mas fechada. Voltar a ser mútuo: reabre
-- ---------------------------------------------------------------------------
delete from public.follows where follower_id = tests.uid('bia') and followee_id = tests.uid('ana');

select tests.login('ana');
select is((select count(*) from public.messages), 2::bigint, 'ex-mútuo continua lendo a conversa');
select is((select aberta from public.minhas_conversas()), false, 'a conversa aparece como fechada');
select throws_ok(
  format($$ insert into public.messages (conversation_id, body) values (%L, 'ainda aí?') $$, tests.conv('ana', 'bia')),
  '42501', null, 'e não aceita mensagem nova'
);
select is(public.abrir_conversa(tests.uid('bia')), tests.conv('ana', 'bia'), 'abrir devolve a conversa antiga, para reler');
select tests.login('bia');
select is((select count(*) from public.messages), 2::bigint, 'o outro lado também continua lendo');
select throws_ok(
  format($$ insert into public.messages (conversation_id, body) values (%L, 'oi de novo') $$, tests.conv('ana', 'bia')),
  '42501', null, 'e também não envia'
);
-- ex-mútuo não recebe evento nenhum, nem o de apagar
delete from public.messages where id = tests.msg('oi ana');
select tests.logout();
select is((select count(*) from public.messages where id = tests.msg('oi ana')), 0::bigint, 'bia ainda apaga a própria mensagem na conversa fechada');
select is(tests.eventos('ana'), 4::bigint, 'ana (ex-mútua) não recebeu o evento de apagar');
select is(tests.eventos('bia'), 5::bigint, 'só quem apagou recebeu');

select tests.follow('bia', 'ana');
select tests.login('ana');
select is((select aberta from public.minhas_conversas()), true, 'voltaram a ser mútuos: a conversa reabre');
select lives_ok(
  format($$ insert into public.messages (conversation_id, body) values (%L, 'que bom') $$, tests.conv('ana', 'bia')),
  'e aceita mensagem de novo'
);

-- ---------------------------------------------------------------------------
-- Denunciar uma mensagem: a moderação recebe uma cópia, e só a cópia
-- ---------------------------------------------------------------------------
select tests.login('bia');
select lives_ok(
  format($$ select public.denunciar_mensagem(%L, 'assedio', 'me incomodou') $$, tests.msg('que bom')),
  'participante denuncia a mensagem que recebeu'
);
select throws_ok(
  format($$ select public.denunciar_mensagem(%L, 'spam') $$, tests.msg('que bom')),
  'PT409', null, 'a mesma mensagem não é denunciada duas vezes pela mesma pessoa'
);
select tests.login('ana');
select throws_ok(
  format($$ select public.denunciar_mensagem(%L, 'spam') $$, tests.msg('que bom')),
  'PT404', null, 'não dá para denunciar a própria mensagem'
);
select tests.login('caio');
select throws_ok(
  format($$ select public.denunciar_mensagem(%L, 'spam') $$, tests.msg('que bom')),
  'PT404', null, 'terceiro não denuncia mensagem de conversa alheia (nem descobre que existe)'
);
select tests.login('bia');
select throws_ok(
  format($$ insert into public.reports (message_id, message_sender_id, message_body, reason)
            values (gen_random_uuid(), %L, 'conteúdo inventado', 'assedio') $$, tests.uid('ana')),
  '42501', null, 'não dá para forjar a cópia escrevendo direto na denúncia'
);

select tests.login_mfa('moda');
select is(
  (select message_body || '|' || (message_sender_id = tests.uid('ana'))::text || '|' || reason::text || '|' || details
   from public.reports where message_id is not null),
  'que bom|true|assedio|me incomodou',
  'a moderação vê a cópia da mensagem, quem enviou, o motivo e o detalhe'
);
select is((select count(*) from public.messages), 0::bigint, 'e continua sem ler a conversa, mesmo com a denúncia aberta');

-- a cópia sobrevive se a autora apagar a mensagem
select tests.login('ana');
delete from public.messages where id = tests.msg('que bom');
select tests.login_mfa('moda');
select is(
  (select message_body from public.reports where message_id is not null), 'que bom',
  'apagar a mensagem depois de denunciada não apaga a cópia'
);

-- ---------------------------------------------------------------------------
-- Bloqueio: a conversa some dos dois lados
-- ---------------------------------------------------------------------------
select tests.login('ana');
insert into public.messages (conversation_id, body) values (tests.conv('ana', 'bia'), 'antes do bloqueio');
select tests.logout();
create temp table antes as select tests.eventos('ana') as ana, tests.eventos('bia') as bia;
grant select on antes to authenticated;

select tests.login('bia');
insert into public.blocks (blocked_id) values (tests.uid('ana'));
select is((select count(*) from public.conversations), 0::bigint, 'quem bloqueou não vê mais a conversa');
select is((select count(*) from public.messages), 0::bigint, 'nem as mensagens');
select is((select count(*) from public.minhas_conversas()), 0::bigint, 'nem na lista');
select tests.login('ana');
select is((select count(*) from public.conversations), 0::bigint, 'quem foi bloqueada também não vê a conversa');
select is((select count(*) from public.messages), 0::bigint, 'nem as mensagens');
select is(public.total_nao_lidas(), 0, 'nem conta como não lida');
select throws_ok(
  format($$ insert into public.messages (conversation_id, body) values (%L, 'me desbloqueia') $$, tests.conv('ana', 'bia')),
  '42501', null, 'bloqueada não envia'
);
select throws_ok(format($$ select public.abrir_conversa(%L) $$, tests.uid('bia')), 'PT403', null, 'nem reabre a conversa');
delete from public.messages where id = tests.msg('antes do bloqueio');
select tests.logout();
select is(
  (select count(*) from public.messages where body = 'antes do bloqueio' and conversation_id = tests.conv('ana', 'bia')), 1::bigint,
  'com a conversa escondida não dá nem para apagar'
);
select is(
  (select (tests.eventos('ana') - ana) + (tests.eventos('bia') - bia) from antes), 0::bigint,
  'depois do bloqueio nenhum evento de tempo real foi gerado para nenhum dos dois'
);

-- ---------------------------------------------------------------------------
-- Rate limit
-- ---------------------------------------------------------------------------
select tests.follow('ana', 'davi');
select tests.follow('davi', 'ana');
select tests.login('davi');
select public.abrir_conversa(tests.uid('ana'));
select lives_ok(
  format($$ insert into public.messages (conversation_id, body) select %L, 'msg ' || n from generate_series(1, 30) n $$, tests.conv('ana', 'davi')),
  '30 mensagens em um minuto passam'
);
select throws_ok(
  format($$ insert into public.messages (conversation_id, body) values (%L, 'a 31ª') $$, tests.conv('ana', 'davi')),
  'PT429', 'Muitas mensagens em pouco tempo. Espere um minuto.', 'a 31ª mensagem no mesmo minuto é recusada'
);

-- ---------------------------------------------------------------------------
-- Notificações push: inscrição só da própria pessoa, só para serviços de push
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.push_subscriptions (endpoint, p256dh, auth)
     values ('https://fcm.googleapis.com/fcm/send/abcdefghijklmnop', repeat('A', 87), repeat('B', 22)) $$,
  'inscrição num serviço de push de navegador é aceita'
);
select throws_ok(
  $$ insert into public.push_subscriptions (endpoint, p256dh, auth)
     values ('https://evil.example/coletor/abcdefghijklmnop', repeat('A', 87), repeat('B', 22)) $$,
  'PT400', null, 'endereço que não é de um serviço de push é recusado'
);
select throws_ok(
  $$ insert into public.push_subscriptions (endpoint, p256dh, auth)
     values ('http://169.254.169.254/latest/meta-data/aaaaaaaa', repeat('A', 87), repeat('B', 22)) $$,
  'PT400', null, 'endereço interno é recusado (a função não vira ponte para a rede interna)'
);
select throws_ok(
  $$ insert into public.push_subscriptions (endpoint, p256dh, auth)
     values ('https://fcm.googleapis.com.evil.example/abcdefghijkl', repeat('A', 87), repeat('B', 22)) $$,
  'PT400', null, 'domínio parecido não engana a lista'
);
select throws_ok(
  format($$ insert into public.push_subscriptions (endpoint, p256dh, auth, user_id)
            values ('https://fcm.googleapis.com/fcm/send/zzzzzzzzzzzzzzzz', repeat('A', 87), repeat('B', 22), %L) $$, tests.uid('ana')),
  '42501', null, 'não dá para inscrever um aparelho em nome de outra pessoa'
);
select tests.login('ana');
select is((select count(*) from public.push_subscriptions), 0::bigint, 'ninguém lê a inscrição dos outros');
select tests.login_mfa('adma');
select is((select count(*) from public.push_subscriptions), 0::bigint, 'nem a staff');

-- ---------------------------------------------------------------------------
-- Excluir a conta apaga as mensagens
-- ---------------------------------------------------------------------------
select tests.login('davi');
select lives_ok($$ select public.excluir_conta('EXCLUIR') $$, 'davi exclui a conta');
select tests.logout();
select is(
  (select count(*) from public.messages where body like 'msg %') + (select count(*) from public.conversations where id = tests.conv('ana', 'davi')),
  0::bigint,
  'as mensagens e a conversa dele foram apagadas'
);

select * from finish();
rollback;
