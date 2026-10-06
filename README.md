# Peripatos

Rede social para universitários. No beta, só alunos da UNISAGRADO. O objetivo é ajudar pessoas com gostos parecidos a se encontrarem. Não é app de namoro e não é anônimo.

O primeiro marco tem o banco (schema, RLS, funções, storage, testes) e a interface: entrar por código, onboarding, feed, Gente, perfil, configurações, moderação, termos e privacidade. DMs ficam para o marco 2.

A premissa de segurança é que toda regra vai ser atacada por alguém chamando a API diretamente. Por isso nenhuma regra depende da interface: tudo é imposto no Postgres.

## Como rodar

Requisitos: Node 22, [pnpm](https://pnpm.io) (`corepack enable`) e Docker, que o Supabase local usa.

```bash
pnpm install
pnpm exec supabase start        # sobe a stack local e aplica migrations + seed
cp .env.example .env.local      # preencha com os valores de `pnpm exec supabase status`
pnpm dev                        # http://127.0.0.1:3000
```

Para entrar, use uma das contas do seed (por exemplo `lia.900003@alunos.unisagrado.edu.br`) ou crie uma com qualquer `nome.RA@alunos.unisagrado.edu.br`. O código de 6 dígitos chega no Mailpit local: <http://127.0.0.1:54324>.

| Variável | Onde vale | Para quê |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Navegador e servidor | URL da API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Navegador e servidor | Chave anon/publishable. É pública: quem protege os dados é o RLS |
| `GIPHY_API_KEY` | Só servidor | Busca de GIFs. Sem ela o seletor avisa que está indisponível e o resto funciona |

**A service role não existe no app Next.js**, nem em `.env.local`, nem em variável `NEXT_PUBLIC_`. Só a Edge Function `processar-avatar` a usa, e a recebe do próprio Supabase.

Se `http://127.0.0.1:54321` não responder depois do `supabase start` (acontece em redes que injetam um *search domain* no DNS, como a do campus), rode `scripts/corrigir-dns-kong.sh`.

| Caminho | Conteúdo |
| --- | --- |
| `src/app/` | Telas (App Router) e server actions em `src/app/acoes/` |
| `src/proxy.ts` | Renova a sessão; manda para `/entrar` quem não está logado e para `/onboarding` quem não completou (no Next 16, `proxy` é o nome do middleware) |
| `src/app/api/giphy/` | Route handler que busca GIFs com a chave do servidor, `rating=pg-13` |
| `public/sw.js` | Service worker |
| `supabase/migrations/` | Schema versionado |
| `supabase/functions/processar-avatar/` | Edge Function que re-encoda as fotos |
| `supabase/seed.sql` | **Só dados de teste locais**: oito contas, follows e posts |
| `supabase/tests/` | Testes pgTAP (`_helpers.psql` são as fixtures) |
| `e2e/` | Testes Playwright |
| `supabase/config.toml` | OTP, auth hook e schemas expostos (**só local**; produção é configurada pelo painel, ver `docs/deploy.md`) |
| `scripts/verificar-deploy.mjs` | Verificação pós-deploy com a chave pública |
| `docs/deploy.md` | Checklist do deploy do beta |
| `supabase/templates/otp.html` | E-mail com o código de 6 dígitos |

> O seed não roda no projeto hospedado. A instituição, o domínio da allowlist e o vocabulário de tags estão na migration `20261006000001_vocabulario.sql`, que é idempotente: produção sobe com as tags.

## A interface

- **Toda leitura e escrita passa pelo RLS com a sessão de quem está usando.** A interface esconder um botão é conforto, não segurança: o banco já decide. Por isso não há `if (ehMutual)` no cliente para tags sensíveis: a consulta é sempre feita e o banco devolve ou não.
- No servidor, o usuário é sempre conferido com `getUser()`, que valida o token no Auth. `getSession()` só leria o cookie.
- Quatro abas: Início, Gente, Mensagens e Você. Mensagens é do marco 2 e já ocupa o lugar dela, desabilitada. Configurações e Moderação ficam dentro de Você.
- O **âmbar é exclusivo do que duas pessoas têm em comum**. Nos cards de Gente, as tags em comum vêm primeiro e em âmbar, e são exatamente as contadas na frase "Vocês têm N gostos em comum". O anel de foco usa a cor da tinta (quase preto no tema claro, branco no escuro).
- `/termos` e `/privacidade` são **rascunhos**, marcados como tal na própria página. Precisam de revisão antes do lançamento, e o e-mail de contato é um placeholder.

### PWA

Manifest, ícones, página `/offline` e um service worker escrito à mão (`public/sw.js`).

O service worker **não guarda nada que dependa de quem está logado**: num celular emprestado ou num computador do laboratório, isso vazaria o feed de outra pessoa. O cache tem uma lista fechada de arquivos públicos (a página offline e os ícones) e não existe `cache.put()` fora da instalação. Páginas vêm sempre da rede; chamadas ao Supabase, server actions, `/api`, avatares e GIFs nem passam por ele. Foi escrito sem biblioteca de propósito: os padrões de cache em tempo de execução das bibliotecas de PWA guardam respostas de navegação, que é o que não pode acontecer aqui.

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
- **Menor de 18 não fica guardado.** Se a data informada é de menor, a conta inteira é apagada dentro da própria chamada (usuário do Auth, e-mail, RA, a data) e a função devolve `menor_de_idade: true`. A pessoa é levada para `/maiores-de-18`, página pública que mostra "O Peripatos é para maiores de 18. Volte quando fizer aniversário."
- Consequência assumida: como nada fica guardado, a mesma pessoa pode se cadastrar de novo com outra data. O banco nunca teve como conferir a data; o que mudou é que não guardamos dados de quem se declarou menor. `private.is_active` continua conferindo a idade, como segunda camada.
- **A data de nascimento é gravada uma vez.**
- `display_name` é livre e independente do nome do e-mail (nome social, apelido). `username` é único **por instituição**.
- `conta_status()` diz ao app por que a conta não está ativa, sem devolver a data.

### Excluir conta (LGPD)

`excluir_conta('EXCLUIR')` apaga o usuário do Auth, e as FKs em cascata levam junto perfil, conta privada (RA e data de nascimento), posts, tags comuns e sensíveis, follows, blocks, denúncias feitas e recebidas, pedidos de tag, cargo e sessões. Só se exclui a própria conta: não há parâmetro de usuário.

Os arquivos de avatar são apagados **antes**, pela Storage API e com a sessão da própria pessoa (apagar só a linha de `storage.objects` deixaria o arquivo órfão). A função se recusa a rodar enquanto existir arquivo em `avatars` ou `avatar-uploads`; a interface faz os dois passos em sequência.

**O que fica, e por quê:**

| Fica | Motivo |
| --- | --- |
| `private.banned_emails` (HMAC do e-mail), se a pessoa foi banida | Sem isso, excluir a conta desfaria o próprio banimento |
| `public.moderation_actions`, sem apontar para a conta (`actor_id` e `target_user_id` viram `NULL`), com o HMAC do e-mail em `metadata` | A trilha de auditoria continua, e a staff reconhece reincidência se o mesmo e-mail voltar. O HMAC não é reversível sem o segredo do Vault |

Nada mais é mantido: nem e-mail, nem RA, nem conteúdo.

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

## Storage e avatar

Quem não quer foto escolhe um dos 12 avatares prontos (`profiles.avatar_preset`), que são desenhados pelo app e não passam por storage nem moderação.

Foto enviada passa por dois buckets privados:

| Bucket | Quem escreve | Quem lê |
| --- | --- | --- |
| `avatar-uploads` (entrada, 2 MB, JPEG/PNG/WebP) | Só o dono, em `<próprio uid>/<arquivo>`, e só com conta ativa | Só o dono. Nem a staff. Nada daqui é exibido |
| `avatars` (final, só WebP) | **Só a Edge Function** `processar-avatar` | O dono; a staff da instituição, para moderar; os outros, só o arquivo que é o avatar **atual e aprovado** de um perfil visível |

O caminho de uma foto:

1. O navegador reduz para 512 px e converte para WebP (`src/lib/foto.ts`). Isso é economia de banda, não segurança.
2. O arquivo vai para `avatar-uploads` e o app chama `processar-avatar`.
3. A função confere que o arquivo é de quem chamou, **decodifica e codifica de novo em WebP**, aplicando antes a rotação do EXIF aos pixels e removendo todos os metadados (EXIF, incluindo a **localização GPS**, XMP, IPTC, perfis embutidos). Grava o resultado em `avatars` e apaga o original e as fotos anteriores. Se qualquer passo falhar, o original é apagado do mesmo jeito.
4. O arquivo novo em `avatars` deixa `avatar_status = 'pendente'` (trigger em `storage.objects`). Até a staff aprovar em `/moderacao`, os outros veem o avatar pronto.

Como `authenticated` não tem `INSERT` nem `UPDATE` em `avatars`, todo arquivo que chega à moderação e depois aos outros usuários passou pelo re-encode. Não existe caminho para um original com EXIF ser exibido. O usuário também não consegue escrever `avatar_path` nem `avatar_status`.

## Testes

```bash
pnpm typecheck && pnpm lint
pnpm test:db      # pgTAP (precisa do supabase start)
pnpm test:exif    # re-encode do avatar, em Deno (não precisa de Docker)
pnpm exec playwright install chromium   # uma vez
pnpm test:e2e     # Playwright (precisa do supabase start)
```

No GitHub, o workflow `.github/workflows/ci.yml` roda tudo isso a cada push, num runner Ubuntu com o Supabase local, mais o `verificar:deploy` contra a stack local.

### Banco (pgTAP)

`supabase test db` roda 14 arquivos pgTAP. Cada um simula usuários diferentes como a API faria: papel `authenticated` e os claims do JWT em `request.jwt.claims`.

| Arquivo | Cobre |
| --- | --- |
| `000_meta` | **Meta-testes**: falha se existir tabela sem RLS forçado, view sem `security_invoker`, função `security definer` sem `search_path` vazio, qualquer privilégio de `anon`, qualquer acesso de `authenticated` a `private`, ou RPC pública fora da lista conhecida |
| `010_cadastro` | Allowlist, formato `nome.RA`, e-mail banido, HMAC com o Vault, troca de e-mail |
| `020_onboarding` | Sem onboarding não posta, não segue, não vê ninguém; menor de 18 tem a conta apagada |
| `030_instituicao` | Outra instituição não lê posts, perfis nem tags (nem sendo staff) |
| `040_tags_sensiveis` | Não-mutual não vê tag sensível, nem na afinidade, nem nas tags em comum; mutual vê |
| `050_bloqueio` | Bloqueio esconde nas duas direções e apaga os follows; `meus_bloqueios` |
| `060_posts` | `author_id` e `institution_id` alheios, `gif_id` com URL, edição e soft delete |
| `070_rate_limit` | O 16º post da hora, o 201º follow, a 21ª denúncia |
| `080_denuncias_moderacao` | Quem lê e resolve denúncias, cargos, auditoria, `user_metadata` ignorado |
| `090_banimento` | Banido some de feed, perfis e `pessoas_parecidas`; e-mail não se recadastra |
| `100_feed` | Fórmula do score, intercalação 3:1, paginação estável |
| `110_storage` | Pasta por uid, bucket de entrada, ninguém escreve em `avatars`, pendente invisível, aprovado visível |
| `120_privacidade` | Despeja tudo o que usuário, moderador e admin conseguem ler e procura e-mails, RAs e datas de nascimento |
| `130_excluir_conta` | A exclusão apaga tudo da pessoa e mantém só o HMAC de banimento e a auditoria |

Ao criar uma RPC nova em `public`, o meta-teste falha até ela entrar na lista de `000_meta.sql`. É proposital: obriga a revisar a função.

### EXIF (`pnpm test:exif`)

`supabase/functions/processar-avatar/reencodar.test.ts` roda o mesmo código de re-encode da Edge Function sobre `e2e/fixtures/foto-com-gps.jpg`, um JPEG com fabricante, orientação e localização GPS no EXIF. Confere primeiro que a fixture tem mesmo esses dados, e depois que o WebP final não tem bloco `EXIF`, `XMP` nem `ICCP`, que um leitor de EXIF não encontra nada e que os bytes do original não estão lá. Sem o `strip()` da função, o teste falha.

### Ponta a ponta (Playwright)

Roda num celular (Pixel 7) contra o Supabase local, com um build de produção do app. **Antes de cada execução o `global-setup` roda `supabase db reset`**, para partir sempre das contas do seed (`E2E_SEM_RESET=1` pula isso). O código de login é lido pela API do Mailpit.

| Arquivo | Cobre |
| --- | --- |
| `01-entrar` | E-mail fora da lista e sem RA recusados com a mensagem do banco; código errado; contagem do reenvio; login com o código do e-mail |
| `02-onboarding` | Menor de idade barrado, levado a `/maiores-de-18` e apagado do Auth; adulto com gostos e tag sensível (seção fechada por padrão) |
| `03-feed` | Postar com GIF: grava só o ID e exibe. A rota `/api/giphy` é simulada no navegador, então não precisa de chave; sem login ela responde 401 |
| `04-seguir-e-tag-sensivel` | Em Gente, a contagem bate com os chips em âmbar; seguir de volta vira mútuo, e só então a tag sensível aparece |
| `05-bloqueio` | Perfil e posts somem do feed, de Gente e do endereço direto, nos dois sentidos |
| `06-moderacao` | Usuário comum é redirecionado de `/moderacao`; moderadora entra |
| `07-excluir-conta` | A conta some do Auth, e o perfil e os posts somem para os outros |
| `08-avatar-sem-exif` | Falando direto com a API (sem o redimensionamento do navegador): a função tira o EXIF, apaga o original e deixa a foto pendente |
| `09-service-worker` | Com o service worker ativo e controlando a página, depois de logar e navegar: a Cache Storage tem só a página offline e os ícones, nada do Supabase nem de rota autenticada; sem rede, entrega a página offline e não uma cópia do Início |

Os testes usam a service role local para conferir, por fora do app, que uma conta ou um arquivo deixou de existir. Ela é lida de `supabase status` na hora e não fica em nenhum arquivo.

## Deploy (ainda não foi feito)

O passo a passo do beta está em [docs/deploy.md](docs/deploy.md): o que é comando e o que é painel, tudo o que vive no `config.toml` e não é aplicado sozinho no projeto hospedado, o segredo do HMAC no Vault, a Edge Function, as variáveis do Vercel e como evitar que o projeto pause no plano grátis.

Depois de qualquer deploy:

```bash
pnpm verificar:deploy https://<ref>.supabase.co <chave publishable>
```

O script confirma, só com a chave pública, que a anon não lê nem escreve em nenhuma tabela, que o schema `private` não está exposto e que os buckets não são públicos. Ele recusa rodar com a service role.

## O que precisa de atenção fora do banco

- **Nunca expor `private`** em `[api].schemas` (nem no dashboard, em *API → Exposed schemas*).
- Em produção, replicar pelo dashboard o que está em `config.toml`: auth hook *Before User Created* apontando para `private.hook_before_user_created`, confirmação de e-mail ligada, templates com `{{ .Token }}`, login anônimo e por telefone desligados.
- A chave `service_role` ignora RLS. Só em servidor, nunca no cliente.
- Antes de ligar o Realtime em qualquer tabela, conferir que as políticas de RLS cobrem o caso.
