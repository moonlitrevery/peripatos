# Backup e restauração

**O plano grátis do Supabase não inclui backup restaurável.** Backups diários automáticos existem a partir do plano Pro (7 dias de retenção) e a recuperação a um ponto no tempo (PITR) é um adicional pago. A própria documentação recomenda que projetos no plano grátis exportem os dados com `supabase db dump` e guardem cópias fora do Supabase. Fonte: [Database Backups](https://supabase.com/docs/guides/platform/backups), consultada em 2026-10-07.

Enquanto o Peripatos estiver no plano grátis, o backup é este, feito por nós. No Pro, ele continua valendo como segunda cópia, fora do fornecedor.

> O backup contém dados pessoais, inclusive dados sensíveis (orientação sexual, identidade de gênero, religião). **Nunca existe um dump em claro em disco**, nem temporário: os scripts decifram e cifram em pipe. Não rode `supabase db dump -f arquivo.sql` "só para olhar".

## O que entra e o que não entra

| | Entra? | Observação |
| --- | --- | --- |
| Dados de `public`, `private` e `auth` | Sim | Contas, perfis, posts, tags, follows, bloqueios, denúncias, registro de moderação, banimentos |
| Segredo do HMAC (Vault) | Sim | Vai como um comando SQL no fim do arquivo. Sem ele, um banco restaurado não reconhece os banidos nem os RAs já cadastrados |
| Schema (tabelas, RLS, funções) | Não | Está em `supabase/migrations`, no git |
| Fotos de avatar | **Não** | O Storage não faz parte do dump do banco. Depois de uma restauração todos voltam ao avatar pronto e reenviam a foto |
| Configuração do Auth, SMTP, limites | Não | É refeita pelo painel, seguindo `docs/deploy.md` |

## Uma vez: criar o par de chaves

A criptografia é assimétrica (GPG). A máquina que faz backup só precisa da chave **pública**. A chave **privada** só é usada para restaurar.

```bash
gpg --quick-generate-key "Backup Peripatos <backup@EXEMPLO.com.br>" ed25519 cert never
gpg --quick-add-key <FINGERPRINT> cv25519 encr never
gpg --armor --export-secret-keys <FINGERPRINT>   # cole no gerenciador de senhas
gpg --armor --export <FINGERPRINT> > backup-peripatos.pub   # esta pode circular
```

- A chave privada, protegida por senha forte, fica em **dois** lugares que não sejam o computador do dia a dia: o gerenciador de senhas e uma mídia offline.
- **Quem perde a chave privada perde todos os backups.** Não há recuperação.
- Faça um ensaio de restauração (abaixo) antes de confiar nela.

## Fazer um backup

```bash
BACKUP_DESTINATARIO=<FINGERPRINT> scripts/backup-criptografado.sh            # projeto hospedado (supabase link)
BACKUP_DESTINATARIO=<FINGERPRINT> scripts/backup-criptografado.sh --local    # ensaio no banco local
```

O arquivo sai em `backups/peripatos-<data>.sql.gpg` (a pasta está no `.gitignore`). O script falha, e não deixa arquivo, se o dump vier vazio ou se a chave do Vault não puder ser lida.

**Onde guardar o `.gpg`:** fora do Supabase e fora deste computador. Um bucket privado de outro provedor ou um disco externo servem. Mesmo cifrado, é dado pessoal: acesso restrito, e apague os antigos.

**Frequência sugerida para o beta:** uma vez por dia enquanto houver uso, e sempre antes de `supabase db push`. Retenção: 30 dias. Um backup de exclusão antiga ainda contém quem pediu para ser excluído; por isso a retenção curta, e por isso a política de privacidade precisa mencionar o prazo.

## Restaurar

Precisa da chave privada nesta máquina (`gpg --import`) e do Docker.

**1. Um banco vazio com as migrations aplicadas.**

```bash
# ensaio local
pnpm exec supabase db reset --no-seed

# hospedado: projeto NOVO (ou o mesmo, depois de recriado), ligado com `supabase link`
pnpm exec supabase db push
```

**2. Restaurar.**

```bash
scripts/restaurar-backup.sh backups/peripatos-<data>.sql.gpg --local
scripts/restaurar-backup.sh backups/peripatos-<data>.sql.gpg --db-url 'postgresql://postgres:<senha>@<host>:5432/postgres'
```

O script se recusa a rodar se o banco de destino já tiver usuários, roda tudo numa transação (ou restaura tudo, ou nada) e, no fim, põe todos os perfis no avatar pronto, porque as fotos não vêm no backup.

**3. Depois de restaurar.**

- [ ] Refazer a configuração do painel (hook, SMTP, limites, template): `docs/deploy.md`, passos 5 a 8.
- [ ] `supabase functions deploy processar-avatar`.
- [ ] `pnpm verificar:deploy <URL> <chave publishable>`.
- [ ] Projeto novo tem URL e chaves novas: atualizar as variáveis no Vercel e fazer *Redeploy*.
- [ ] A staff precisa cadastrar o autenticador de novo? **Não**: os fatores de MFA vêm no backup (schema `auth`).
- [ ] Avisar os usuários de que as fotos precisam ser reenviadas.
- [ ] Se a restauração foi por causa de um incidente: `docs/incidentes.md`.

## O que foi ensaiado

No banco local, em 2026-10-07: backup, `db reset --no-seed`, restauração. Voltaram todas as contas, perfis, posts, tags sensíveis, follows e aceites de termos; a chave do HMAC voltou (o HMAC de um e-mail conhecido e o de todos os RAs bateram com os de antes), e o arquivo `.gpg` não continha nenhum texto em claro.

**Não foi ensaiado:** restauração num projeto hospedado (`--db-url`). Faça uma vez num projeto de teste antes de precisar.
