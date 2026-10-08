# Peripatos

Rede social para universitários. No beta, só alunos da UNISAGRADO. O objetivo é ajudar pessoas com gostos parecidos a se encontrarem. Não é app de namoro e não é anônimo.

O primeiro marco tem o banco (schema, RLS, funções, storage, testes) e a interface: entrar por código, onboarding, feed, Gente, perfil, configurações, moderação, termos e privacidade. O segundo marco acrescenta as mensagens diretas, com tempo real e notificações push.

A premissa de segurança é que toda regra vai ser atacada por alguém chamando a API diretamente. Por isso nenhuma regra depende da interface: tudo é imposto no Postgres.

## Como rodar

Requisitos: Node 22, [pnpm](https://pnpm.io) (`corepack enable`) e Docker, que o Supabase local usa.

```bash
pnpm install
node scripts/gerar-vapid.mjs    # chaves locais das notificações push (antes do supabase start)
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
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Navegador e servidor | Chave **pública** das notificações push. A privada fica só em `supabase/functions/.env` (local) ou como segredo da função (produção). `node scripts/gerar-vapid.mjs` gera o par local |

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
| `docs/auditoria.md` | Auditoria legal, de aparência e de segurança, item por item |
| `docs/incidentes.md` | O que fazer se um segredo vazar, um deploy ou uma migration der errado, e o que a LGPD exige |
| `docs/backup.md` | Backup criptografado e restauração |
| `scripts/backup-criptografado.sh`, `scripts/restaurar-backup.sh` | Backup dos dados cifrado em pipe (nunca em claro no disco) e a volta |
| `src/lib/validacao.ts` | Validação (zod) de tudo o que chega por server action ou route handler |
| `src/lib/csp.ts`, `src/proxy.ts` | Content-Security-Policy com nonce por resposta |
| `supabase/templates/otp.html` | E-mail com o código de 6 dígitos |

> O seed não roda no projeto hospedado. A instituição, o domínio da allowlist e o vocabulário de tags estão na migration `20261006000001_vocabulario.sql`, que é idempotente: produção sobe com as tags.

## A interface

- **Toda leitura e escrita passa pelo RLS com a sessão de quem está usando.** A interface esconder um botão é conforto, não segurança: o banco já decide. Por isso não há `if (ehMutual)` no cliente para tags sensíveis: a consulta é sempre feita e o banco devolve ou não.
- No servidor, o usuário é sempre conferido com `getUser()`, que valida o token no Auth. `getSession()` só leria o cookie.
- Quatro abas: Início, Gente, Mensagens e Você. Mensagens mostra o contador de não lidas de quem está olhando. Configurações e Moderação ficam dentro de Você.
- O **âmbar é exclusivo do que duas pessoas têm em comum**. Nos cards de Gente, as tags em comum vêm primeiro e em âmbar, e são exatamente as contadas na frase "Vocês têm N gostos em comum". O anel de foco usa a cor da tinta (quase preto no tema claro, branco no escuro).
- `/termos` e `/privacidade` são **rascunhos**, marcados como tal na própria página. Precisam de revisão antes do lançamento, e o e-mail de contato é um placeholder.

### Mensagens diretas (marco 2)

- **Quem conversa:** só mútuos ativos da mesma instituição, sem bloqueio. Uma conversa por par; não há grupos (a tabela só tem lugar para duas pessoas).
- **Deixou de ser mútuo:** a conversa continua legível para os dois e fecha para mensagens novas, com aviso na tela. Voltou a ser mútuo, reabre. **Bloqueio** esconde a conversa dos dois lados.
- **Mensagem:** até 1000 caracteres e GIF opcional (só o ID, como no post). Sem edição. Apagar a própria mensagem apaga de verdade, para os dois. Só `http://` e `https://` viram link (`TextoComLinks.tsx`).
- **Sem confirmação de leitura e sem "digitando".** É decisão de produto: o público é de gente com dificuldade social, e "visto e não respondeu" afasta. O marcador de leitura de cada pessoa (`conversation_reads`) só é legível por ela, e serve só para o contador de não lidas na aba Mensagens.
- **A staff não lê conversas.** Nenhuma política das tabelas de mensagens cita cargo (há um teste que falha se alguma citar). Denunciar uma mensagem grava uma **cópia** dela na denúncia, feita pelo banco, e é só essa cópia que a moderação vê.
- **Limites:** 30 mensagens por minuto e 1000 por dia por pessoa, no mesmo mecanismo dos posts.
- **Excluir a conta** apaga só as mensagens de quem saiu. As da outra pessoa ficam, numa conversa que passa a aparecer para ela como sendo com uma "Conta excluída", fechada. Se as duas saírem, a conversa some. A cópia de uma mensagem numa denúncia continua como está.

**Tempo real.** Cada pessoa assina **um canal privado, o dela** (`usuario:<uid>`), e a única política em `realtime.messages` só autoriza o próprio canal. Não existe canal por conversa: a autorização do Realtime é conferida quando o cliente entra, então quem já estivesse dentro de um canal de conversa continuaria recebendo depois de um bloqueio. Aqui é o banco que escolhe os destinatários a cada evento, com o estado daquele instante, e **o evento leva só identificadores, nunca o texto**: quem recebe busca a mensagem pela API, onde o RLS decide de novo.

**Notificações push.** A inscrição do aparelho fica em `push_subscriptions` (só a própria pessoa lê). **Quem pede a notificação é o banco**: um trigger em `messages` chama a Edge Function `notificar-mensagem` a cada mensagem gravada (pela extensão `pg_net`, depois do commit), venha ela do app ou de uma chamada direta à API. O pedido leva só o id da mensagem e um segredo que prova que veio do banco; a função não aceita chamada de usuário. O que entra na notificação sai de `preparar_notificacao`, que só a função executa e que **não devolve o texto**: "Nova mensagem de <nome>" e mais nada. O banco só aceita endereço de serviço de push de navegador (`private.push_hosts`), para a função não virar ponte para outros endereços. No iPhone só funciona com o app instalado na tela de início.

### Notificações e conquistas (marco 3)

- **Aba de notificações** (`/notificacoes`), só legível pelo dono, com contador de não lidas em tempo real. Os eventos (novo seguidor, viraram mútuos, avatar aprovado ou recusado, denúncia analisada, termos atualizados, conquista nova) são todos gerados por trigger no banco; nenhum papel da API escreve na tabela. Repetidos são agrupados, bloqueio e exclusão de conta apagam, e o job diário remove o que passou de 60 dias.
- **Push opcional por tipo** em Configurações, pela mesma Edge Function das mensagens. O aviso não leva o nome de ninguém.
- **Conquistas** (`/conquistas`, `/conquistas/<slug>` e no perfil): 14 no catálogo, concedidas só pelo banco, permanentes, com emoji descrito para leitor de tela e cor própria. A pessoa esconde do perfil as que quiser.
- **Cargos**: Administração com brilho, Moderação sem, os dois sempre com o nome escrito.
- Regras de cada conquista, o que configurar em produção (fim do beta, resposta do enigma) e as decisões tomadas: [`docs/conquistas.md`](docs/conquistas.md).

### Consentimentos

- **Termos e Política.** No onboarding a pessoa marca o aceite, e o banco grava a versão aceita e a data (`private.accounts.termos_versao`, `termos_aceitos_em`). A versão vigente mora no banco (a linha mais recente de `private.termos_versoes`, lida por `private.termos_versao_atual()`) e em `src/lib/legal.ts`; o banco só aceita o aceite da versão vigente.
- **Novo aceite.** Quando a versão vigente é diferente da última aceita, o proxy leva a pessoa para `/aceite`, que mostra o que mudou (`MUDANCAS_DA_VERSAO` em `src/lib/legal.ts`). Aceitar libera o app; recusar oferece sair ou excluir a conta. **No banco**, sem o aceite da versão vigente a pessoa não posta nem manda mensagem (políticas restritivas em `posts` e `messages`); ler continua funcionando.
- **Tags sensíveis (LGPD, art. 11).** Consentimento específico, pedido à parte, com a finalidade escrita. Sem consentimento registrado **o banco recusa** gravar tag sensível, por qualquer caminho. Em Configurações a pessoa revoga: as tags e o registro do consentimento são apagados na mesma transação.

### Segurança da interface

- **Validação no servidor.** Toda server action e o route handler validam a forma do que chega com zod (`src/lib/validacao.ts`) antes de falar com o banco. As constraints, o RLS e as RPCs continuam decidindo.
- **Cabeçalhos.** CSP com nonce por resposta (scripts só do app; conexões só para o app e o Supabase; imagens só do app, do Supabase e do Giphy), `frame-ancestors 'none'`, HSTS de dois anos, `Referrer-Policy`, `nosniff`. Por causa do nonce todas as páginas são renderizadas a cada requisição.
- **Verificação em duas etapas da staff.** Moderar exige sessão `aal2` (código do e-mail + TOTP), e quem exige é o banco: sem o segundo fator as RPCs recusam e as filas vêm vazias, pela interface ou pela API.
- **Busca de GIF com limite por pessoa** (30 por minuto, 400 por dia), contado no banco, para ninguém esgotar a cota da chave.
- **Nenhum filtro do PostgREST é montado com texto** (`.or()`, `.filter()`), e não há `dangerouslySetInnerHTML` nem link vindo de dado de usuário. Um teste varre o código e falha se aparecer.
- **Logs.** O app não escreve log com código de acesso, e-mail, RA ou token (não há `console.*` em `src/` nem na Edge Function). Os logs do próprio Supabase Auth registram o e-mail de quem pede código; isso é do fornecedor e está na política de privacidade.

### Sessões

| | Valor | Onde |
| --- | --- | --- |
| Token de acesso (JWT) | vence em **1 hora** | `[auth] jwt_expiry = 3600` |
| Refresh token | uso único, com rotação; reuso depois de 10 s encerra a sessão | `enable_refresh_token_rotation`, `refresh_token_reuse_interval` |
| Sessão | **não vence sozinha**: renova enquanto o app for usado | padrão do Supabase |
| Cookie da sessão | `SameSite=Lax`, validade de 400 dias, **não é HttpOnly** | `@supabase/ssr` |
| Segundo fator da staff | vale só para aquele login | claim `aal` do JWT |

- **Sair** encerra a sessão do aparelho. **Sair de todos os dispositivos** (Configurações) revoga todas as sessões da conta; nos outros aparelhos a próxima página já pede login, porque o servidor confere a sessão com o Auth a cada requisição (`getUser()`).
- Limitar a duração total da sessão (*time-box*) e encerrar por inatividade existem no Supabase, mas **só no plano Pro**. Estão comentados em `supabase/config.toml` (`[auth.sessions]`).
- O cookie não é HttpOnly porque o cliente do navegador precisa do token para falar com o Storage (envio de foto). O que protege o token de um script injetado é a CSP: nenhum script de fora roda.

### PWA

Manifest, ícones, página `/offline` e um service worker escrito à mão (`public/sw.js`).

O service worker **não guarda nada que dependa de quem está logado**: num celular emprestado ou num computador do laboratório, isso vazaria o feed de outra pessoa. O cache tem uma lista fechada de arquivos públicos (a página offline e os ícones) e não existe `cache.put()` fora da instalação. Páginas vêm sempre da rede; chamadas ao Supabase, server actions, `/api`, avatares e GIFs nem passam por ele. Foi escrito sem biblioteca de propósito: os padrões de cache em tempo de execução das bibliotecas de PWA guardam respostas de navegação, que é o que não pode acontecer aqui.

## Os dois schemas

| | `public` | `private` |
| --- | --- | --- |
| Exposto pela API | Sim | **Não. Nunca adicionar a `[api].schemas`** |
| Conteúdo | Tudo o que o app lê e escreve | E-mail (só em `auth.users`), HMAC do RA, registro de maioridade verificada, aceite dos termos, consentimento das tags sensíveis, HMACs de banimento, allowlist de domínios, contadores de rate limit e funções auxiliares |
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
2. **Triggers em `auth.users`**: recusam o `INSERT` mesmo se o hook estiver desligado ou mal configurado, e criam `private.accounts` (instituição + HMAC do RA) e o `public.profiles` vazio. Outro nome com o mesmo RA na mesma instituição é recusado.

O cadastro é recusado se: o domínio não está em `private.institution_domains` (comparação exata, depois de normalizar em minúsculas); o e-mail não termina em `.RA` numérico (isso também barra `+alias`); ou o e-mail está banido.

**O e-mail não pode ser trocado depois** (trigger em `auth.users`): ele define instituição e RA, e trocar furaria a allowlist e o banimento.

**Banimento por e-mail** fica em `private.banned_emails` como **HMAC-SHA256 com um segredo do Supabase Vault** (`peripatos_ban_hmac_key`), não como hash puro: o formato `nome.RA` é enumerável, então um SHA-256 simples seria revertido por força bruta. O segredo é gerado dentro do banco pela migration e nunca passa pelo git. Sem o segredo a função levanta erro, em vez de deixar passar.

### Onboarding e 18+

`completar_onboarding(username, display_name, data_nascimento, bio, termos_versao)` confere a data, grava em `private.accounts` **só o instante em que a maioridade foi verificada** e o aceite dos termos (versão e data), e marca o perfil como completo.

- **Conta ativa** = onboarding completo **e** maioridade verificada **e** não banida (`private.is_active`). Só conta ativa posta, segue, denuncia e aparece para os outros.
- Antes disso, a pessoa **só vê e edita o próprio perfil**.
- **Menor de 18 não fica guardado.** Se a data informada é de menor, a conta inteira é apagada dentro da própria chamada (usuário do Auth, e-mail, RA, a data) e a função devolve `menor_de_idade: true`. A pessoa é levada para `/maiores-de-18`, página pública que mostra "O Peripatos é para maiores de 18. Volte quando fizer aniversário."
- Consequência assumida: como nada fica guardado, a mesma pessoa pode se cadastrar de novo com outra data. O banco nunca teve como conferir a data; o que mudou é que não guardamos dados de quem se declarou menor.
- **A data de nascimento não é guardada** (minimização, migration 13). Ela só servia para responder "tem 18 ou mais?"; como quem informa data de menor é apagado na hora, toda conta que conclui o onboarding já passou pela verificação, e idade só aumenta. Fica `maioridade_verificada_em`.
- **O RA não é guardado em claro.** Fica um HMAC (com a mesma chave do Vault do banimento), que basta para impedir duas contas com o mesmo RA. O RA continua existindo num só lugar: dentro do e-mail de login, em `auth.users`.
- `display_name` é livre e independente do nome do e-mail (nome social, apelido). `username` é único **por instituição**.
- `conta_status()` diz ao app por que a conta não está ativa, sem devolver a data.

### Excluir conta (LGPD)

`excluir_conta('EXCLUIR')` apaga o usuário do Auth, e as FKs em cascata levam junto perfil, conta privada, posts, tags comuns e sensíveis, follows, blocks, denúncias feitas e recebidas, pedidos de tag, cargo e sessões. Só se exclui a própria conta: não há parâmetro de usuário.

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
| `accounts` | `user_id`, `institution_id`, `ra_hmac`, `maioridade_verificada_em`, `termos_versao`, `termos_aceitos_em`, `sensivel_consentido_em` |
| `banned_emails` | HMAC do e-mail banido |
| `rate_limit_events` | Eventos contados pelos rate limits |

### Funções auxiliares (`private`, `security definer`, `stable`)

| Função | Significado |
| --- | --- |
| `is_active(uid)` | Onboarding completo, maioridade verificada, não banido |
| `is_mutual(a, b)` | `a` segue `b` e `b` segue `a` |
| `is_blocked(a, b)` | Existe bloqueio em qualquer direção |
| `is_staff(uid, institution_id)` / `is_admin(...)` | Tem cargo na instituição, a conta está ativa e, quando `uid` é quem está chamando, **a sessão é `aal2`** (segundo fator confirmado) |
| `sessao_aal2()` | O claim `aal` do JWT é `aal2` |
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
pnpm audit --prod # vulnerabilidades nas dependências de produção
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
| `120_privacidade` | Despeja tudo o que usuário, moderador e admin conseguem ler e procura e-mails, domínios, RAs e colunas da conta privada |
| `130_excluir_conta` | A exclusão apaga tudo da pessoa e mantém só o HMAC de banimento e a auditoria |
| `160_mensagens_ajustes` | O banco pede a notificação a cada mensagem, só com o id; `preparar_notificacao` só para a service role, sem o texto, uma vez por mensagem e só com a conversa aberta. Sem o aceite da versão vigente não posta nem manda mensagem, e só se aceita a versão vigente. Excluir a conta apaga só as mensagens de quem saiu; a cópia na denúncia fica; quando os dois saem a conversa some |
| `170_notificacoes` | Cada evento de notificação, só o dono lê, ninguém escreve pela API, agrupamento, contador, bloqueio, banido, push por tipo, 60 dias, exclusão de conta |
| `180_conquistas` | Cada conquista; ninguém se dá conquista pela API; a Coruja não aparece para os outros por padrão; a Koinonia não vaza os outros dois; o Minotauro não aceita força bruta; Héracles só por admin, registrado |
| `150_mensagens` | Quem abre conversa; envio, leitura e limites; terceiros e **staff não leem nem escrevem**; sem "visto" (marcador de leitura invisível para o outro); eventos de tempo real só para os dois, em canal privado e sem o texto; apagar; fechar ao deixar de ser mútuo e reabrir; denúncia com cópia que não pode ser forjada; bloqueio esconde tudo; rate limit; inscrição de push só em serviço conhecido; excluir conta apaga as mensagens |
| `140_auditoria` | Staff sem `aal2` não age nem lê (e `aal2` em metadata não conta); consentimento de tags sensíveis e revogação; aceite dos termos só da versão vigente; `ra` e `birth_date` não existem mais; mesmo RA com outro nome é recusado; limite de buscas de GIF; texto alternativo do GIF |

Ao criar uma RPC nova em `public`, o meta-teste falha até ela entrar na lista de `000_meta.sql`. É proposital: obriga a revisar a função.

### EXIF (`pnpm test:exif`)

`supabase/functions/processar-avatar/reencodar.test.ts` roda o mesmo código de re-encode da Edge Function sobre `e2e/fixtures/foto-com-gps.jpg`, um JPEG com fabricante, orientação e localização GPS no EXIF. Confere primeiro que a fixture tem mesmo esses dados, e depois que o WebP final não tem bloco `EXIF`, `XMP` nem `ICCP`, que um leitor de EXIF não encontra nada e que os bytes do original não estão lá. Sem o `strip()` da função, o teste falha.

### Ponta a ponta (Playwright)

Roda num celular (Pixel 7) contra o Supabase local, com um build de produção do app. **Antes de cada execução o `global-setup` roda `supabase db reset`**, para partir sempre das contas do seed (`E2E_SEM_RESET=1` pula isso). O código de login é lido pela API do Mailpit.

| Arquivo | Cobre |
| --- | --- |
| `01-entrar` | E-mail fora da lista e sem RA recusados com a mensagem do banco; código errado; contagem do reenvio; login com o código do e-mail |
| `02-onboarding` | Menor de idade barrado, levado a `/maiores-de-18` e apagado do Auth; aceite dos termos obrigatório; consentimento específico antes das tags sensíveis, revogação apagando as tags, e recusa do banco pela API sem consentimento; adulto com gostos e tag sensível (seção fechada por padrão) |
| `03-feed` | Postar com GIF: grava só o ID e exibe. A rota `/api/giphy` é simulada no navegador, então não precisa de chave; sem login ela responde 401 |
| `04-seguir-e-tag-sensivel` | Em Gente, a contagem bate com os chips em âmbar; seguir de volta vira mútuo, e só então a tag sensível aparece |
| `05-bloqueio` | Perfil e posts somem do feed, de Gente e do endereço direto, nos dois sentidos |
| `06-moderacao` | Usuário comum é redirecionado de `/moderacao`; moderadora entra |
| `07-excluir-conta` | A conta some do Auth, e o perfil e os posts somem para os outros. Numa conversa, as mensagens de quem saiu são apagadas e as da outra pessoa ficam, com a conversa aparecendo como "Conta excluída" |
| `08-avatar-sem-exif` | Falando direto com a API (sem o redimensionamento do navegador): a função tira o EXIF, apaga o original e deixa a foto pendente |
| `10-cabecalhos` | CSP (nonce novo a cada resposta, sem `unsafe-inline`, só Supabase e Giphy liberados), `frame-ancestors`, HSTS e `Referrer-Policy` em páginas públicas, logadas, redirecionamentos, API e estáticos |
| `11-mfa` | Staff sem segundo fator não lê fila nem age, nem pela API; cadastra o autenticador, erra o código, acerta e entra; num login novo o código é pedido de novo |
| `12-acessibilidade` | axe-core (WCAG 2.1 A e AA) em todas as telas e diálogos, nos temas claro e escuro: zero violações sérias ou críticas, e nenhuma violação da CSP |
| `13-seguranca` | Nenhum filtro em texto nem HTML cru no código; username malicioso não acha ninguém; limite da busca de GIF; "sair de todos os dispositivos" derruba o outro aparelho |
| `14-mensagens` | **Dois navegadores:** conversa em tempo real sem recarregar; só http/https viram link; contador de não lidas só para quem recebeu; apagar some para os dois; denúncia leva só a cópia e a staff não acessa a conversa; axe nos dois temas; deixar de seguir fecha e voltar reabre; bloqueio esconde. **Realtime direto, sem o app:** os dois participantes recebem (controle) e terceiro, bloqueada e não mútuo são recusados nos canais privados e não recebem nada em nenhum canal. **Push:** a notificação, decifrada, contém só "Nova mensagem de <nome>" |
| `15-aceite` | Termos desatualizados: toda tela leva a `/aceite`, que mostra o que mudou; o banco recusa post pela API; recusar oferece sair ou excluir; depois de aceitar, volta ao app e publica. axe nos dois temas |
| `09-service-worker` | Com o service worker ativo e controlando a página, depois de logar e navegar: a Cache Storage tem só a página offline e os ícones, nada do Supabase nem de rota autenticada; sem rede, entrega a página offline e não uma cópia do Início |

Os testes usam a service role local para conferir, por fora do app, que uma conta ou um arquivo deixou de existir. Ela é lida de `supabase status` na hora e não fica em nenhum arquivo.

## Licenças

| O quê | Origem | Licença |
| --- | --- | --- |
| **Atkinson Hyperlegible Next** (texto) | Braille Institute, via `next/font/google` (baixada no build e servida pelo próprio app) | SIL Open Font License 1.1 |
| **Bricolage Grotesque** (títulos) | Mathieu Triay, via `next/font/google` | SIL Open Font License 1.1 |
| Ícones da navegação e o cadeado | Desenhados para o Peripatos, em SVG no código (`Navegacao.tsx`, `TagChip.tsx`). Nenhuma biblioteca de ícones | Do projeto |
| Os 12 avatares prontos | Figuras geométricas geradas em código (`Avatar.tsx`). Sem foto, sem rosto, sem imagem de terceiros | Do projeto |
| Marca dos dois arcos e ícones do app | Desenhados para o Peripatos (`Marca.tsx`, `public/icones/`) | Do projeto |
| GIFs | Giphy, carregados dos servidores deles, com a atribuição "Powered by GIPHY" no seletor | Termos da API do Giphy |
| `e2e/fixtures/foto-com-gps.jpg` | Imagem sintética criada para o teste de EXIF | Do projeto |
| Next.js, React, Supabase JS, Tailwind, zod, Playwright, axe-core | npm | MIT, Apache-2.0 ou MPL-2.0 (axe-core) |

A Open Font License permite usar e embutir as fontes; não permite vendê-las sozinhas. **Confira as duas licenças na página de cada fonte no Google Fonts antes do lançamento**: a tabela reflete o que eu sei delas, não uma verificação do arquivo de licença.

O repositório ainda **não tem um arquivo `LICENSE`**: sem ele, o código é "todos os direitos reservados". Está em `docs/auditoria.md` como decisão.

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
