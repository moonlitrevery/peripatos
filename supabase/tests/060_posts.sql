-- =============================================================================
-- Posts: identidade travada, sem URL, edição e soft delete só do próprio
-- =============================================================================
begin;
\ir _helpers.psql
select plan(26);

select tests.seed_world();

select tests.login('ana');
select lives_ok(
  $$ insert into public.posts (body, gif_id) values ('olá, Peripatos', 'abc123XYZ') $$,
  'usuário ativo posta (com gif_id alfanumérico)'
);
select is(
  (select (author_id = auth.uid()
           and institution_id = (select institution_id from public.profiles where id = auth.uid()))
   from public.posts where body = 'olá, Peripatos'),
  true,
  'author_id e institution_id vêm do banco (auth.uid() e instituição do cadastro)'
);

-- ---------------------------------------------------------------------------
-- O cliente não escolhe autor, instituição nem data
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$ insert into public.posts (author_id, body) values (%L, 'em nome da bia') $$, tests.uid('bia')),
  '42501', null, 'não insere post com author_id de outra pessoa'
);
select throws_ok(
  format($$ insert into public.posts (institution_id, body) values (%L, 'em outra instituição') $$,
         (select id from public.institutions where slug = 'teste-b')),
  '42501', null, 'não insere post com institution_id de outra instituição'
);
select throws_ok(
  $$ insert into public.posts (body, created_at) values ('do futuro', now() + interval '1 year') $$,
  '42501', null, 'não escolhe created_at (furaria o ranking do feed)'
);

-- A trava não é só o GRANT por coluna. Simulando um GRANT largo dado por
-- engano, o WITH CHECK do RLS continua segurando:
select tests.logout();
grant insert, update on public.posts to authenticated;
select tests.login('ana');

select throws_ok(
  format($$ insert into public.posts (author_id, body) values (%L, 'em nome da bia') $$, tests.uid('bia')),
  '42501', 'new row violates row-level security policy for table "posts"',
  'mesmo com GRANT largo, o WITH CHECK recusa author_id alheio'
);
select throws_ok(
  format($$ insert into public.posts (institution_id, body) values (%L, 'x') $$,
         (select id from public.institutions where slug = 'teste-b')),
  null, null,
  'mesmo com GRANT largo, institution_id alheio é recusado (RLS + FK composta)'
);
select throws_ok(
  format($$ update public.posts set author_id = %L where author_id = auth.uid() $$, tests.uid('bia')),
  '42501', null,
  'mesmo com GRANT largo, não dá para transferir um post para outra pessoa'
);

select tests.logout();
revoke insert, update on public.posts from authenticated;
grant insert (body, gif_id), update (body, gif_id) on public.posts to authenticated;
select tests.login('ana');

-- ---------------------------------------------------------------------------
-- gif_id: só ID, nunca URL
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.posts (body, gif_id) values ('gif', 'https://evil.example/x.gif') $$,
  '23514', null, 'gif_id com URL é recusado'
);
select throws_ok(
  $$ insert into public.posts (body, gif_id) values ('gif', '//evil.example/x') $$,
  '23514', null, 'gif_id com URL sem esquema é recusado'
);
select throws_ok(
  $$ insert into public.posts (body, gif_id) values ('gif', 'abc.gif') $$,
  '23514', null, 'gif_id com ponto é recusado'
);
select throws_ok(
  $$ insert into public.posts (body, gif_id) values ('gif', 'abc def') $$,
  '23514', null, 'gif_id com espaço é recusado'
);
select throws_ok(
  $$ insert into public.posts (body, gif_id) values ('gif', E'abc123\nhttps://evil.example') $$,
  '23514', null, 'gif_id com quebra de linha é recusado'
);

-- ---------------------------------------------------------------------------
-- body
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$ insert into public.posts (body) values (%L) $$, repeat('a', 501)),
  '23514', null, 'body acima de 500 caracteres é recusado'
);
select lives_ok(
  format($$ insert into public.posts (body) values (%L) $$, repeat('ã', 500)),
  'body com exatamente 500 caracteres (não bytes) passa'
);
select throws_ok(
  $$ insert into public.posts (body) values ('   ') $$,
  '23514', null, 'post vazio é recusado'
);

-- ---------------------------------------------------------------------------
-- Editar e apagar: só o próprio
-- ---------------------------------------------------------------------------
select tests.login('bia');
update public.posts set body = 'editado pela bia' where body = 'olá, Peripatos';
select tests.logout();
select is(
  (select count(*) from public.posts where body = 'editado pela bia'), 0::bigint,
  'ninguém edita o post de outra pessoa'
);

select tests.login('bia');
select throws_ok(
  format($$ select public.apagar_post(%L) $$, (select id from public.posts where body = 'olá, Peripatos')),
  'PT404', null, 'ninguém apaga o post de outra pessoa'
);
select throws_ok(
  $$ delete from public.posts $$, '42501', null,
  'não existe DELETE físico de post pela API'
);

select tests.login('ana');
update public.posts set body = 'olá, Peripatos (editado)' where body = 'olá, Peripatos';
select is(
  (select edited_at is not null from public.posts where body = 'olá, Peripatos (editado)'), true,
  'a autora edita o próprio post, e a edição fica marcada'
);
select throws_ok(
  $$ update public.posts set deleted_at = null where author_id = auth.uid() $$, '42501', null,
  'deleted_at não é editável direto (só pela RPC)'
);
select throws_ok(
  $$ update public.posts set hidden_at = null where author_id = auth.uid() $$, '42501', null,
  'hidden_at não é editável pelo autor (não dá para desfazer a moderação)'
);

select lives_ok(
  format($$ select public.apagar_post(%L) $$, (select id from public.posts where body = 'olá, Peripatos (editado)')),
  'a autora apaga o próprio post (soft delete)'
);
select is(
  (select count(*) from public.posts where body = 'olá, Peripatos (editado)'), 0::bigint,
  'post apagado some para a própria autora'
);

select tests.login('bia');
select is(
  (select count(*) from public.posts where body = 'olá, Peripatos (editado)'), 0::bigint,
  'post apagado some para os outros'
);

select tests.logout();
select is(
  (select deleted_at is not null from public.posts where body = 'olá, Peripatos (editado)'), true,
  'a linha continua no banco com deleted_at (soft delete)'
);

select * from finish();
rollback;
