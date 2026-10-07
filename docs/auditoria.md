# Auditoria do Peripatos

Feita em 2026-10-07, no branch `auditoria`, contra três listas: legal, aparência e segurança. Cada item recebeu uma de quatro classificações:

- **Atendido**: já estava certo. A coluna diz onde.
- **Ajustado**: mudou nesta auditoria. A coluna diz o quê.
- **Não se aplica**: e por quê.
- **Decisão**: depende de você. Todos estão reunidos na primeira seção.

Nada aqui foi a produção. O que é afirmado como testado foi testado contra o Supabase local.

## 1. O que precisa de decisão sua

Em ordem de urgência. Os três primeiros travam o merge ou o lançamento.

| # | Decisão | O que está em jogo | O que eu recomendo |
| --- | --- | --- | --- |
| D1 | **Aprovar a minimização de RA e data de nascimento** (migration 13) antes do merge | A migration **apaga as colunas `ra` e `birth_date`**. Não tem volta sem backup. Hoje só existe banco local, então o custo de errar é zero; depois do primeiro deploy, não. Efeitos: a idade não é mais reconferida a cada acesso (só no onboarding), e a data não pode ser "corrigida" porque não existe | Aprovar. A proposta e o raciocínio estão na seção 5 |
| D2 | **Quem é o controlador** e quais são os e-mails de contato | `/privacidade` e `/termos` estão com `[NOME DO RESPONSÁVEL, a definir]`, CPF, cidade e `privacidade@EXEMPLO.com.br`. Sem isso a política não cumpre a LGPD (art. 9º) | Definir antes de abrir para qualquer pessoa de fora |
| D3 | **Revisão jurídica** dos Termos e da Política | Continuam marcados como rascunho. Eu escrevi os textos e as bases legais; não sou advogado. Pontos que pedem olho profissional: base legal de cada dado, transferência internacional (art. 33), prazo de resposta ao titular, prazos de incidente | Um advogado antes do lançamento |
| D4 | **Texto que cita a universidade** | O placeholder do e-mail em `/entrar` é `nome.RA@alunos.unisagrado.edu.br`, e três telas dizem "sua universidade". Não afirmam vínculo, e acrescentei em `/entrar` o aviso de que o projeto é independente. Mas você pediu que nada sugira afiliação | Trocar o placeholder por `nome.RA@sua-instituicao.edu.br`. Manter "sua universidade", que descreve quem usa, não quem opera |
| D5 | **Novo aceite quando os termos mudarem** | O banco já sabe quem aceitou qual versão (`conta_status.termos_em_dia`), mas **não existe a tela** que barra a pessoa e pede o aceite de novo. Os textos dizem só "avisaremos dentro do app" | Implementar antes da primeira mudança de texto depois do lançamento; não trava o beta |
| D6 | **Plano do Supabase** | No grátis: sem backup automático, sem limite de duração de sessão nem encerramento por inatividade, e o projeto pausa após 7 dias parado. No Pro: backup diário (7 dias), as duas opções de sessão, e não pausa | Pro a partir do dia em que entrar gente de fora. Até lá, o backup próprio (D7) |
| D7 | **Backup: onde guardar, quem guarda a chave, com que frequência** | O backup criptografado e a restauração estão prontos e ensaiados no local (`docs/backup.md`). Falta: criar o par de chaves, escolher onde o `.gpg` mora, e rodar. **As fotos de avatar não entram** no backup | Chave privada no gerenciador de senhas e numa mídia offline; `.gpg` fora do Supabase; diário, retenção de 30 dias |
| D8 | **A chave do HMAC vai dentro do backup** | Em `docs/deploy.md` eu tinha escrito que ela nunca sai do banco. Com a minimização, o RA virou HMAC com essa chave, então um banco restaurado sem ela não reconhece banidos nem RAs. Ela agora vai no arquivo cifrado, e só nele | Aceitar. A alternativa é perder banimentos e unicidade de RA numa restauração |
| D9 | **Staff que perde o autenticador** | Não há recuperação pelo app, de propósito. Hoje o caminho é apagar o fator por SQL (`docs/incidentes.md`). Também não há códigos de recuperação | Aceitar para o beta, com poucos moderadores. Decidir depois se quer códigos de recuperação |
| D10 | **Achados de aparência** (seção 3) | Só apontei, como você pediu: sem estado de hover, quatro tamanhos de texto fora da escala, texto de 10 px, rótulos em maiúsculas acima do conteúdo, caixas com borda colorida | Ver seção 3 |
| D11 | **Licença do repositório** | Não há arquivo `LICENSE`: o código é "todos os direitos reservados" | Decidir se é fechado ou aberto, e registrar |
| D12 | **Vulnerabilidade em dependência de desenvolvimento** | `pnpm audit` acusa 1 alta em `braces` (via `eslint-config-next`), **sem versão corrigida**. Não vai para produção: `pnpm audit --prod` está limpo | Aceitar. O CI informa sem bloquear, e o Dependabot abre o PR quando houver correção |
| D13 | **Limites que eu escolhi** | Busca de GIF: 30 por minuto e 400 por dia por pessoa. Retenção de backup: 30 dias. São pontos de partida meus | Rever com o uso real |
| D14 | **Cookie de sessão não é HttpOnly** | É como o `@supabase/ssr` funciona: o navegador precisa do token para falar com o Storage (envio de foto). A CSP impede script de fora, que é o que roubaria o token | Aceitar. Mudar exigiria passar o envio de foto pelo servidor |
| D15 | **Logs do Supabase Auth guardam o e-mail** de quem pede código | É do fornecedor, não dá para desligar. O código do app não loga nada disso | Aceitar; já está na política de privacidade |
| D16 | **"Feito com CI verde"** | Não consigo ver o resultado do GitHub Actions (repositório privado, sem `gh` nem token aqui). A saída abaixo é local | Você confere em *Actions*, ou instala o `gh` autenticado |

## 2. Lista 1: Legal

| Item | Situação | Onde / o que mudou |
| --- | --- | --- |
| Política de privacidade | **Ajustado** | `src/app/privacidade/page.tsx`. Reescrita: controlador e encarregado (placeholders, D2), base legal por dado, operadores, transferência internacional, retenção, direitos, ANPD, incidentes. Continua marcada como rascunho |
| Reviews falsos | **Não se aplica** | O app não tem avaliações, depoimentos nem números de usuários em lugar nenhum |
| Termos de uso | **Ajustado** | `src/app/termos/page.tsx`. Acrescentei o registro do aceite, a gratuidade, a ressalva sobre nomes de instituições e o responsável (D2). Rascunho |
| Alegações sem base | **Atendido** | Varri os textos: não há promessa de resultado, "o maior", "100% seguro" nem estatística. O que o app afirma sobre privacidade é imposto no banco e coberto por teste |
| Política de reembolso | **Não se aplica** | Não há pagamento. Os Termos agora dizem que o uso é gratuito |
| Alt text | **Ajustado** | GIF usa o título do Giphy, guardado em `posts.gif_alt` (migration 13) e exibido em `Gif.tsx`. Foto de avatar tem `alt="Foto de <nome>"` (`Avatar.tsx`). Os 12 avatares prontos são desenhos abstratos e ficam fora da leitura de tela, porque o nome está sempre ao lado |
| Política de cookies | **Ajustado** | Seção "Cookies e o que fica neste aparelho" na política: só cookies essenciais (sessão), nenhum de terceiros |
| Contraste | **Ajustado** | axe-core em todas as telas, nos dois temas: zero violações. Um ajuste manual: a aba "Mensagens, em breve" tinha opacidade de 60%, cerca de 2,8:1 (`Navegacao.tsx`) |
| Banner de cookies | **Não se aplica** | Só há cookies estritamente necessários. A política explica por que não há aviso |
| Navegação por teclado | **Atendido** | Foco visível em tudo (`globals.css`), link "Pular para o conteúdo", `<dialog>` nativo que prende e devolve o foco, tags como checkbox real, botão "Carregar mais" além do scroll infinito |
| Consentimentos em formulários | **Ajustado** | Ver os dois itens específicos abaixo (termos e tags sensíveis). Antes, `/entrar` dizia "ao entrar você concorda", sem ação da pessoa |
| Dados do responsável | **Decisão (D2)** | A estrutura está na política e nos termos; faltam os dados reais |
| Dados desnecessários | **Ajustado** | Ver "Minimização" abaixo e a seção 5 |
| Consentimento de idade | **Atendido** | Data de nascimento no onboarding; menor tem a conta apagada na hora, sem guardar nada (`completar_onboarding`, teste `020` e e2e `02`). A página `/maiores-de-18` explica |
| Auditoria de SDKs de terceiros | **Atendido** | Nenhum SDK de terceiros roda no navegador além do cliente do Supabase: sem analytics, sem pixel, sem fontes externas (as fontes são servidas pelo próprio app). A CSP bloqueia qualquer outro. O único recurso externo é a imagem do GIF, vinda do Giphy |
| Descadastro em e-mails | **Não se aplica** | O único e-mail é o código de acesso, transacional e pedido pela própria pessoa. Não há e-mail de marketing nem notificação |
| Dark patterns | **Atendido** | Excluir conta está em Configurações, sem labirinto, e apaga de verdade. Tags sensíveis são opcionais, fechadas por padrão e com caixa desmarcada. Nenhuma caixa vem pré-marcada. Não há contagem regressiva falsa nem "tem certeza que quer nos deixar?" |
| Licença de fontes e imagens | **Ajustado** | Tabela "Licenças" no `README.md`. As duas fontes são OFL; ícones, avatares e marca são do projeto. Falta você conferir as licenças na fonte e decidir a do repositório (D11) |
| Taxas escondidas | **Não se aplica** | Não há cobrança |
| Pedido de exclusão de dados | **Atendido** | Configurações → Excluir minha conta: apaga perfil, posts, tags, follows, bloqueios, foto e login (`excluir_conta`, teste `130`, e2e `07`). A política lista o que permanece (HMAC de banimento e registro de moderação) |

### Pontos específicos

| Ponto | Situação | Onde / o que mudou |
| --- | --- | --- |
| Aceite dos termos no onboarding, com versão e data | **Ajustado** | Caixa obrigatória no passo 1. O banco grava `termos_versao` e `termos_aceitos_em` e **só aceita a versão vigente** (`private.termos_versao_atual()`, espelhada em `src/lib/legal.ts`). Testes `140` e e2e `02`. Falta o re-aceite quando a versão mudar (D5) |
| Consentimento específico para tags sensíveis (art. 11) | **Ajustado** | Componente `TagsSensiveis.tsx`: caixa destacada, com as duas finalidades escritas, separada do aceite dos termos; as tags só aparecem depois de marcada. **O banco recusa** tag sensível sem consentimento registrado, por qualquer caminho (trigger `a_sensiveis_consentimento`). Revogar, em Configurações, apaga todas as tags e o registro na mesma transação (`revogar_tags_sensiveis`). Testes `140` e e2e `02`, inclusive a tentativa direta pela API |
| Minimização de RA e data de nascimento | **Ajustado, aguarda D1** | Seção 5 |
| Política: operadores, transferência internacional, Giphy, cookies, controlador | **Ajustado** | Supabase, Vercel, Google (SMTP) e Giphy listados; seção de transferência internacional; explicação de que a imagem do GIF sai do navegador direto para o Giphy, que vê o IP; cookies só essenciais. Rascunho mantido |
| Nenhum texto sugere afiliação | **Ajustado, com D4** | Varredura: nenhuma tela afirma vínculo. `/entrar` ganhou "Projeto independente. Não é um serviço oficial nem tem vínculo com nenhuma universidade", e os Termos já tinham a seção. Resta o placeholder do e-mail |
| Alt text de GIFs e avatares | **Ajustado** | Acima |
| Licenças registradas no README | **Ajustado** | Acima |

## 3. Lista 2: Aparência

Aqui só apontei. Corrigi direto apenas contraste e espaçamento, como combinado.

| Item | Encontrado? | Observação |
| --- | --- | --- |
| Gradiente roxo-azul | Não | Nenhum gradiente no app |
| shadcn sem customização | Não | Não usa shadcn nem Radix. Os componentes são próprios |
| Texto de herói com gradiente | Não | |
| Fade-in no scroll | Não | Nenhuma animação de entrada. A única transição é a de cor dos botões |
| Emojis em títulos | Não | Nenhum emoji na interface |
| Feixe que segue o cursor | Não | |
| Inter em tudo | Não | Atkinson Hyperlegible Next no texto e Bricolage Grotesque nos títulos |
| Botões que esmaecem no hover | Não, mas **(D10)** | O oposto: **não há estado de hover em nenhum botão ou link**. No computador nada reage ao mouse. Vale um hover discreto (escurecer o fundo) |
| Cards com borda colorida | **Sim, dois (D10)** | O aviso de rascunho nas páginas legais (borda vermelha) e a caixa de consentimento das tags sensíveis (borda ameixa, **que eu acrescentei**). Os dois são avisos, não cards decorativos. O `.cartao` padrão tem borda neutra |
| Espaçamento inconsistente | **Sim, ajustado** | As telas logadas tinham margem lateral de 16 px e as públicas de 20 px. Unifiquei em 20 px (`(app)/layout.tsx`). **(D10)** restam quatro tamanhos de texto fora da escala do Tailwind (`0.75`, `0.8125`, `0.9375` e `1.0625rem`); o primeiro é igual a `text-xs` e os outros são meios-tons |
| Glassmorphism | Não | Nenhum blur nem fundo translúcido, fora o véu do diálogo |
| Travessões em excesso | Não | Nenhum travessão nos textos do app |
| Dark mode com pouco contraste | Não | axe no tema escuro: zero violações. Corrigi a aba "em breve" (60% de opacidade) |
| Texto genérico de buzzword | Não | Os textos dizem o que a coisa faz ("Gente da sua universidade que gosta do que você gosta") |
| Três caixas de ícone em linha | Não | |
| Itálico serifado de destaque | Não | Nenhum itálico, nenhuma serifada |
| Badge acima do título | **Parecido (D10)** | "Fora do seu círculo", em maiúsculas pequenas acima do cabeçalho do post, e "Passo 1 de 3" acima do título do onboarding. Os dois informam algo; o primeiro é o que mais lembra o padrão |
| Space Grotesk com Instrument Serif | Não | |
| Lucide em tudo | Não | Cinco ícones, desenhados à mão em SVG |
| Granulado sobre gradiente | Não | |

Outros dois que não estavam na lista **(D10)**: o "em breve" da aba Mensagens tem **10 px**, pequeno demais para ler; e os raios de canto usam quatro valores (12, 16, 20 e 24 px), o que é uma escala, mas larga.

## 4. Lista 3: Segurança

| Item | Situação | Onde / o que mudou |
| --- | --- | --- |
| HTTPS | **Ajustado** | HSTS de dois anos com subdomínios (`next.config.ts`). O Vercel e o Supabase já servem só em HTTPS. `upgrade-insecure-requests` na CSP quando o Supabase é https |
| Expiração de sessão | **Ajustado** | Documentada na tabela "Sessões" do `README.md`: token de 1 hora, refresh com rotação, sessão que não vence sozinha. Limite de duração e inatividade só no Pro (D6). "Sair de todos os dispositivos" em Configurações |
| Segredos | **Atendido** | A service role não existe no app nem em variável `NEXT_PUBLIC_`; a chave do Giphy fica só no servidor; `.env*` no `.gitignore`. gitleaks em todo o histórico: nenhum segredo |
| MFA | **Ajustado** | Ver ponto específico |
| CORS | **Ajustado** | O app Next não expõe API a outras origens. A Edge Function aceitava qualquer origem; agora aceita só `ORIGEM_DO_APP` quando o segredo está definido (`docs/deploy.md`, passo 9). A API do Supabase aceita qualquer origem por design, e a autorização é o token |
| Rate limit | **Ajustado** | Já havia no banco para posts, follows, denúncias e pedidos de tag. Acrescentei a busca de GIF. Login e verificação de código têm os limites do Auth (`docs/deploy.md`, passo 8) |
| Logs | **Atendido** | Ver ponto específico |
| Validação de entradas | **Ajustado** | Ver ponto específico |
| Backups | **Ajustado, com D6 e D7** | Ver ponto específico |
| Sanitização | **Atendido** | O React escapa todo texto. Não há `dangerouslySetInnerHTML`. O post guarda só o ID do GIF, e a URL é montada pelo app. O alt do GIF tem caracteres de controle removidos e limite de 200 |
| Criptografia | **Atendido** | Em trânsito: HTTPS. Em repouso: o disco do Supabase é cifrado pelo fornecedor. E-mail banido e RA ficam como HMAC com chave no Vault. Backup cifrado com GPG |
| SQL injection | **Atendido** | Nenhuma consulta é montada com texto: o cliente usa o construtor do PostgREST e RPCs com parâmetros. As funções do banco são `security definer` com `search_path` vazio (meta-teste `000`) |
| Dependências | **Ajustado** | Dependabot semanal (`.github/dependabot.yml`) e `pnpm audit` no CI. Produção sem vulnerabilidades; uma em dev (D12) |
| Migrations | **Atendido** | Versionadas, aplicadas do zero a cada execução do e2e e no CI. Idempotentes onde precisam (vocabulário, buckets) |
| Menor privilégio | **Atendido** | `anon` não tem privilégio nenhum (o `verificar:deploy` confere); `authenticated` tem `GRANT` por coluna; o schema `private` não é exposto; a lista de RPCs é fechada por meta-teste |
| Rollback | **Ajustado** | `docs/incidentes.md`: rollback no Vercel e correção de migration para a frente |
| Monitoramento | **Atendido em parte** | `verificar-producao.yml` roda o verificador todo dia e avisa se a `anon` passar a ler algo. Não há alerta de erro nem de disponibilidade do app: no beta, os logs do Vercel e do Supabase. Fica como melhoria |
| Controle de acesso | **Atendido** | RLS forçado em todas as tabelas (meta-teste), cargo vindo de `staff_roles` e nunca do JWT, e agora `aal2` para a staff |
| Plano de recuperação | **Ajustado** | `docs/backup.md` (restauração ensaiada) e `docs/incidentes.md` |

### Pontos específicos

| Ponto | Situação | Onde / o que mudou |
| --- | --- | --- |
| MFA (TOTP) obrigatório para staff, exigido no banco | **Ajustado** | `is_staff` e `is_admin` exigem `aal2` de quem chama, então **todas** as RPCs de moderação e administração e as **leituras** da staff (fila, registro, fotos pendentes) dependem do segundo fator. `aal2` escrito em metadata não conta. Tela em `/moderacao/verificacao`. pgTAP `140` (18 asserções) e e2e `11`: sem o fator nada funciona nem pela API; cadastro, código errado, código certo, e novo login pedindo o código de novo |
| Rate limit em `/api/giphy` | **Ajustado** | `registrar_busca_gif()` conta no banco: 30 por minuto e 400 por dia por pessoa, resposta 429 com `Retry-After`. pgTAP `140` e e2e `13` |
| Filtros do PostgREST com texto do usuário | **Ajustado** | Havia um `.or()` com interpolação em `/u/[username]`. Os valores eram UUIDs vindos do banco, não texto do usuário, então **não era explorável**; troquei por duas consultas com `.eq()` para o padrão não existir. Um teste varre `src/` e falha se aparecer `.or()`/`.filter()` em texto; outro tenta usernames maliciosos e recebe 404 |
| `dangerouslySetInnerHTML` e links do usuário | **Atendido** | Não existe nenhum dos dois. Todo link é caminho interno fixo ou `/u/<username>`, e o username é `[a-z0-9_]` por constraint. O mesmo teste de varredura cobre |
| Validação no servidor em toda action e route handler | **Ajustado** | `src/lib/validacao.ts` (zod). Das 26 server actions, as 21 que recebem argumentos e o route handler validam a forma antes do banco: UUIDs, tamanhos, enums, listas de tags, cursor. As outras 5 não recebem nada. Não há teste dedicado para cada action; a e2e `13` cobre o route handler, e as actions são exercitadas pelos fluxos |
| Cabeçalhos: CSP, frame-ancestors, Referrer-Policy, HSTS | **Ajustado** | CSP com nonce por resposta (`src/proxy.ts`, `src/lib/csp.ts`): scripts só do app, conexões só para o app e o Supabase, imagens só do app, do Supabase e do Giphy, `frame-ancestors 'none'`. e2e `10` confere os cabeçalhos em páginas públicas, logadas, redirecionamentos, API e estáticos; a e2e `12` confere que nenhuma tela viola a CSP. Custo: todas as páginas passam a ser renderizadas a cada requisição |
| Expiração documentada e "sair de todos os dispositivos" | **Ajustado** | `README.md` e Configurações → Sessões. e2e `13`: o outro aparelho é desconectado na página seguinte |
| Nenhum log com OTP, e-mail, RA ou token | **Atendido** | Não há `console.*` em `src/` nem na Edge Function. As mensagens de erro para a tela são genéricas. Ressalva: os logs do Supabase Auth guardam o e-mail (D15) |
| Dependabot e `pnpm audit` no CI | **Ajustado** | `.github/dependabot.yml`; `ci.yml` bloqueia em vulnerabilidade alta de produção e informa as demais |
| gitleaks no CI e varredura do histórico agora | **Ajustado** | Job `segredos` no `ci.yml` (v8.30.1, histórico inteiro). Varredura feita hoje em todos os commits de todos os branches: **nenhum segredo**. Na árvore local o gitleaks acusa só `.env.local` e `supabase/.temp`, ambos no `.gitignore` e com chaves do Supabase local |
| Backups | **Ajustado** | **O plano grátis não tem backup restaurável** (fonte em `docs/backup.md`). `scripts/backup-criptografado.sh` cifra em pipe com GPG, sem nunca gravar o dump em claro; `scripts/restaurar-backup.sh` faz a volta. Ensaiado no local: os dados voltaram iguais. Não ensaiado contra um projeto hospedado |
| `docs/incidentes.md` | **Ajustado** | Service role, Giphy, SMTP, deploy ruim, migration ruim, autenticador perdido, conta de moderação comprometida, e a LGPD: comunicação à ANPD e aos titulares, prazo e registro. Os prazos precisam de confirmação jurídica (D3) |

### Acessibilidade automatizada

**Ajustado.** `e2e/12-acessibilidade.spec.ts` roda o axe-core (regras WCAG 2.1 A e AA) nos temas claro e escuro em: `/entrar` (inclusive com erro), `/termos`, `/privacidade`, `/offline`, `/maiores-de-18`, os três passos do onboarding (com a seção sensível aberta, antes e depois do consentimento), Início, Gente, perfil de outra pessoa, o próprio perfil, perfil inexistente, Você, Configurações, o seletor de GIF, o diálogo de denúncia, a verificação em duas etapas e a Moderação.

Resultado: **zero violações sérias ou críticas** nos dois temas. O teste falha se o axe não tiver avaliado nada ou não tiver avaliado contraste, para o "zero" não ser vazio.

Limite: o axe encontra o que é verificável por máquina (contraste, nomes, papéis, rótulos). Não substitui um teste com leitor de tela de verdade, que não foi feito.

## 5. Minimização: proposta e o que foi implementado

**Data de nascimento.** Só servia para responder "tem 18 ou mais?". Quem informa data de menor é apagado na hora, então toda conta que conclui o onboarding já passou pela verificação, e idade só aumenta. Guardar a data inteira depois disso é guardar mais do que a finalidade pede.

- Antes: `private.accounts.birth_date`, comparada com a data de hoje a cada verificação de conta ativa.
- Agora: `maioridade_verificada_em` (um instante). A data é comparada dentro da função e **não é gravada**.
- O que se perde: a reconferência contínua da idade (que nunca mudaria o resultado) e a possibilidade de "corrigir a data".

**RA.** Só servia para impedir duas contas com o mesmo RA na mesma instituição, com nomes diferentes antes do ponto. Para isso basta saber se dois RAs são iguais.

- Antes: `private.accounts.ra` em claro, com `unique (institution_id, ra)`.
- Agora: `ra_hmac`, HMAC-SHA256 com a chave do Vault e um prefixo que o separa do HMAC de e-mail, com `unique (institution_id, ra_hmac)`.
- **Limite honesto:** o RA continua existindo em claro dentro do e-mail em `auth.users`, que é o login e não pode sair. O ganho é deixar de ter uma segunda cópia, separada e consultável, e não "o banco não sabe mais o RA".

**O banimento não muda.** Ele sempre foi HMAC do e-mail, não do RA. Os testes `090` passam sem alteração, e `140` confirma que outro nome com o mesmo RA continua recusado.

**Consequência nova:** como o RA agora depende da chave do Vault, ela precisa ir no backup (D8).

## 6. Bugs e fragilidades encontrados no caminho

- **Três testes pgTAP dependiam de banco vazio** (`080`, `130`, e antes o `110`): passavam em banco limpo e falhavam depois do e2e. Não era falha do app. Restringi as asserções aos dados do próprio teste.
- **A restauração de backup não funcionava na primeira tentativa:** as migrations já inserem a instituição e as tags, que colidiam com o dump, e o schema `storage` tem tabelas que o papel `postgres` não escreve. O script de restauração trata os dois casos. Só apareceu porque ensaiei a volta.
- **O limite de GIF era conferido depois da chave:** sem `GIPHY_API_KEY` a rota respondia 503 antes de contar, então o limite não valia nesse caso. Inverti a ordem.

## 7. Saída dos testes

Local, em 2026-10-07, contra `supabase start`. Lint, type-check e `test:exif` (4 testes) também passam; `pnpm audit --prod` não encontra vulnerabilidades.

`pnpm test:db`, em banco limpo e de novo depois do e2e:

```
000_meta.sql ................. ok
010_cadastro.sql ............. ok
020_onboarding.sql ........... ok
030_instituicao.sql .......... ok
040_tags_sensiveis.sql ....... ok
050_bloqueio.sql ............. ok
060_posts.sql ................ ok
070_rate_limit.sql ........... ok
080_denuncias_moderacao.sql .. ok
090_banimento.sql ............ ok
100_feed.sql ................. ok
110_storage.sql .............. ok
120_privacidade.sql .......... ok
130_excluir_conta.sql ........ ok
140_auditoria.sql ............ ok
All tests successful.
Files=15, Tests=372
Result: PASS
```

`pnpm test:e2e`:

```
  ✓   1 01-entrar › e-mail de fora da lista é recusado com a mensagem do banco
  ✓   2 01-entrar › e-mail institucional sem RA é recusado
  ✓   3 01-entrar › código errado avisa; o código do e-mail entra
  ✓   4 01-entrar › sem login, qualquer página manda para /entrar
  ✓   5 02-onboarding › menor de idade é barrado e a conta é apagada na hora
  ✓   6 02-onboarding › adulto completa o onboarding com gostos e tag sensível
  ✓   7 03-feed › a busca de GIFs exige login
  ✓   8 03-feed › postar com GIF grava o post e mostra o GIF
  ✓   9 04 › seguir de volta vira mútuo, e só então a tag sensível aparece
  ✓  10 05 › bloquear faz a pessoa e os posts dela sumirem, nos dois sentidos
  ✓  11 06-moderacao › usuário comum é mandado embora de /moderacao
  ✓  12 06-moderacao › quem é da moderação, sem o segundo fator, é mandado confirmar antes
  ✓  13 07 › excluir a conta apaga o login, o perfil e os posts
  ✓  14 08 › a Edge Function tira o EXIF, apaga o original e deixa a foto pendente
  ✓  15 09 › o service worker não guarda nada do Supabase nem de rota autenticada
  ✓  16 10-cabecalhos › página pública sai com CSP, HSTS, Referrer-Policy e sem permitir iframe
  ✓  17 10-cabecalhos › páginas logadas, redirecionamentos, API e arquivos estáticos também
  ✓  18 11-mfa › moderadora cadastra o autenticador, confirma e só então modera
  ✓  19 12-acessibilidade › acessibilidade (axe) em todas as telas, tema claro
  ✓  20 12-acessibilidade › acessibilidade (axe) em todas as telas, tema escuro
  ✓  21 13-seguranca › nenhum filtro do PostgREST é montado com texto, e nada injeta HTML
  ✓  22 13-seguranca › um username que tenta reescrever o filtro não encontra ninguém
  ✓  23 13-seguranca › a busca de GIFs tem limite por pessoa e valida a entrada
  ✓  24 13-seguranca › sair de todos os dispositivos derruba a sessão do outro aparelho
  24 passed (3.8m)
```

**CI:** o workflow roda tudo isso mais o gitleaks e o `pnpm audit`. Eu não consigo ler o resultado daqui (D16).
