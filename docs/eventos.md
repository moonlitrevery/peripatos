# Eventos

Marcar coisas para fazer junto: presencial ou online, aberto ou com aprovação.
Tudo mora em `supabase/migrations/20261015000002_eventos.sql`; a prova está em
`supabase/tests/230_eventos.sql` e `240_eventos_concorrencia.sql`.

## Quem vê o quê

Um evento diz onde uma pessoa vai estar e quando. As regras são do banco:

| | Qualquer pessoa da instituição | Pediu e espera | Confirmado | Organiza | Staff |
| --- | --- | --- | --- | --- | --- |
| Título, descrição, data, local geral, tags | sim | sim | sim | sim | como qualquer pessoa |
| Vagas que sobram (só se o evento tem vagas) | sim | sim | sim | sim | idem |
| Quem vai | não | só a própria linha | os confirmados | todos, com os pedidos | **não** |
| Local exato e link | não | não | sim | sim | **não** |

- Só a mesma instituição. Bloqueio em qualquer direção esconde o evento e
  esconde, na lista de um terceiro, que a outra pessoa vai. Banido some.
- Evento que acabou ou foi cancelado só existe para quem organizou ou estava
  nele. É o "histórico" de `Meus eventos`.
- Local exato e link ficam em `event_details`, uma tabela à parte, porque o
  RLS decide por linha. Nenhuma política dos eventos cita a staff.
- A denúncia (`denunciar_evento`) grava uma **cópia** do título, da descrição
  e do local geral em `reports`. A moderação decide por ela e pode ocultar o
  evento (`ocultar_evento`, registrado em `moderation_actions`).

## Nada se escreve direto

Não há INSERT, UPDATE nem DELETE em nenhuma das quatro tabelas para a API.
Criar, editar, cancelar, participar, desistir, aceitar, recusar e remover são
RPCs: quem organiza é sempre quem chama, a instituição é a dela, e a
aprovação e as vagas não vêm do cliente.

**Vagas.** Toda confirmação (`participar_evento` num evento aberto,
`responder_pedido` aceitando) trava a linha do evento com `FOR UPDATE` antes
de contar. O teste `240_eventos_concorrencia.sql` abre duas conexões de
verdade: a segunda fica esperando a primeira e encontra o evento cheio.

**Limites.** 5 eventos criados por dia e 30 pedidos ou confirmações por dia,
pelo mesmo trigger dos posts. Desistir não devolve cota.

**Termos.** Criar e participar exigem a versão vigente aceita; ler, não.

## Notificações

| Tipo | Quem recebe | Quando |
| --- | --- | --- |
| `evento_pedido` | quem organiza | alguém pediu para participar |
| `evento_aceito` | quem pediu | o pedido foi aceito |
| `evento_alterado` | confirmados | mudou data, local ou link (a não lida é trocada pela nova) |
| `evento_cancelado` | confirmados e quem tinha pedido | cancelado, ocultado, organizador banido ou conta excluída |
| `evento_lembrete` | confirmados e quem organiza | faltam menos de duas horas |

- Recusar um pedido e remover um participante **não** avisam ninguém, e não
  existe onde guardar motivo.
- Um interruptor só para o push de todos os cinco (`push_preferences.evento`,
  desligado por padrão). O texto do push não diz o título, quem, nem onde.
- O cancelamento guarda o título na notificação (até 60 dias): quando a conta
  de quem organizava é excluída o evento deixa de existir, e sem o título quem
  ia não saberia qual foi.

## O que depende do relógio

`private.tarefas_de_eventos()` roda pelo pg_cron a cada dez minutos
(`peripatos-eventos`): manda o lembrete e, quando um evento acaba, concede
**Argonauta** (estava confirmado) e **Dionísio** (organizou, com três ou mais
confirmados). Evento cancelado ou ocultado não "aconteceu".

## No deploy

- Publicar a Edge Function de novo (`supabase functions deploy
  notificar-mensagem`): os textos de push dos cinco tipos novos moram nela.
- Conferir o job: `select jobname, schedule, active from cron.job;` deve listar
  `peripatos-eventos`.

## Decisões que tomei e que você pode querer rever

- **Evento sem fim dura duas horas** para efeito de "já acabou".
- **O tipo (aberto ou com aprovação) não muda depois de criado.**
- **Quem foi recusado ou removido não pede de novo** para o mesmo evento.
- **Moderação ocultar um evento avisa quem ia** como cancelamento, e quem
  organiza continua vendo o evento, marcado como ocultado.
- **Banir quem organiza cancela os eventos dela**, avisando quem ia.
- **O lembrete também vai para quem organiza.**
- **Tags sensíveis não marcam evento.**
- **A Política de privacidade e os Termos não foram alterados neste PR**, como
  combinado: local, presença e os avisos novos entram no PR único depois.
