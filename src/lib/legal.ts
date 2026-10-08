// Versão dos Termos de uso e da Política de privacidade que o app mostra.
// O banco só aceita o aceite desta mesma versão (private.termos_versao_atual):
// mudou o texto de /termos ou /privacidade, mude os dois lugares, na mesma
// entrega, com uma migration nova.
export const TERMOS_VERSAO = "2026-10-09-rascunho";

// O que mudou na versão vigente, em linguagem simples. É o que a tela de novo
// aceite (/aceite) mostra a quem tinha aceitado uma versão anterior. Ao mudar
// TERMOS_VERSAO, reescreva esta lista.
export const MUDANCAS_DA_VERSAO: string[] = [
  "Agora existe uma aba de notificações: quem começou a te seguir, quando você e alguém passam a se seguir, o resultado da análise da sua foto e das suas denúncias, mudanças nos Termos e conquistas novas. Só você lê as suas.",
  "As notificações são apagadas depois de 60 dias. Se você bloquear alguém, as notificações entre vocês são apagadas na hora.",
  "Você pode escolher quais tipos viram aviso no aparelho. Esses avisos não dizem o nome de ninguém.",
  "Agora existem conquistas, dadas automaticamente pelo que você faz no app: postar, conversar, completar o perfil, tempo de conta e as pessoas com quem você se segue mutuamente.",
  "Uma das conquistas usa a hora em que você publicou um post ou enviou uma mensagem. Não passamos a registrar nada de novo sobre o seu uso: é a hora que posts e mensagens já guardavam.",
  "Suas conquistas aparecem no seu perfil, e você pode esconder qualquer uma. Uma conquista ganha não é retirada.",
];
