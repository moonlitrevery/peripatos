# Peripatos

Rede social para universitários. No beta, só alunos da UNISAGRADO. O objetivo é ajudar pessoas com gostos parecidos a se encontrarem. Não é app de namoro e não é anônimo.

**Esta etapa é só o banco**: schema, RLS, funções, triggers, políticas de storage, seed e testes. Não há interface. DMs ficam para a próxima etapa.

A premissa de segurança é que toda regra vai ser atacada por alguém chamando a API diretamente. Por isso nenhuma regra depende da interface: tudo é imposto no Postgres.

## Como rodar

Requisitos: Docker e [Supabase CLI](https://supabase.com/docs/guides/local-development).

```bash
supabase start      # sobe a stack local e aplica migrations + seed
supabase db reset   # recria o banco do zero
supabase test db    # roda os testes pgTAP
```

| Caminho | Conteúdo |
| --- | --- |
| `supabase/migrations/` | Schema versionado, em 9 arquivos numerados por assunto |
| `supabase/seed.sql` | UNISAGRADO, domínio da allowlist e o vocabulário de tags |
| `supabase/tests/` | Testes pgTAP (`_helpers.psql` são as fixtures) |
| `supabase/config.toml` | OTP, auth hook e schemas expostos |
| `supabase/templates/otp.html` | E-mail com o código de 6 dígitos |

> O seed só roda no ambiente local. Em produção, a instituição, o domínio e as tags precisam ser inseridos uma vez (rodando `seed.sql`, que é idempotente).

## Os dois schemas

| | `public` | `private` |
| --- | --- | --- |
| Exposto pela API | Sim | **Não. Nunca adicionar a `[api].schemas`** |
| Conteúdo | Tudo o que o app lê e escreve | E-mail (só em `auth.users`), RA, data de nascimento, HMACs de banimento, allowlist de domínios, contadores de rate limit e funções auxiliares |
| Acesso de `authenticated` | Só o que tem `GRANT` explícito, filtrado por RLS | Nenhuma tabela. Só `EXECUTE` nas funções que as políticas de RLS usam |
| Acesso de `anon` | Nenhum | Nenhum |

O e-mail e o RA não aparecem em nenhuma tabela, view ou função de `public`.

### Princípios que valem para tudo

- **Default é negar.** Os privilégios padrão do Supabase (que concedem tudo em `public` para `anon` e `authenticated`) são revogados na primeira migration. Função nova nasce sem `EXECUTE` para ninguém; tabela nova nasce sem `GRANT`. Esquecer de liberar quebra a feature, em vez de abrir um buraco.
- **RLS ativo e forçado** em toda tabela de `public` (e também nas de `private`, como segunda camada).
- **`anon` não tem nada**: nem `USAGE` no schema `public`. O app inteiro exige login.
- **O cliente nunca define `user_id`, `author_id` ou `institution_id`.** Vêm de `auth.uid()` e da instituição derivada no cadastro. São três travas: `GRANT` por coluna (o cliente não consegue nem enviar o campo), `WITH CHECK` na política, e FK composta `(id, institution_id)` amarrando a instituição ao dono da linha.
- **`user_metadata` nunca é usado para autorização** (o próprio usuário o edita). Cargos vivem em `staff_roles`.
- **Toda função `security definer`** usa `SET search_path = ''` e nomes qualificados.
- **Toda view** deve usar `WITH (security_invoker = true)`. Hoje não existe nenhuma; o meta-teste barra a primeira que vier sem isso.
- **Escrita privilegiada só por RPC.** Moderação, cargos, banimento e soft delete não têm `GRANT` de escrita: o único caminho são funções que conferem a permissão e gravam a auditoria na mesma transação.
- **Nenhuma RPC recebe "quem sou eu" por parâmetro.** Sempre `auth.uid()`.
- Erros de regra usam `SQLSTATE PTxxx`, que o PostgREST converte no status HTTP `xxx` (ex.: `PT429` vira 429).

## Cadastro e contas

Login por **código de 6 dígitos por e-mail** (OTP), não por link. Os templates de e-mail mostram `{{ .Token }}`.

O e-mail tem o formato `nome.RA@alunos.unisagrado.edu.br`. A validação acontece em duas camadas com a mesma lógica (`private.parse_signup_email`):

1. **Auth hook `before_user_created`** (`private.hook_before_user_created`): recusa antes de o usuário existir.
2. **Triggers em `auth.users`**: recusam o `INSERT` mesmo se o hook estiver desligado ou mal configurado, e criam `private.accounts` (instituição + RA) e o `public.profiles` vazio.

O cadastro é recusado se: o domínio não está em `private.institution_domains` (comparação exata, depois de normalizar em minúsculas); o e-mail não termina em `.RA` numérico (isso também barra `+alias`); ou o e-mail está banido.

**O e-mail não pode ser trocado depois** (trigger em `auth.users`): ele define instituição e RA, e trocar furaria a allowlist e o banimento.

**Banimento por e-mail** fica em `private.banned_emails` como **HMAC-SHA256 com um segredo do Supabase Vault** (`peripatos_ban_hmac_key`), não como hash puro: o formato `nome.RA` é enumerável, então um SHA-256 simples seria revertido por força bruta. O segredo é gerado dentro do banco pela migration e nunca passa pelo git. Sem o segredo a função levanta erro, em vez de deixar passar.

### Onboarding e 18+

`completar_onboarding(username, display_name, data_nascimento, bio)` grava a data de nascimento em `private.accounts` e marca o perfil como completo.

- **Conta ativa** = onboarding completo **e** 18 anos ou mais **e** não banida (`private.is_active`). Só conta ativa posta, segue, denuncia e aparece para os outros.
- Antes disso, a pessoa **só vê e edita o próprio perfil**.
- Menor de 18 conclui o onboarding mas continua inativo. A idade é comparada com o dia de hoje (fuso de São Paulo) a cada verificação, então a conta ativa sozinha no aniversário de 18.
- **A data de nascimento é gravada uma vez.** Se pudesse ser reenviada, bastaria tentar de novo com outra data.
- `display_name` é livre e independente do nome do e-mail (nome social, apelido). `username` é único **por instituição**.
- `conta_status()` diz ao app por que a conta não está ativa, sem devolver a data.

> Limite conhecido: o banco não tem como conferir se a data informada é verdadeira.

## Modelo de dados

### `public`

| Tabela | O que guarda |
| --- | --- |
| `institutions` | Nome e slug |
| `profiles` | `id = auth.uid()`, `institution_id`, `username`, `display_name`, `bio`, `avatar_path`, `avatar_status` (`sem_avatar`, `pendente`, `aprovado`, `recusado`), `onboarding_completo`, `banned_at` |
| `tags` | Vocabulário controlado: `slug`, `name`, `category`, `is_sensitive`. Não existe tag de texto livre |
| `tag_requests` | Pedidos de tag nova feitos por usuários |
| `profile_tags` | Tags comuns do perfil (até 20) |
| `profile_sensitive_tags` | Tags sensíveis, em tabela **separada** (até 5) |
| `follows` | Sem self-follow, único por par |
| `blocks` | Único por par |
| `posts` | `body` (até 500 caracteres), `gif_id` opcional, `created_at`, `edited_at`, `deleted_at` (autor), `hidden_at` (moderação). **Sem imagem** |
| `reports` | Denúncia de post **ou** de perfil: motivo (enum), detalhe, status, quem resolveu e quando |
| `staff_roles` | `moderador` ou `admin` por instituição. É também o "título" exibido no perfil |
| `moderation_actions` | Trilha de auditoria: toda ação de moderação, quem fez e por quê |

`posts.gif_id` guarda **só o ID** do GIF no provedor, com `CHECK (gif_id ~ '^[A-Za-z0-9]{1,64}$')`. Não cabe URL ali, então ninguém injeta imagem externa.

### `private`

| Tabela | O que guarda |
| --- | --- |
| `institution_domains` | Allowlist: domínio de e-mail → instituição |
| `accounts` | `user_id`, `institution_id`, `ra`, `birth_date` |
| `banned_emails` | HMAC do e-mail banido |
| `rate_limit_events` | Eventos contados pelos rate limits |

### Funções auxiliares (`private`, `security definer`, `stable`)

| Função | Significado |
| --- | --- |
| `is_active(uid)` | Onboarding completo, 18+, não banido |
| `is_mutual(a, b)` | `a` segue `b` e `b` segue `a` |
| `is_blocked(a, b)` | Existe bloqueio em qualquer direção |
| `is_staff(uid, institution_id)` / `is_admin(...)` | Tem cargo na instituição e a conta está ativa |
| `my_institution()` | Instituição de quem chama |
| `can_see(leitor, alvo)` | Mesma instituição, alvo ativo, sem bloqueio |

## Regras de acesso

Tudo é escopado por instituição: ninguém lê nada de outra instituição, nem staff.

"Visível" abaixo significa `can_see`: mesma instituição, dono ativo (não banido, onboarding completo, 18+) e nenhum bloqueio em qualquer direção. Quem lê também precisa ser ativo.

| Tabela | Lê | Escreve |
| --- | --- | --- |
| `institutions`, `tags` | Qualquer autenticado | Ninguém pela API |
| `profiles` | O próprio sempre; os visíveis; staff vê todos da instituição | Só o próprio, só `username`, `display_name`, `bio`, e só se não banido |
| `profile_tags` | As próprias; as de perfis visíveis | Só as próprias |
| `profile_sensitive_tags` | As próprias; as de **mutuals** visíveis. **Nem staff lê** | Só as próprias |
| `follows` | Só as relações de que participa | Segue quem é visível; desfaz como seguidor **ou** como seguido |
| `blocks` | Só quem bloqueou (o bloqueado não é avisado) | Bloqueia alguém da mesma instituição |
| `posts` | Não apagados, não ocultos, de autor visível; staff vê todos | Insere só `body` e `gif_id`; edita só o próprio; apaga pela RPC `apagar_post` (soft delete) |
| `reports` | **Só staff da instituição** | Usuário ativo cria; staff resolve por `resolver_denuncia` |
| `tag_requests` | Os próprios; staff da instituição | Usuário ativo cria; admin responde por `resolver_pedido_tag` |
| `staff_roles` | Colegas (é o título do perfil) | Só admin, por `definir_cargo` / `remover_cargo` |
| `moderation_actions` | Staff da instituição | Ninguém direto: só as RPCs de moderação |

Detalhes que importam:

- **Bloquear apaga os follows nos dois sentidos**, por trigger. Bloqueio esconde posts, perfil, tags e avatar nas duas direções, e impede seguir e denunciar.
- **Banido** some de perfis, posts, feed e `pessoas_parecidas`, e passa a ver só o próprio perfil, sem conseguir editar.
- **Tags sensíveis** (orientação sexual, identidade de gênero, religião, posição política) só existem em `profile_sensitive_tags`. Um trigger impede que uma tag sensível vá para `profile_tags` e vice-versa, e que uma tag em uso mude de natureza.
- **Mutual é o consentimento** para ver tags sensíveis. Para revogar sem bloquear, a pessoa remove o seguidor (o `DELETE` em `follows` vale para os dois lados).
- **Quem denunciou** não lê a tabela `reports`. Acompanha as próprias por `minhas_denuncias()`, que não mostra quem resolveu.
- **Staff** oculta post (`ocultar_post`), restaura (`restaurar_post`), bane (`banir_usuario`) e modera avatar (`moderar_avatar`). Toda ação exige motivo e grava em `moderation_actions`. Moderador não bane outro membro da staff; desbanir e mexer em cargos é só admin; ninguém altera o próprio cargo nem bane a si mesmo.
- **Banir** marca o perfil, grava o HMAC do e-mail, remove o cargo, bloqueia o login no Auth e encerra as sessões.
- O **primeiro admin** de cada instituição é criado fora da API (SQL ou dashboard), inserindo em `staff_roles`.

### Dois pontos em que o banco diverge do pedido original

1. **`moderation_actions` não aceita escrita direta nem de admin.** O pedido dizia "escrita só por admin", mas ações de moderadores também precisam ser registradas, e uma trilha de auditoria que o admin edita não audita o admin. Ela é append-only e só as RPCs escrevem.
2. **O vocabulário de tags é global, não por instituição**, então nenhum admin de instituição cria tag. `resolver_pedido_tag` só registra a decisão; a tag entra por migration.

## Afinidade e feed

Todas as RPCs calculam para `auth.uid()` e respeitam as regras acima.

**Peso de cada tag comum** = `ln(usuários ativos da instituição / usuários ativos com a tag)` (IDF). Tag rara pesa mais; tag que todo mundo tem pesa zero.

**Peso de cada tag sensível** = `ln(usuários ativos) / 2`, **fixo**. Este é o terceiro desvio do pedido, e é proposital. Com IDF, o peso de uma tag sensível dependeria de quantas pessoas a marcaram. Como os pesos das tags comuns são calculáveis por qualquer usuário (as tags comuns são legíveis), bastaria olhar a própria afinidade com um mutual para deduzir quantas pessoas da instituição marcaram certa religião ou orientação. O peso fixo equivale ao IDF de uma tag que √N pessoas têm e não depende de nenhuma contagem sensível.

**`afinidade(outro)`** = soma dos pesos das tags em comum ÷ soma dos pesos das tags de quem lê. Tags sensíveis só entram, no numerador e no denominador, quando os dois são mutuals. Para um não-mutual elas simplesmente não existem na conta, então nem o valor nem a ordenação revelam quem tem tag sensível. Devolve `NULL` se a pessoa não é visível.

**`pessoas_parecidas(limite)`**: perfis ativos da instituição, por afinidade decrescente, com a lista de tags em comum (sensíveis só se mutual). Exclui a própria pessoa, bloqueados e banidos. Limite máximo de 50.

**`feed(cursor, limite)`**:

- `score = 0.6 × afinidade com o autor + 0.4 × exp(−horas / 24)`.
- Dois fluxos intercalados: **afinidade** (autores com ao menos uma tag em comum, por score) e **descoberta** (autores sem nenhuma tag em comum, do mais recente ao mais antigo). A descoberta ocupa as posições 4, 8, 12… Se um fluxo acaba, o outro preenche, então o feed não vira bolha nem fica vazio.
- **Janela**: só os 500 posts visíveis mais recentes dos últimos 30 dias são ranqueados.
- **Paginação estável**: o cursor é `<instante em microssegundos>:<offset>`. O instante é fixado na primeira página e vira o "agora" das seguintes, então a recência não se move entre páginas e posts criados depois não entram (aparecem ao recarregar). `next_cursor` é `NULL` na última página. Cursor com mais de 6 horas é recusado.
- Os próprios posts não entram no feed.

O teto de 20 tags comuns por perfil é uma regra de segurança, não de produto: como a afinidade é normalizada pelas tags de quem lê, um perfil com todas as tags teria afinidade máxima com todo mundo e ficaria no topo de `pessoas_parecidas` da instituição inteira.

## Rate limit

Por trigger, então vale chamando a API direto:

| Ação | Limite |
| --- | --- |
| Posts | 15 por hora |
| Follows | 200 por dia |
| Denúncias | 20 por dia |
| Pedidos de tag | 5 por dia |

O erro vem com mensagem clara e `SQLSTATE PT429` (HTTP 429). A contagem é de **eventos** em `private.rate_limit_events`, não de linhas: apagar um post ou deixar de seguir não devolve cota. Um lock por usuário e ação impede que requisições paralelas furem o limite.

## Storage

- Bucket **`avatars` privado**, 2 MB, só JPEG, PNG e WebP.
- Cada usuário só escreve em `<próprio uid>/<arquivo>`.
- **Upload novo deixa `avatar_status = 'pendente'`** (trigger em `storage.objects`). O usuário não consegue escrever `avatar_path` nem `avatar_status`.
- Os outros só leem o arquivo que é o avatar **atual e aprovado** de um perfil visível. O dono lê os próprios arquivos; staff da instituição lê para moderar.

### Pendente para a próxima etapa: re-encode e EXIF

O re-encode da imagem vai ser uma **Edge Function na próxima etapa** e **não está implementado**. Re-encodar descarta os metadados EXIF, incluindo a **localização GPS** que o celular grava na foto.

Até lá, o arquivo guardado é o original, com EXIF. O desenho atual já contém o risco: um upload nunca fica visível sozinho, ele nasce `pendente` e só a staff o vê. Mas `moderar_avatar` só deve ser usado para aprovar em produção depois que o re-encode estiver no caminho, senão a foto aprovada sai com os metadados originais.

## Testes

`supabase test db` roda 13 arquivos pgTAP. Cada um simula usuários diferentes como a API faria: papel `authenticated` e os claims do JWT em `request.jwt.claims`.

| Arquivo | Cobre |
| --- | --- |
| `000_meta` | **Meta-testes**: falha se existir tabela sem RLS forçado, view sem `security_invoker`, função `security definer` sem `search_path` vazio, qualquer privilégio de `anon`, qualquer acesso de `authenticated` a `private`, ou RPC pública fora da lista conhecida |
| `010_cadastro` | Allowlist, formato `nome.RA`, e-mail banido, HMAC com o Vault, troca de e-mail |
| `020_onboarding` | Sem onboarding ou menor de 18 não posta, não segue, não vê ninguém |
| `030_instituicao` | Outra instituição não lê posts, perfis nem tags (nem sendo staff) |
| `040_tags_sensiveis` | Não-mutual não vê tag sensível, nem na afinidade, nem nas tags em comum; mutual vê |
| `050_bloqueio` | Bloqueio esconde nas duas direções e apaga os follows |
| `060_posts` | `author_id` e `institution_id` alheios, `gif_id` com URL, edição e soft delete |
| `070_rate_limit` | O 16º post da hora, o 201º follow, a 21ª denúncia |
| `080_denuncias_moderacao` | Quem lê e resolve denúncias, cargos, auditoria, `user_metadata` ignorado |
| `090_banimento` | Banido some de feed, perfis e `pessoas_parecidas`; e-mail não se recadastra |
| `100_feed` | Fórmula do score, intercalação 3:1, paginação estável |
| `110_storage` | Pasta por uid, avatar pendente invisível, aprovado visível |
| `120_privacidade` | Despeja tudo o que usuário, moderador e admin conseguem ler e procura e-mails, RAs e datas de nascimento |

Ao criar uma RPC nova em `public`, o meta-teste falha até ela entrar na lista de `000_meta.sql`. É proposital: obriga a revisar a função.

## O que precisa de atenção fora do banco

- **Nunca expor `private`** em `[api].schemas` (nem no dashboard, em *API → Exposed schemas*).
- Em produção, replicar pelo dashboard o que está em `config.toml`: auth hook *Before User Created* apontando para `private.hook_before_user_created`, confirmação de e-mail ligada, templates com `{{ .Token }}`, login anônimo e por telefone desligados.
- A chave `service_role` ignora RLS. Só em servidor, nunca no cliente.
- Antes de ligar o Realtime em qualquer tabela, conferir que as políticas de RLS cobrem o caso.
