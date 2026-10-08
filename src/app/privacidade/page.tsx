import type { Metadata } from "next";
import { PaginaLegal } from "@/components/PaginaLegal";
import { TERMOS_VERSAO } from "@/lib/legal";

export const metadata: Metadata = { title: "Política de privacidade" };

export default function Privacidade() {
  return (
    <PaginaLegal titulo="Política de privacidade">
      <p>
        Esta página explica quais dados o Peripatos guarda, para quê, quem vê cada um e como você exerce seus direitos
        pela Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018). Versão {TERMOS_VERSAO}.
      </p>

      <h2>Quem é o responsável</h2>
      <p>
        O controlador dos seus dados é <strong>[NOME DO RESPONSÁVEL, a definir]</strong>, pessoa física, inscrita no CPF
        sob o nº <strong>[a definir]</strong>, com endereço em <strong>[cidade/UF, a definir]</strong>. O Peripatos é um
        projeto independente e <strong>não tem vínculo com nenhuma universidade</strong>: nenhuma instituição de ensino
        recebe, acessa ou controla estes dados.
      </p>
      <p>
        Encarregado pelo tratamento de dados (canal para qualquer pedido desta página):{" "}
        <strong>privacidade@EXEMPLO.com.br</strong> (endereço provisório, a definir antes do lançamento).
      </p>

      <h2>O que coletamos, para quê e com que base legal</h2>
      <ul>
        <li>
          <strong>E-mail institucional.</strong> Para confirmar que você é aluno de uma instituição participante, para
          enviar o código de acesso e para impedir que uma conta banida volte. Base legal: execução do contrato (os
          Termos de uso). Não enviamos propaganda.
        </li>
        <li>
          <strong>RA (o número que faz parte do seu e-mail).</strong> Não guardamos o RA separado. Guardamos só um
          código derivado dele (um HMAC, que não permite recuperar o número), para impedir duas contas com o mesmo RA.
          O RA continua existindo dentro do seu e-mail, que é o seu login.
        </li>
        <li>
          <strong>Data de nascimento.</strong> Você informa uma vez, para confirmar que tem 18 anos ou mais.{" "}
          <strong>Não guardamos a data</strong>: fica só o registro de que a maioridade foi verificada e quando.
        </li>
        <li>
          <strong>Aceite dos termos.</strong> A versão dos Termos de uso e desta política que você aceitou e a data.
        </li>
        <li>
          <strong>Perfil.</strong> Nome de exibição, username, bio, avatar e os gostos que você marcar. É o que os
          outros veem e o que usamos para encontrar gente parecida com você. Base legal: execução do contrato.
        </li>
        <li>
          <strong>O que você faz no app.</strong> Posts, quem você segue, quem você bloqueou, as denúncias que fez e
          os pedidos de tag nova que enviou.
        </li>
        <li>
          <strong>De qual post veio um follow.</strong> Quando você segue alguém a partir de um post, guardamos de qual
          post foi, para contar a essa pessoa. Seguir pelo perfil ou por outra tela não guarda nada disso.
        </li>
        <li>
          <strong>Eventos.</strong> O que você escreve ao criar um evento (título, descrição, data, local geral, local
          exato ou link, vagas e tags) e os eventos em que você pediu para participar, confirmou presença ou não foi
          aceito. Base legal: execução do contrato.
        </li>
        <li>
          <strong>Mensagens diretas.</strong> O texto e os GIFs das conversas que você tem com quem você segue e que
          te segue de volta, para entregá-las à outra pessoa. Guardamos também até onde você leu cada conversa, só
          para mostrar a você o que é novo.
        </li>
        <li>
          <strong>Notificações dentro do app.</strong> Quem começou a te seguir (e por qual post seu, se foi por um
          post), quando você e alguém passam a se seguir, o resultado da análise da sua foto e das suas denúncias,
          mudanças nos Termos, conquistas novas, o que acontece nos eventos em que você está e o aviso de que você
          entrou para a equipe. Só você lê as suas, e elas são apagadas depois de 60 dias.
        </li>
        <li>
          <strong>Conquistas.</strong> Quais você ganhou, quando, e se cada uma aparece no seu perfil.
        </li>
        <li>
          <strong>Avisos no aparelho, se você ativar.</strong> O endereço que o seu navegador cria para receber avisos
          neste aparelho, e quais tipos de aviso você escolheu. Você desliga quando quiser em Configurações.
        </li>
        <li>
          <strong>Registros técnicos.</strong> Os serviços que hospedam o app registram endereço IP, data e hora dos
          acessos, por segurança e por obrigação legal (Marco Civil da Internet, art. 15). O Peripatos não grava em
          seus registros código de acesso, e-mail, RA nem tokens.
        </li>
      </ul>
      <p>
        Não coletamos a localização do seu aparelho, contatos, nem dados de pagamento. O local de um evento é o que
        quem organiza escreve, e nada mais. Não há anúncios nem rastreadores.
      </p>

      <h2>O que ninguém vê</h2>
      <ul>
        <li>
          <strong>Seu e-mail nunca aparece</strong> para nenhum outro usuário, nem para a moderação. Ele fica numa área
          do banco de dados que o aplicativo não consegue ler.
        </li>
        <li>Quem você bloqueou não é avisado, e quem você denunciou não sabe que foi você.</li>
      </ul>

      <h2>Quem aparece para quem</h2>
      <ul>
        <li>
          Seu perfil, seus posts e seus gostos aparecem só para alunos da sua instituição. Quem você bloqueou, e quem
          bloqueou você, não vê nada seu.
        </li>
        <li>
          <strong>Recém-chegados.</strong> Durante os 14 dias seguintes à conclusão do seu cadastro, seu perfil pode
          aparecer numa lista de &ldquo;Recém-chegados&rdquo; para as pessoas da sua instituição, junto com os gostos
          que vocês têm em comum. A lista vem em ordem de chegada e <strong>não mostra a data</strong> em que você
          entrou. Ela usa um registro que já existia (quando a sua maioridade foi verificada) e não aparece para quem
          você bloqueou.
        </li>
        <li>
          <strong>Seguir pelo post.</strong> Se você segue alguém a partir de um post dessa pessoa, ela recebe a
          notificação &ldquo;te seguiu pelo seu post&rdquo;, com o começo do texto do post. <strong>Só ela vê</strong>
          : esse registro não aparece para mais ninguém, não é lido pela moderação e não vira contagem em lugar nenhum.
          Se o post for apagado, a notificação fica sem o trecho.
        </li>
      </ul>

      <h2>Eventos</h2>
      <p>
        Um evento diz onde alguém vai estar e quando. Por isso o que cada pessoa enxerga é limitado, e a limitação é
        feita no banco de dados, não só na tela:
      </p>
      <ul>
        <li>
          <strong>Toda a sua instituição vê</strong> o título, a descrição, a data, o local geral (por exemplo
          &ldquo;no campus&rdquo;), as tags e quem organiza. Se o evento tem vagas, vê também quantas sobram. Sem
          vagas, nenhum número aparece.
        </li>
        <li>
          <strong>Quem vai, o local exato e o link</strong> de um evento online só aparecem para quem organiza e para
          quem já está confirmado (ou foi aceito). Quem pediu para participar e ainda espera resposta não vê nenhum
          dos três.
        </li>
        <li>
          <strong>A moderação e a administração não têm acesso</strong> à lista de quem vai, ao local exato nem ao
          link, a não ser nos eventos em que elas mesmas participam, como qualquer pessoa.
        </li>
        <li>
          Bloqueio, em qualquer direção, esconde o evento e esconde que a outra pessoa vai a um evento de terceiros.
          Um evento que já aconteceu ou foi cancelado só continua visível para quem organizou ou estava nele.
        </li>
        <li>
          <strong>Se alguém denunciar um evento</strong>, a moderação recebe uma cópia do título, da descrição e do
          local geral, feita na hora da denúncia, junto com quem organiza. Ela não recebe o local exato, o link nem a
          lista de quem vai.
        </li>
        <li>
          Se o seu pedido para participar não for aceito, ou se quem organiza tirar você do evento, você não é
          avisado e nenhum motivo é guardado. Esse registro fica só para o pedido não se repetir.
        </li>
        <li>
          <strong>Se um evento for cancelado</strong>, quem ia (e quem tinha pedido para ir) recebe uma notificação
          com o título do evento. Essa notificação guarda o título por até 60 dias,{" "}
          <strong>mesmo que a conta de quem organizava seja excluída</strong>: sem ele, quem ia não saberia qual
          evento deixou de acontecer. É o único texto de uma conta excluída que continua existindo, e some com a
          notificação.
        </li>
        <li>
          Quem vai recebe um lembrete duas horas antes. Se você ativar os avisos de evento no aparelho, eles não dizem
          o título, o local nem o nome de ninguém.
        </li>
      </ul>
      <p>
        <strong>Recomendamos marcar eventos presenciais em lugar público</strong> e movimentado, e avisar alguém de
        confiança aonde você vai. O Peripatos não confere quem aparece nem o que acontece num evento.
      </p>

      <h2>Mensagens diretas</h2>
      <ul>
        <li>
          <strong>Só as duas pessoas da conversa leem as mensagens.</strong> A moderação e a administração não têm
          acesso a conversas.
        </li>
        <li>
          <strong>Não existe confirmação de leitura nem aviso de &ldquo;digitando&rdquo;.</strong> A outra pessoa não
          fica sabendo se você abriu a conversa. O registro de até onde você leu é visível só para você.
        </li>
        <li>
          <strong>Se você denunciar uma mensagem</strong>, uma cópia dela (e só dela) vai para a moderação, junto com
          quem a enviou. O resto da conversa continua fora do alcance da moderação. Do mesmo modo, uma mensagem sua
          pode ser copiada para a moderação se a outra pessoa a denunciar.
        </li>
        <li>
          Você pode apagar uma mensagem sua: ela some para os dois. Se ela já tiver sido denunciada, a cópia da
          denúncia permanece.
        </li>
        <li>Se vocês deixarem de se seguir, a conversa continua legível para os dois, mas não aceita mensagens novas.</li>
        <li>Se um bloquear o outro, a conversa deixa de aparecer para os dois.</li>
        <li>
          Se a outra pessoa excluir a conta, as mensagens dela são apagadas. As suas continuam com você, e você pode
          apagá-las quando quiser.
        </li>
        <li>
          As mensagens não têm criptografia de ponta a ponta: ficam guardadas no nosso banco de dados, protegidas
          pelas regras de acesso acima.
        </li>
      </ul>

      <h2>Notificações</h2>
      <ul>
        <li>
          A aba de notificações é só sua: ninguém mais lê, nem a moderação. O aviso de que uma denúncia sua foi
          analisada não diz o que foi decidido sobre a outra pessoa.
        </li>
        <li>
          Se você bloquear alguém, as notificações entre vocês são apagadas. Se alguém excluir a conta, as notificações
          que falavam dessa pessoa também são.
        </li>
        <li>Notificações com mais de 60 dias são apagadas automaticamente.</li>
      </ul>
      <p>
        Se você ativar os avisos no aparelho, escolhe quais tipos quer receber. O de mensagem{" "}
        <strong>diz só de quem é</strong>, nunca o que a pessoa escreveu; os outros dizem só o que aconteceu, sem o
        nome de ninguém. O aviso é entregue pelo serviço de notificações do seu navegador ou sistema (Google, Mozilla,
        Apple ou Microsoft), que recebe o aviso cifrado e sabe que o seu aparelho recebeu uma notificação do Peripatos.
        No iPhone e no iPad, só funciona com o Peripatos instalado na tela de início.
      </p>

      <h2>Conquistas</h2>
      <ul>
        <li>
          As conquistas são dadas automaticamente, a partir do que já está guardado: seus posts, suas mensagens (só o
          fato de existirem e a hora, nunca o conteúdo), seu perfil, seus gostos, a idade da conta, quando você
          concluiu o cadastro, as pessoas com quem você se segue mutuamente (e quando passaram a se seguir), seus
          pedidos de tag aprovados e os eventos que você organizou ou a que confirmou presença. Duas delas são dadas
          à mão pela administração. Tags sensíveis nunca contam para conquista nenhuma.
        </li>
        <li>
          <strong>Não registramos seus acessos nem o tempo que você passa no app.</strong> A conquista que depende de
          horário usa a hora em que você publicou um post ou enviou uma mensagem, que já era guardada, e nasce
          escondida do seu perfil.
        </li>
        <li>
          Suas conquistas aparecem no seu perfil e na página de cada conquista, para quem pode ver o seu perfil. Você
          pode esconder qualquer uma. A data em que você ganhou só você vê.
        </li>
        <li>Uma conquista ganha é permanente: ela só some se você excluir a conta.</li>
      </ul>

      <h2>Tags sensíveis</h2>
      <p>
        Orientação sexual, identidade de gênero e religião são dados sensíveis pela LGPD. Marcar qualquer uma é
        opcional e depende de um <strong>consentimento específico</strong>, pedido à parte, na hora em que você abre
        essa seção (LGPD, art. 11, I). Elas têm regras próprias:
      </p>
      <ul>
        <li>
          <strong>Só aparecem para quem você segue e que te segue de volta</strong> (seguimento mútuo). Seguir alguém
          de volta é o que dá a essa pessoa acesso a elas.
        </li>
        <li>
          <strong>Não são tratadas como gostos.</strong> Não entram no cálculo de afinidade nem na contagem de
          &ldquo;em comum&rdquo; com ninguém, nem com quem você segue mutuamente: não influenciam quem aparece para
          você, nem para quem você aparece, e a ordem das sugestões não as revela.
        </li>
        <li>No perfil, ficam numa seção à parte (&ldquo;Sobre&rdquo;), que só quem você segue mutuamente vê.</li>
        <li>A moderação e a administração não conseguem lê-las.</li>
        <li>Para tirar o acesso de alguém, remova a pessoa dos seus seguidores ou bloqueie.</li>
        <li>
          <strong>Você pode retirar o consentimento quando quiser</strong>, em Configurações → Gostos. Todas essas tags
          são apagadas na hora, junto com o registro do consentimento.
        </li>
      </ul>

      <h2>Moderação e administração</h2>
      <p>A equipe que cuida do Peripatos tem dois papéis, e o cargo de cada pessoa aparece no perfil dela:</p>
      <ul>
        <li>
          <strong>Moderação.</strong> Lê a fila de denúncias, oculta posts e eventos, aprova e recusa fotos de perfil e
          bane contas de usuários comuns.
        </li>
        <li>
          <strong>Administração.</strong> Faz tudo o que a moderação faz e, além disso, nomeia e remove quem modera,
          desfaz banimentos, aprova pedidos de tag, concede as conquistas dadas à mão e ajusta as datas do
          beta e da abertura pública.
        </li>
        <li>
          A moderação não age sobre quem é da própria equipe: banir, ocultar o que essa pessoa publicou, decidir sobre
          a foto dela ou resolver uma denúncia contra ela cabe só à administração. Ninguém muda o próprio cargo.
        </li>
        <li>
          <strong>Quem é nomeado recebe uma notificação</strong> e só consegue agir depois de ativar a verificação em
          duas etapas. Toda nomeação e toda remoção ficam registradas, com quem fez e o motivo.
        </li>
        <li>
          Nenhum dos dois papéis lê seu e-mail, suas conversas, suas tags sensíveis, nem a lista de quem vai, o local
          exato ou o link dos eventos.
        </li>
      </ul>

      <h2>Menores de 18</h2>
      <p>
        O Peripatos não é para menores. Se a data de nascimento informada for de menor de 18, o cadastro inteiro é
        apagado na mesma hora, incluindo o e-mail. Nada fica guardado.
      </p>

      <h2>Foto de perfil</h2>
      <p>
        Se você enviar uma foto, ela é reprocessada nos nossos servidores para remover os dados escondidos no arquivo
        (como o local e o aparelho onde foi tirada), o arquivo original é apagado, e a foto passa por moderação antes
        de aparecer para os outros.
      </p>

      <h2>Quem processa os dados por nós (operadores)</h2>
      <ul>
        <li>
          <strong>Supabase</strong> (Supabase Inc.): banco de dados, login e armazenamento das fotos.
        </li>
        <li>
          <strong>Vercel</strong> (Vercel Inc.): hospedagem do site. Recebe seu endereço IP a cada acesso.
        </li>
        <li>
          <strong>Google</strong> (Gmail): envio do e-mail com o código de acesso. Recebe seu endereço de e-mail e o
          código.
        </li>
        <li>
          <strong>Serviços de notificação dos navegadores</strong> (Google, Mozilla, Apple, Microsoft): só se você
          ativar as notificações. Recebem um aviso cifrado com o nome de quem te escreveu, ou só com o tipo do aviso.
        </li>
        <li>
          <strong>Giphy</strong> (Giphy, Inc.): busca e exibição de GIFs. As buscas saem do nosso servidor, sem dizer
          quem você é. Mas <strong>a imagem do GIF é carregada pelo seu navegador direto dos servidores do Giphy</strong>,
          que por isso enxerga seu endereço IP e o tipo de navegador, tanto ao escolher um GIF quanto ao ver um post
          com GIF. Não enviamos ao Giphy seu nome, e-mail ou perfil.
        </li>
      </ul>
      <p>Não vendemos dados e não os compartilhamos com mais ninguém, salvo ordem judicial.</p>

      <h2>Transferência internacional</h2>
      <p>
        Esses serviços são de empresas dos Estados Unidos e podem processar dados fora do Brasil. O banco de dados fica
        hospedado em São Paulo, mas e-mails, acessos ao site e GIFs passam por servidores no exterior. A transferência
        se apoia nas cláusulas contratuais desses fornecedores (LGPD, art. 33).
      </p>

      <h2>Por quanto tempo</h2>
      <ul>
        <li>Enquanto sua conta existir. Ao excluir a conta, os dados são apagados na hora (veja abaixo).</li>
        <li>Registros de acesso dos serviços de hospedagem: pelo prazo de cada fornecedor, no mínimo 6 meses.</li>
        <li>
          Cópias de segurança: guardamos cópias cifradas do banco por até 30 dias. Uma conta excluída some das cópias
          quando a última delas vence.
        </li>
      </ul>

      <h2>Seus direitos</h2>
      <ul>
        <li>
          <strong>Acesso e portabilidade.</strong> Você vê seus dados de perfil no próprio app. Para receber uma cópia
          de tudo o que temos sobre você, escreva para o encarregado.
        </li>
        <li>
          <strong>Correção.</strong> Nome, username, bio, gostos e avatar você mesmo altera em Configurações.
        </li>
        <li>
          <strong>Retirar consentimento.</strong> O das tags sensíveis, em Configurações, a qualquer momento.
        </li>
        <li>
          <strong>Exclusão.</strong> Em Configurações, &ldquo;Excluir minha conta&rdquo; apaga de vez seu perfil, posts,
          gostos, seguidores, bloqueios, foto, as mensagens que você escreveu e seu login. As mensagens que a outra
          pessoa escreveu continuam com ela, numa conversa que passa a aparecer como sendo com uma &ldquo;conta
          excluída&rdquo;. Os eventos que você organizava são cancelados e apagados (quem ia é avisado), e suas
          participações em eventos dos outros saem.
        </li>
        <li>
          <strong>Reclamar.</strong> Se achar que seus dados foram tratados de forma errada, fale com o encarregado.
          Você também pode recorrer à Autoridade Nacional de Proteção de Dados (ANPD).
        </li>
      </ul>
      <p>Respondemos aos pedidos em até 15 dias.</p>

      <h2>O que permanece depois da exclusão</h2>
      <ul>
        <li>
          Se a conta foi banida, guardamos um código derivado do e-mail (um HMAC, que não permite recuperar o e-mail)
          para impedir novo cadastro.
        </li>
        <li>
          Os registros de ações de moderação continuam, sem ligação com a sua conta, acompanhados do mesmo tipo de
          código, para reconhecer reincidência.
        </li>
        <li>
          Se você organizava um evento que ainda ia acontecer, o <strong>título</strong> dele fica na notificação de
          cancelamento de quem ia, por até 60 dias. A notificação não diz quem organizava.
        </li>
        <li>Nada mais: nem e-mail, nem o restante do que você publicou.</li>
      </ul>

      <h2>Cookies e o que fica neste aparelho</h2>
      <p>
        Usamos <strong>apenas cookies essenciais</strong>: os que mantêm você conectado. Não há cookies de publicidade,
        de análise ou de terceiros, e por isso não há um aviso pedindo que você os aceite. O aplicativo instalado não
        guarda seu feed nem seus dados no aparelho: ao sair, não sobra nada para a próxima pessoa que usar o mesmo
        celular ou computador.
      </p>

      <h2>Segurança e incidentes</h2>
      <p>
        O acesso aos dados é controlado no próprio banco, a moderação usa verificação em duas etapas, e as fotos têm os
        metadados removidos. Se acontecer um incidente de segurança que possa trazer risco a você, avisaremos você e a
        ANPD, como a lei exige.
      </p>

      <h2>Mudanças</h2>
      <p>
        Se esta política ou os Termos mudarem, na próxima vez que você entrar o app mostra o que mudou e pede um novo
        aceite. Sem ele não dá para continuar usando; você pode sair ou excluir a conta.
      </p>
    </PaginaLegal>
  );
}
