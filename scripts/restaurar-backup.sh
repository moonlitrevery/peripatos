#!/usr/bin/env bash
# Restaura um backup feito por scripts/backup-criptografado.sh.
#
# O arquivo é decifrado e entregue ao psql por um pipe: os dados em claro não
# são gravados em disco em nenhum momento.
#
# Uso:
#   scripts/restaurar-backup.sh <arquivo.sql.gpg> --local
#   scripts/restaurar-backup.sh <arquivo.sql.gpg> --db-url 'postgresql://postgres:<senha>@<host>:5432/postgres'
#
# O banco de destino precisa estar com as migrations aplicadas e SEM dados de
# usuários (`supabase db reset --no-seed` no local; projeto novo + `supabase db
# push` no hospedado). O script se recusa a rodar se já houver usuários.
#
# Roda tudo numa transação: se qualquer linha falhar, nada é restaurado.
# Precisa da chave PRIVADA do GPG nesta máquina. Ver docs/backup.md.
set -euo pipefail

arquivo="${1:?Informe o arquivo .sql.gpg}"
modo="${2:?Informe --local ou --db-url <url>}"
[ -f "$arquivo" ] || { echo "Arquivo não encontrado: $arquivo" >&2; exit 1; }

case "$modo" in
  --local)
    banco=$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1 || true)
    [ -n "$banco" ] || { echo "Nenhum contêiner supabase_db_* rodando." >&2; exit 1; }
    sql() { docker exec -i "$banco" psql -U postgres -v ON_ERROR_STOP=1 "$@"; }
    ;;
  --db-url)
    url="${3:?Informe a URL depois de --db-url}"
    sql() { docker run --rm -i postgres:17 psql "$url" -v ON_ERROR_STOP=1 "$@"; }
    ;;
  *) echo "Modo desconhecido: $modo" >&2; exit 2 ;;
esac

usuarios=$(sql -Atc "select count(*) from auth.users")
if [ "$usuarios" != "0" ]; then
  echo "O banco de destino já tem $usuarios usuário(s). Restaure só num banco recém-criado." >&2
  exit 1
fi

{
  # As migrations já criaram a instituição, o domínio, as tags e a lista de
  # serviços de push. O backup traz
  # os mesmos registros com os ids originais: saem os da migration.
  echo 'set client_min_messages = warning;'
  echo 'truncate public.institutions, public.tags, private.push_hosts cascade;'
  gpg --batch --quiet --decrypt "$arquivo"
  # As fotos não fazem parte do backup. Um perfil apontando para um arquivo
  # que não existe ficaria quebrado: todos voltam ao avatar pronto.
  echo "set session_replication_role = replica;"
  echo "update public.profiles set avatar_path = null, avatar_status = 'sem_avatar' where avatar_path is not null;"
  echo "reset session_replication_role;"
} | sql --single-transaction -q >/dev/null

echo "Restaurado."
sql -Atc "select (select count(*) from auth.users) || ' usuários, ' || (select count(*) from public.profiles) || ' perfis, ' || (select count(*) from public.posts) || ' posts'"
echo "As fotos de avatar não fazem parte do backup: todos os perfis voltaram ao avatar pronto."
echo "Confira o que falta em docs/backup.md, seção 'Depois de restaurar'."
