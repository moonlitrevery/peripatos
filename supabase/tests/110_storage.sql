-- =============================================================================
-- Storage: bucket avatars privado, pasta por uid, aprovação antes de exibir
-- =============================================================================
begin;
\ir _helpers.psql
select plan(19);

select tests.seed_world();

select is(
  (select public from storage.buckets where id = 'avatars'), false,
  'o bucket avatars é privado'
);
select is_empty(
  $$ select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and (roles && array['anon', 'public']::name[]) $$,
  'nenhuma política de storage.objects vale para anon/public'
);

-- ---------------------------------------------------------------------------
-- Escrita: só na própria pasta
-- ---------------------------------------------------------------------------
select tests.login('ana');
select lives_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('avatars', %L) $$, tests.uid('ana') || '/foto.png'),
  'usuária envia avatar para a própria pasta'
);
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('avatars', %L) $$, tests.uid('bia') || '/foto.png'),
  '42501', null, 'não escreve na pasta de outra pessoa'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('avatars', 'solto.png') $$,
  '42501', null, 'não escreve fora de uma pasta de uid'
);
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('avatars', %L) $$,
         tests.uid('ana') || '/../' || tests.uid('bia') || '/foto.png'),
  '42501', null, 'caminho com ../ é recusado'
);

select is(
  (select avatar_status::text || ':' || (avatar_path = auth.uid() || '/foto.png')::text
   from public.profiles where id = auth.uid()),
  'pendente:true',
  'upload novo deixa avatar_status = pendente e aponta avatar_path'
);

-- ---------------------------------------------------------------------------
-- Leitura: pendente só para a dona e a staff
-- ---------------------------------------------------------------------------
select is((select count(*) from storage.objects where bucket_id = 'avatars'), 1::bigint, 'a dona lê o próprio avatar pendente');

select tests.login('bia');
select is((select count(*) from storage.objects where bucket_id = 'avatars'), 0::bigint, 'os outros NÃO leem avatar pendente');
select throws_ok(
  format($$ select public.moderar_avatar(%L, true, 'aprovo eu mesma') $$, tests.uid('ana')),
  'PT403', null, 'usuária comum não aprova avatar'
);

select tests.login('modb');
select is((select count(*) from storage.objects where bucket_id = 'avatars'), 0::bigint, 'staff de outra instituição não lê');

select tests.login('moda');
select is((select count(*) from storage.objects where bucket_id = 'avatars'), 1::bigint, 'staff da instituição lê o pendente para moderar');
select lives_ok(
  format($$ select public.moderar_avatar(%L, true, 'foto adequada') $$, tests.uid('ana')),
  'staff aprova o avatar'
);

-- ---------------------------------------------------------------------------
-- Aprovado: legível pelos colegas, e só por eles
-- ---------------------------------------------------------------------------
select tests.login('bia');
select is((select count(*) from storage.objects where bucket_id = 'avatars'), 1::bigint, 'avatar aprovado é legível pelos colegas');
select tests.login('zeca');
select is((select count(*) from storage.objects where bucket_id = 'avatars'), 0::bigint, 'avatar aprovado NÃO é legível por outra instituição');

-- bloqueio também esconde o avatar
select tests.login('ana');
insert into public.blocks (blocked_id) values (tests.uid('davi'));
select tests.login('davi');
select is((select count(*) from storage.objects where bucket_id = 'avatars'), 0::bigint, 'quem foi bloqueado não lê o avatar');

-- ---------------------------------------------------------------------------
-- Novo upload volta para pendente
-- ---------------------------------------------------------------------------
select tests.login('ana');
insert into storage.objects (bucket_id, name) values ('avatars', auth.uid() || '/foto2.png');
select is(
  (select avatar_status::text from public.profiles where id = auth.uid()), 'pendente',
  'trocar a foto volta o avatar para pendente'
);
select tests.login('bia');
select is(
  (select count(*) from storage.objects where bucket_id = 'avatars'), 0::bigint,
  'nem a foto nova (pendente) nem a antiga (substituída) ficam legíveis'
);

-- apagar o arquivo atual limpa o perfil
-- (a Storage API liga este parâmetro ao apagar; DELETE direto é barrado pelo próprio Storage)
select tests.login('ana');
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'avatars' and name = auth.uid() || '/foto2.png';
select is(
  (select avatar_status::text || ':' || coalesce(avatar_path, 'null') from public.profiles where id = auth.uid()),
  'sem_avatar:null',
  'apagar o avatar atual volta o perfil para sem_avatar'
);

select * from finish();
rollback;
