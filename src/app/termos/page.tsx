import type { Metadata } from "next";
import { PaginaLegal } from "@/components/PaginaLegal";
import { TERMOS_VERSAO } from "@/lib/legal";

export const metadata: Metadata = { title: "Termos de uso" };

export default function Termos() {
  return (
    <PaginaLegal titulo="Termos de uso">
      <p>
        O Peripatos é uma rede para universitários encontrarem gente com gostos parecidos. Não é um aplicativo de
        namoro e não é anônimo: cada conta corresponde a um e-mail institucional. Versão {TERMOS_VERSAO}.
      </p>
      <p>
        Você aceita estes termos e a Política de privacidade ao criar seu perfil. Guardamos qual versão você aceitou e
        quando. O uso é gratuito: não há planos pagos, cobranças nem anúncios.
      </p>

      <h2>Quem pode usar</h2>
      <ul>
        <li>Só maiores de 18 anos. Se você informar uma data de nascimento de menor, seu cadastro é apagado na hora.</li>
        <li>Só quem tem um e-mail de aluno de uma instituição participante. Uma conta por pessoa.</li>
      </ul>

      <h2>Sem vínculo com universidades</h2>
      <p>
        O Peripatos é um projeto independente. Não é afiliado, patrocinado nem endossado por nenhuma universidade,
        inclusive aquelas cujos e-mails são aceitos no cadastro. O e-mail institucional serve só para confirmar que
        você é aluno. Nomes e marcas de instituições citados no app pertencem a elas e aparecem apenas para indicar
        quais e-mails são aceitos.
      </p>

      <h2>O que não pode</h2>
      <ul>
        <li>
          <strong>Expor terceiros identificáveis.</strong> Não publique nome, foto, contato, endereço, conversa privada
          ou qualquer coisa que permita identificar outra pessoa sem que ela tenha concordado. Isso vale para colegas,
          professores e funcionários.
        </li>
        <li>
          <strong>Assédio.</strong> Perseguir, intimidar, insistir depois de um não, ou usar o que alguém marcou no
          perfil para constranger.
        </li>
        <li>
          <strong>Discurso de ódio.</strong> Atacar pessoas por raça, cor, etnia, origem, religião, gênero, orientação
          sexual, identidade de gênero, deficiência ou condição de saúde.
        </li>
        <li>Ameaças, incitação à violência, conteúdo sexual, spam e golpes.</li>
        <li>Fingir ser outra pessoa, ou criar contas para escapar de um bloqueio ou banimento.</li>
        <li>Revelar a alguém de fora o que você só vê porque duas pessoas se seguem (as tags com cadeado).</li>
      </ul>

      <h2>Mensagens diretas</h2>
      <ul>
        <li>Só dá para conversar com quem você segue e que te segue de volta. Não há grupos.</li>
        <li>As mesmas regras valem nas conversas: assédio, ameaça e exposição de terceiros não são permitidos.</li>
        <li>
          A moderação não lê conversas. Ela só vê uma mensagem quando quem a recebeu denuncia: aí recebe uma cópia
          daquela mensagem.
        </li>
        <li>Insistir depois que a pessoa deixou de te seguir ou te bloqueou, por qualquer meio, é assédio.</li>
      </ul>

      <h2>Eventos</h2>
      <p>
        Qualquer pessoa pode marcar um evento, presencial ou online, para gente da própria instituição. As regras
        acima valem inteiras nos eventos, e mais estas:
      </p>
      <ul>
        <li>
          <strong>Quem organiza é responsável pelo que marca</strong>: pelo que escreve no evento, pelo lugar ou pelo
          link que escolhe e por quem aceita. O Peripatos só oferece a ferramenta. Ele não organiza, não confere e
          não acompanha nenhum evento, e não responde pelo que acontece neles.
        </li>
        <li>
          <strong>Não use um evento para assediar ou perseguir ninguém.</strong> Isso inclui marcar um evento para
          atrair ou constranger uma pessoa, aparecer onde alguém vai para forçar um encontro, e insistir depois de
          ter o pedido recusado ou de ter sido removido.
        </li>
        <li>
          <strong>Não divulgue o endereço de terceiros.</strong> Não marque evento na casa de outra pessoa, nem
          escreva o endereço de alguém, sem que ela tenha concordado. O campo de local geral aparece para toda a
          instituição: não ponha endereço nele.
        </li>
        <li>
          O local exato, o link e a lista de quem vai são só para quem está no evento. Não repasse nenhum deles para
          quem não está.
        </li>
        <li>
          Quem organiza pode recusar um pedido ou remover um participante sem explicar. Quem não foi aceito não deve
          procurar a pessoa por outros meios para cobrar o motivo.
        </li>
      </ul>
      <p>
        <strong>Recomendamos marcar eventos presenciais em lugar público</strong> e movimentado, principalmente com
        gente que você ainda não conhece, e avisar alguém de confiança aonde você vai.
      </p>

      <h2>O que acontece se alguém descumprir</h2>
      <ul>
        <li>
          Qualquer pessoa pode denunciar um post, um perfil, um evento ou uma mensagem que recebeu. Quem foi denunciado
          não fica sabendo quem denunciou.
        </li>
        <li>A moderação pode ocultar posts e eventos, recusar fotos de perfil e banir contas.</li>
        <li>
          A equipe tem dois papéis. A <strong>moderação</strong> cuida das denúncias, dos posts, dos eventos, das
          fotos e dos banimentos de usuários comuns. A <strong>administração</strong> faz tudo isso e também nomeia e
          remove quem modera, desfaz banimentos e decide o que envolve alguém da própria equipe. Quem é nomeado é
          avisado, e ninguém muda o próprio cargo.
        </li>
        <li>Ocultar um evento, ou banir quem o organizava, cancela o evento e avisa quem ia.</li>
        <li>
          Uma conta banida perde o acesso e o e-mail não consegue se cadastrar de novo. Excluir a conta não desfaz o
          banimento.
        </li>
        <li>Toda ação de moderação fica registrada com quem a tomou e o motivo.</li>
      </ul>

      <h2>Seu conteúdo</h2>
      <p>
        O que você publica é seu e é sua responsabilidade, inclusive os eventos que você marca. Ao publicar, você
        autoriza o Peripatos a exibir esse conteúdo para os outros alunos da sua instituição, dentro das regras de
        visibilidade do app. Posts só têm texto
        e GIFs do Giphy; não há envio de imagens em posts.
      </p>

      <h2>Sair</h2>
      <p>
        Você pode excluir sua conta a qualquer momento em Configurações. A exclusão apaga seus dados de verdade; os
        detalhes estão na Política de privacidade.
      </p>

      <h2>Mudanças e contato</h2>
      <p>
        Estes termos podem mudar; quando mudarem, o app mostra o que mudou e pede um novo aceite antes de você continuar.
        Responsável pelo Peripatos: <strong>[NOME DO RESPONSÁVEL, a definir]</strong>. Dúvidas:{" "}
        <strong>contato@EXEMPLO.com.br</strong> (endereço provisório, a definir).
      </p>
    </PaginaLegal>
  );
}
