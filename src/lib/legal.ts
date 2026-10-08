// Versão dos Termos de uso e da Política de privacidade que o app mostra.
// O banco só aceita o aceite desta mesma versão (private.termos_versao_atual):
// mudou o texto de /termos ou /privacidade, mude os dois lugares, na mesma
// entrega, com uma migration nova.
export const TERMOS_VERSAO = "2026-10-08-rascunho";

// O que mudou na versão vigente, em linguagem simples. É o que a tela de novo
// aceite (/aceite) mostra a quem tinha aceitado uma versão anterior. Ao mudar
// TERMOS_VERSAO, reescreva esta lista.
export const MUDANCAS_DA_VERSAO: string[] = [
  "Agora existem mensagens diretas, só entre quem se segue mutuamente. Guardamos o texto e os GIFs das suas conversas para entregá-las à outra pessoa.",
  "Só as duas pessoas da conversa leem as mensagens. A moderação não tem acesso a conversas.",
  "Se alguém denunciar uma mensagem sua, uma cópia dela (e só dela) vai para a moderação. O mesmo vale quando você denuncia uma mensagem que recebeu.",
  "Não há confirmação de leitura nem aviso de que alguém está digitando.",
  "Você pode ativar notificações de mensagens. O aviso diz só de quem é a mensagem, nunca o que ela diz, e passa pelo serviço de notificações do seu navegador.",
  "Se você excluir a conta, as suas mensagens são apagadas. As que a outra pessoa escreveu continuam com ela.",
  "Quando os Termos ou a Política mudarem, o app mostra o que mudou e pede um novo aceite, como agora.",
];
