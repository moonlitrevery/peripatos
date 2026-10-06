import type { Metadata } from "next";
import { PaginaLegal } from "@/components/PaginaLegal";

export const metadata: Metadata = { title: "Termos de uso" };

export default function Termos() {
  return (
    <PaginaLegal titulo="Termos de uso">
      <p>
        O Peripatos é uma rede para universitários encontrarem gente com gostos parecidos. Não é um aplicativo de
        namoro e não é anônimo: cada conta corresponde a um e-mail institucional.
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
        você é aluno.
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

      <h2>O que acontece se alguém descumprir</h2>
      <ul>
        <li>Qualquer pessoa pode denunciar um post ou um perfil. Quem foi denunciado não fica sabendo quem denunciou.</li>
        <li>A moderação pode ocultar posts, recusar fotos de perfil e banir contas.</li>
        <li>
          Uma conta banida perde o acesso e o e-mail não consegue se cadastrar de novo. Excluir a conta não desfaz o
          banimento.
        </li>
        <li>Toda ação de moderação fica registrada com quem a tomou e o motivo.</li>
      </ul>

      <h2>Seu conteúdo</h2>
      <p>
        O que você publica é seu e é sua responsabilidade. Ao publicar, você autoriza o Peripatos a exibir esse
        conteúdo para os outros alunos da sua instituição, dentro das regras de visibilidade do app. Posts só têm texto
        e GIFs do Giphy; não há envio de imagens em posts.
      </p>

      <h2>Sair</h2>
      <p>
        Você pode excluir sua conta a qualquer momento em Configurações. A exclusão apaga seus dados de verdade; os
        detalhes estão na Política de privacidade.
      </p>

      <h2>Mudanças e contato</h2>
      <p>
        Estes termos podem mudar; avisaremos dentro do app antes de mudanças importantes. Dúvidas:{" "}
        <strong>contato@EXEMPLO.com.br</strong> (endereço provisório, a definir).
      </p>
    </PaginaLegal>
  );
}
