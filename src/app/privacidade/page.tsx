import type { Metadata } from "next";
import { PaginaLegal } from "@/components/PaginaLegal";

export const metadata: Metadata = { title: "Política de privacidade" };

export default function Privacidade() {
  return (
    <PaginaLegal titulo="Política de privacidade">
      <p>
        Esta página explica quais dados o Peripatos guarda, para quê, quem vê cada um e como você exerce seus direitos
        pela Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).
      </p>

      <h2>O que coletamos e por quê</h2>
      <ul>
        <li>
          <strong>E-mail institucional.</strong> Para confirmar que você é aluno de uma instituição participante e para
          enviar o código de acesso. Não enviamos propaganda.
        </li>
        <li>
          <strong>RA (o número que faz parte do seu e-mail).</strong> Para garantir uma conta por aluno.
        </li>
        <li>
          <strong>Data de nascimento.</strong> Só para confirmar que você tem 18 anos ou mais.
        </li>
        <li>
          <strong>Perfil.</strong> Nome de exibição, username, bio, avatar e os gostos que você marcar. É o que os
          outros veem e o que usamos para encontrar gente parecida com você.
        </li>
        <li>
          <strong>O que você faz no app.</strong> Posts, quem você segue, quem você bloqueou e as denúncias que fez.
        </li>
      </ul>

      <h2>O que ninguém vê</h2>
      <ul>
        <li>
          <strong>Seu e-mail e seu RA nunca aparecem</strong> para nenhum outro usuário, nem para a moderação. Eles
          ficam numa área do banco de dados que o aplicativo não consegue ler.
        </li>
        <li>Sua data de nascimento não aparece para ninguém.</li>
        <li>Quem você bloqueou não é avisado, e quem você denunciou não sabe que foi você.</li>
      </ul>

      <h2>Tags sensíveis</h2>
      <p>
        Orientação sexual, identidade de gênero e religião são dados sensíveis pela LGPD. Marcar qualquer uma é
        opcional, e elas têm regras próprias:
      </p>
      <ul>
        <li>
          <strong>Só aparecem para quem você segue e que te segue de volta</strong> (seguimento mútuo). Seguir alguém
          de volta é o que dá a essa pessoa acesso a elas.
        </li>
        <li>Não entram no cálculo de afinidade com quem não é mútuo, então nem a ordem das sugestões as revela.</li>
        <li>A moderação e a administração não conseguem lê-las.</li>
        <li>Para tirar o acesso de alguém, remova a pessoa dos seus seguidores ou bloqueie.</li>
      </ul>

      <h2>Menores de 18</h2>
      <p>
        O Peripatos não é para menores. Se a data de nascimento informada for de menor de 18, o cadastro inteiro é
        apagado na mesma hora: e-mail, RA e a própria data. Nada fica guardado.
      </p>

      <h2>Foto de perfil</h2>
      <p>
        Se você enviar uma foto, ela é reprocessada nos nossos servidores para remover os dados escondidos no arquivo
        (como o local e o aparelho onde foi tirada), o arquivo original é apagado, e a foto passa por moderação antes
        de aparecer para os outros.
      </p>

      <h2>Com quem compartilhamos</h2>
      <ul>
        <li>
          <strong>Supabase</strong> (banco de dados, login e arquivos) e <strong>Vercel</strong> (hospedagem do site)
          processam os dados em nosso nome.
        </li>
        <li>
          <strong>Giphy</strong>: ao buscar ou ver um GIF, seu navegador carrega a imagem direto do Giphy, que pode
          registrar seu endereço IP. Não enviamos ao Giphy quem você é.
        </li>
        <li>Não vendemos dados e não exibimos anúncios.</li>
      </ul>

      <h2>Seus direitos</h2>
      <ul>
        <li>
          <strong>Acesso.</strong> Você vê seus dados de perfil no próprio app. Para receber uma cópia de tudo o que
          temos sobre você, escreva para o contato abaixo.
        </li>
        <li>
          <strong>Correção.</strong> Nome, username, bio, gostos e avatar você mesmo altera em Configurações. Para
          corrigir a data de nascimento, escreva para o contato abaixo.
        </li>
        <li>
          <strong>Exclusão.</strong> Em Configurações, &ldquo;Excluir minha conta&rdquo; apaga de vez seu perfil, posts,
          gostos, seguidores, bloqueios, foto, RA, data de nascimento e seu login.
        </li>
      </ul>

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
        <li>Nada mais: nem e-mail, nem RA, nem conteúdo.</li>
      </ul>

      <h2>Neste aparelho</h2>
      <p>
        Usamos cookies só para manter você conectado. O aplicativo instalado não guarda seu feed nem seus dados no
        aparelho: ao sair, não sobra nada para a próxima pessoa que usar o mesmo celular ou computador.
      </p>

      <h2>Contato</h2>
      <p>
        Encarregado pelo tratamento de dados: <strong>privacidade@EXEMPLO.com.br</strong> (endereço provisório, a
        definir antes do lançamento).
      </p>
    </PaginaLegal>
  );
}
