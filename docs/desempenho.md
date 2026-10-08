# Desempenho: o que foi medido, o que mudou e o que ficou como estava

## Como medir

```bash
supabase start && supabase db reset
node scripts/medir-navegacao.mjs            # --atraso 60 --rodadas 5 por padrão
```

O script sobe um proxy na frente do Supabase local que **atrasa cada requisição em 60 ms** e anota todas, faz o build de produção apontando para ele, entra como a Lia e mede cada rota de dois jeitos: abrindo o endereço direto (carga) e chegando pela navegação do app (toque).

O atraso existe porque, no ambiente local, o banco responde em 2 ms e qualquer página parece instantânea. O que custa em produção é **quantas vezes o servidor vai ao Supabase em fila** antes de responder, e isso só aparece no relógio quando cada ida custa alguma coisa. 60 ms é um valor arbitrário, entre o que se espera com as funções em São Paulo (poucos ms) e em Washington (120 a 150 ms). **Os milissegundos abaixo não são os de produção; a contagem de ondas é.**

"Onda" = um grupo de consultas que saem juntas. Dez consultas em paralelo custam uma onda; três em sequência custam três. É o número que importa.

## Antes e depois

Mediana de 5 rodadas, celular (Pixel 7), build de produção, 60 ms por ida ao Supabase.

| Rota | Ondas | Consultas | Carga: 1º byte | Carga: pronta | Toque: a tela muda | Toque: pronta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Início | 5 → **2** | 6 → **5** | 500 ms → **225 ms** | 620 ms → **367 ms** | 564 ms → **81 ms** | 574 ms → **354 ms** |
| Gente | 5 → **2** | 8 → **6** | 510 ms → **222 ms** | 638 ms → **360 ms** | 583 ms → **109 ms** | 593 ms → **295 ms** |
| Perfil de outra pessoa | 5 → **3** | 13 → **11** | 510 ms → **297 ms** | 632 ms → **418 ms** | – | – |
| Mensagens | 4 → **2** | 5 → **4** | 413 ms → **217 ms** | 543 ms → **345 ms** | 471 ms → **106 ms** | 479 ms → **292 ms** |
| Você | 4 → **2** | 6 → **5** | 414 ms → **219 ms** | 549 ms → **354 ms** | 483 ms → **92 ms** | 494 ms → **278 ms** |
| Configurações | 5 → **2** | 11 → **10** | 491 ms → **232 ms** | 656 ms → **415 ms** | – | – |

Leitura:

- **De 4 ou 5 idas em fila para 2** em quase toda navegação (3 no perfil, que precisa achar a pessoa pelo username antes de buscar o resto). Em produção, cada onda a menos é uma ida e volta inteira ao banco que a pessoa deixa de esperar.
- **O toque responde em cerca de 100 ms, contra 470 a 580 ms.** Antes a tela ficava parada até o servidor terminar tudo; agora o esqueleto da tela de destino aparece na hora.
- O tempo até a tela ficar **pronta** caiu cerca de 40% com o atraso simulado. Em produção, com as funções em São Paulo, o que sobra são duas idas de poucos milissegundos.

### Onde o tempo ia (antes)

A ordem das idas ao Supabase para abrir o Início:

```
auth:user → rpc/conta_status → auth:user → rpc/total_nao_lidas → profiles → rpc/feed
   proxy          proxy          página         layout           página     página
```

1. O proxy validava a sessão e **só depois** perguntava o estado da conta: duas idas em fila em toda navegação.
2. A página validava a sessão **de novo**, com outra ida ao Auth.
3. Só então buscava o perfil, e **só depois** o feed.

### O que mudou

| Mudança | Onde | Efeito |
| --- | --- | --- |
| Sessão e estado da conta pedidos juntos | `src/proxy.ts` | −1 onda em toda navegação. A RPC roda com o mesmo token, que o banco confere; o resultado só é usado se o `getUser()` confirmar a sessão |
| Páginas verificam a assinatura do token (`getClaims`) em vez de ir de novo ao Auth | `src/lib/sessao.ts` | −1 onda. O proxy continua validando a sessão no servidor de Auth uma vez por requisição; as server actions continuam com `getUser()` |
| Perfil e feed em paralelo; perfil e o resto de Configurações em paralelo; em Gente, as três consultas saem juntas | páginas | −1 onda em cada |
| Card de Gente não busca mais as outras tags de cada pessoa | `gente/page.tsx` | −1 consulta (a lista ficou só com o que é em comum) |
| `loading.tsx` com esqueleto no formato da tela | Início, Gente, Mensagens, Você, Configurações | a tela muda no toque |
| Seguir, deixar de seguir e postar otimistas, com volta atrás | `BotaoSeguir`, `Feed` | a resposta é imediata; se o servidor recusar, desfaz e mostra o motivo |
| Sugestões do desktop pedidas só quando a coluna existe | `Sugestoes` | zero custo no celular e no tablet |
| Funções do Vercel em `gru1` | `vercel.json` | cada onda passa de ~130 ms para poucos ms (ver `docs/deploy.md`, passo 10). **É o maior ganho, e este script não o mede** |

Sobre o `getClaims`: com chaves de assinatura assimétricas (o padrão dos projetos novos do Supabase, e o do ambiente local atual) a verificação é local e a ida ao Auth some. Se o projeto de produção ainda estiver com o segredo simétrico antigo (HS256), o `getClaims` cai sozinho no `getUser()`: continua correto, só não ganha essa onda. Dá para conferir em *Project Settings → JWT Keys*.

### Perfil e conversa ficaram sem esqueleto, de propósito

`/u/<username>` e `/mensagens/<id>` respondem **404 de verdade** quando a pessoa ou a conversa não existe para quem pede (bloqueio, banimento, outra instituição). Com `loading.tsx` a resposta começa a ser enviada antes de o banco responder, e o status vira 200 com a tela de "não encontrado" dentro. Preferi manter o 404 (os testes `13` e `14` conferem). Por isso o Início e a lista de mensagens ficam em grupos de rota (`(inicio)`, `(lista)`): o esqueleto vale só para eles.

## A CSP com nonce: revisei e não mexi

A pergunta era se dá para manter a mesma proteção sem renderizar tudo a cada requisição.

**O que o nonce custa de fato.** Ele obriga toda página a ser renderizada por requisição. Mas as páginas logadas já seriam assim com ou sem nonce: dependem do cookie de sessão e mostram dados de uma pessoa. O custo real fica nas cinco páginas públicas (`/entrar`, `/termos`, `/privacidade`, `/offline`, `/maiores-de-18`), que poderiam ser estáticas. Medido no build de produção: **11 a 15 ms** de servidor por página (mediana de 25 requisições, sem nenhuma ida ao banco). O que se perde é o cache de CDN dessas cinco, não tempo perceptível.

**As alternativas que existem:**

1. **CSP por hash com SRI** (`experimental.sri` do Next): mantém a política estrita sem nonce e deixa as páginas públicas estáticas. É a única que não enfraquece nada, mas é experimental no Next 16, e um erro nela aparece como tela em branco para todo mundo. Não vale o risco por 12 ms em cinco páginas.
2. **Páginas públicas estáticas com uma CSP sem nonce**: exigiria `'unsafe-inline'` nos scripts dessas páginas. **Enfraquece a CSP**, e justo na tela de login. Não fiz, e não faria sem você pedir.
3. **Partial Prerendering**: incompatível com nonce, segundo a própria documentação do Next.

**Conclusão: fica como está.** A lentidão que se sentia não vinha da CSP nem da renderização por requisição: vinha das idas em fila ao banco e da distância até ele, e foi aí que mexi. Se um dia as páginas públicas tiverem tráfego que justifique CDN, a opção 1 é o caminho, quando sair de experimental.
