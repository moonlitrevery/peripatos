// Versão dos Termos de uso e da Política de privacidade que o app mostra.
// O banco só aceita o aceite desta mesma versão (private.termos_versao_atual):
// mudou o texto de /termos ou /privacidade, mude os dois lugares, na mesma
// entrega, com uma migration nova.
export const TERMOS_VERSAO = "2026-10-16-rascunho";

// O que mudou na versão vigente, em linguagem simples. É o que a tela de novo
// aceite (/aceite) mostra a quem tinha aceitado uma versão anterior. Ao mudar
// TERMOS_VERSAO, reescreva esta lista.
export const MUDANCAS_DA_VERSAO: string[] = [
  "Agora existem eventos. Todo mundo da sua universidade vê o título, a descrição, a data e o local geral. Quem vai, o local exato e o link só aparecem para quem organiza e para quem já está confirmado. A moderação não vê nenhum dos três.",
  "Se você denunciar um evento, a moderação recebe uma cópia do título, da descrição e do local geral, e só disso.",
  "Se um evento for cancelado, quem ia recebe um aviso com o título do evento. Esse aviso dura até 60 dias, mesmo que a conta de quem organizava seja excluída.",
  "Regras novas para eventos: não use um evento para assediar ou perseguir ninguém, não divulgue o endereço de outra pessoa, e quem organiza é responsável pelo que marca. Recomendamos marcar em lugar público.",
  "Quem concluiu o cadastro há pouco pode aparecer, por 14 dias, numa lista de recém-chegados para as pessoas da mesma universidade. A lista não diz a data.",
  "Quando você segue alguém a partir de um post, guardamos de qual post foi. Só a pessoa seguida fica sabendo, pela notificação dela.",
  "A equipe do Peripatos tem dois papéis: a moderação cuida de denúncias, posts, eventos, fotos e banimentos; a administração faz tudo isso e também nomeia a moderação, aprova pedidos de tag e concede conquistas. Quem é nomeado é avisado por uma notificação.",
];
