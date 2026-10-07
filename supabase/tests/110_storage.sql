-- =============================================================================
-- Storage: upload em bucket de entrada; `avatars` só recebe imagem reprocessada
-- =============================================================================
-- O service role (aqui, o superusuário dos testes) faz o papel da Edge
-- Function `processar-avatar`, que é quem grava em `avatars`.
-- =============================================================================
begin;
\ir _helpers.psql
select plan(27);

select tests.seed_world();

select is(
  (select array_agg(id order by id) from storage.buckets where not public and id like 'avatar%'),
  array['avatar-uploads', 'avatars'],
  'os dois buckets de avatar são privados'
);
select is_empty(
  $$ select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and (roles && array['anon', 'public']::name[]) $$,
  'nenhuma política de storage.objects vale para anon/public'
);

-- ---------------------------------------------------------------------------
-- Bucket de entrada: só o dono, só na própria pasta, só conta ativa
-- ---------------------------------------------------------------------------
select tests.login('ana');
select lives_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('avatar-uploads', %L) $$, tests.uid('ana') || '/original.jpg'),
  'usuária ativa envia a foto para a própria pasta do bucket de entrada'
);
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('avatar-uploads', %L) $$, tests.uid('bia') || '/original.jpg'),
  '42501', null, 'não escreve na pasta de outra pessoa'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('avatar-uploads', 'solto.png') $$,
  '42501', null, 'não escreve fora de uma pasta de uid'
);
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('avatar-uploads', %L) $$,
         tests.uid('ana') || '/../' || tests.uid('bia') || '/foto.png'),
  '42501', null, 'caminho com ../ é recusado'
);
select is(
  (select avatar_status::text || ':' || coalesce(avatar_path, 'null') from public.profiles where id = auth.uid()),
  'sem_avatar:null',
  'o upload bruto NÃO mexe no perfil: ainda não entrou na fila de moderação'
);

-- o caminho direto para `avatars` está fechado
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('avatars', %L) $$, tests.uid('ana') || '/direto.webp'),
  '42501', null, 'usuária NÃO grava direto em avatars (só a Edge Function, depois do re-encode)'
);

select tests.login('novo');
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('avatar-uploads', %L) $$, tests.uid('novo') || '/foto.png'),
  '42501', null, 'conta sem onboarding não envia foto'
);

-- ninguém além da dona vê o original (que ainda tem EXIF)
select tests.login('bia');
select is((select count(*) from storage.objects where bucket_id = 'avatar-uploads'), 0::bigint, 'colega não lê o original');
select tests.login_mfa('adma');
select is((select count(*) from storage.objects where bucket_id = 'avatar-uploads'), 0::bigint, 'nem admin lê o original');
select tests.login('ana');
select is((select count(*) from storage.objects where bucket_id = 'avatar-uploads'), 1::bigint, 'a dona lê o próprio original');

-- ---------------------------------------------------------------------------
-- A Edge Function grava a versão reprocessada => pendente
-- ---------------------------------------------------------------------------
select tests.logout();
insert into storage.objects (bucket_id, name) values ('avatars', tests.uid('ana') || '/foto.webp');

select tests.login('ana');
select is(
  (select avatar_status::text || ':' || (avatar_path = auth.uid() || '/foto.webp')::text
   from public.profiles where id = auth.uid()),
  'pendente:true',
  'a versão reprocessada deixa avatar_status = pendente e aponta avatar_path'
);
update storage.objects set metadata = '{"x": 1}' where bucket_id = 'avatars';
select tests.logout();
-- Só o arquivo deste teste: num banco que já rodou o e2e existem outros
-- avatares, gravados pela API de Storage, que sempre têm metadata.
select is(
  (select count(*) from storage.objects
    where bucket_id = 'avatars' and name = tests.uid('ana') || '/foto.webp' and metadata is not null), 0::bigint,
  'a dona não altera o arquivo processado (não há política de UPDATE)'
);
select tests.login('ana');
select is((select count(*) from storage.objects where bucket_id = 'avatars'), 1::bigint, 'a dona lê o próprio avatar pendente');

-- ---------------------------------------------------------------------------
-- Leitura: pendente só para a dona e a staff
-- ---------------------------------------------------------------------------
select tests.login('bia');
select is((select count(*) from storage.objects where bucket_id = 'avatars'), 0::bigint, 'os outros NÃO leem avatar pendente');
select throws_ok(
  format($$ select public.moderar_avatar(%L, true, 'aprovo eu mesma') $$, tests.uid('ana')),
  'PT403', null, 'usuária comum não aprova avatar'
);

select tests.login_mfa('modb');
select is((select count(*) from storage.objects where bucket_id = 'avatars'), 0::bigint, 'staff de outra instituição não lê');

select tests.login_mfa('moda');
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

select tests.login('ana');
insert into public.blocks (blocked_id) values (tests.uid('davi'));
select tests.login('davi');
select is((select count(*) from storage.objects where bucket_id = 'avatars'), 0::bigint, 'quem foi bloqueado não lê o avatar');

-- ---------------------------------------------------------------------------
-- Foto nova volta para pendente
-- ---------------------------------------------------------------------------
select tests.logout();
insert into storage.objects (bucket_id, name) values ('avatars', tests.uid('ana') || '/foto2.webp');
select is(
  (select avatar_status::text from public.profiles where id = tests.uid('ana')), 'pendente',
  'trocar a foto volta o avatar para pendente'
);
select tests.login('bia');
select is(
  (select count(*) from storage.objects where bucket_id = 'avatars'), 0::bigint,
  'nem a foto nova (pendente) nem a antiga (substituída) ficam legíveis'
);

-- a dona pode apagar o próprio avatar; isso limpa o perfil
-- (a Storage API liga este parâmetro ao apagar; DELETE direto é barrado pelo próprio Storage)
select tests.login('ana');
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'avatars' and name = auth.uid() || '/foto2.webp';
select is(
  (select avatar_status::text || ':' || coalesce(avatar_path, 'null') from public.profiles where id = auth.uid()),
  'sem_avatar:null',
  'apagar o avatar atual volta o perfil para sem_avatar'
);
delete from storage.objects where bucket_id = 'avatar-uploads';
select is((select count(*) from storage.objects where name like auth.uid() || '/%' and bucket_id = 'avatar-uploads'), 0::bigint,
  'a dona apaga o próprio original');

select * from finish();
rollback;
