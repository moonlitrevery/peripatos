# Cargos: moderação e administração

Quem pode o quê, e o que o banco impede. Tudo mora em
`supabase/migrations/20261014000002_cargos.sql` (e nas RPCs de
`20261005000007_moderacao.sql`, que ela redefine). A prova é
`supabase/tests/220_cargos.sql`.

## Quem pode o quê

| | Moderação | Administração |
| --- | --- | --- |
| Ler a fila de denúncias, o registro de moderação e as fotos pendentes | sim | sim |
| Resolver ou rejeitar denúncia | sim, menos contra a equipe | sim |
| Ocultar e restaurar post | sim, menos da equipe | sim |
| Banir | só usuário comum | qualquer pessoa, menos a si |
| Aprovar e recusar avatar | sim, menos da equipe e o próprio | sim, menos o próprio |
| Desbanir | não | sim |
| Nomear, trocar e remover cargo | não | sim, menos o próprio |
| Aprovar ou recusar pedido de tag | não | sim |
| Conceder Héracles e Hefesto | não | sim |
| Mudar `fundador_ate`, `panateneia_inicio`, `panateneia_fim` | não | sim |

Tudo exige o segundo fator confirmado naquele login (sessão `aal2`). Sem ele,
quem tem cargo não age **nem lê** como equipe. Isso vale desde o primeiro
minuto para quem acabou de ser nomeado: a checagem é "tem linha em
`staff_roles`", não "já era da equipe".

## Proteções

- **Moderação não age sobre a equipe.** Banir, ocultar ou restaurar post,
  decidir foto e resolver denúncia contra moderador ou admin: só a
  administração. A resposta é sempre "Só a administração age sobre quem é da
  equipe."
- **Ninguém altera o próprio cargo**, nem modera a própria foto, nem resolve
  denúncia contra si.
- **O último admin não sai.** Um trigger em `staff_roles` recusa apagar ou
  rebaixar o único admin de uma instituição, por qualquer caminho: RPC,
  banimento, exclusão da própria conta ou SQL direto. Quem é o único admin
  precisa nomear outro antes de sair ou de excluir a conta.
- **Toda mudança de cargo fica em `moderation_actions`** (`conceder_cargo`,
  `remover_cargo`), com quem fez, para quem e por quê. A troca guarda o cargo
  anterior; a perda de cargo por banimento também é registrada.
- **Quem é nomeado recebe uma notificação** (`cargo_concedido`), que não diz
  quem nomeou. Ela não vira push.

## A tela

`/moderacao` ganhou a seção **Equipe**, só para a administração: a lista da
equipe com cargo e desde quando, a busca de pessoa da instituição (nome ou
username), **Nomear como moderação** e **Remover**, sempre com motivo. Para a
moderação a seção não existe, e os botões sobre denúncias e fotos de quem é
da equipe também não aparecem.

O que **não** tem tela e continua pela RPC (ou por SQL): nomear outro admin
ou rebaixar um (`definir_cargo`), pedidos de tag (`resolver_pedido_tag`),
desbanir (`desbanir_usuario`) e as configurações (`definir_configuracao`).

## Decisões que tomei e que você pode querer rever

- **"Não recusa avatar da equipe" virou "não decide"**: a moderação também
  não aprova foto de colega. Aprovar só a de quem não é da equipe evita um
  moderador aprovando o outro.
- **Denúncia contra alguém da equipe** só a administração resolve. O pedido
  falava de banir, ocultar e avatar; rejeitar a denúncia contra um colega é o
  mesmo conflito.
- **Restaurar post** entrou na mesma regra: um moderador não desfaz o que a
  administração ocultou de alguém da equipe (inclusive o próprio post).
- **O único admin não consegue excluir a própria conta** enquanto não nomear
  outro. A alternativa era deixar a instituição sem administração.
- **`private.config` é uma só para o banco inteiro.** Com mais de uma
  instituição, a admin de qualquer uma muda as datas para todas. Hoje há uma.
