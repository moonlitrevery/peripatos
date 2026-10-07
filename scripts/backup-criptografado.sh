#!/usr/bin/env bash
# Backup dos DADOS do banco, criptografado antes de tocar o disco.
#
# O plano grátis do Supabase não tem backup restaurável. Este script exporta
# os dados com `supabase db dump` e os entrega direto ao GPG por um pipe: em
# nenhum momento existe um arquivo com os dados em claro, nem temporário. O
# que fica no disco é só o .gpg.
#
# O dump contém dados pessoais (e-mails, perfis, posts, tags sensíveis).
# Trate o arquivo criptografado como dado pessoal mesmo assim, e a chave
# privada como o segredo mais importante do projeto.
#
# Uso:
#   BACKUP_DESTINATARIO=<id ou e-mail da chave GPG> scripts/backup-criptografado.sh [--linked|--local] [pasta]
#
#   --linked  (padrão) o projeto hospedado ligado com `supabase link`
#   --local   o Supabase local (para ensaiar o backup e a restauração)
#   pasta     onde gravar o arquivo (padrão: ./backups, que está no .gitignore)
#
# A criptografia é assimétrica: a máquina que faz o backup só precisa da
# chave PÚBLICA. A chave privada fica fora dela (gerenciador de senhas ou
# mídia offline) e só é usada para restaurar. Ver docs/backup.md.
#
# O que NÃO entra, e por quê:
#   - o schema: está em supabase/migrations, no git;
#   - as fotos de avatar: o Storage não faz parte do dump do banco. Depois de
#     uma restauração todos voltam ao avatar pronto e reenviam a foto;
# O segredo do HMAC (Vault) ENTRA, como um comando SQL no fim do arquivo: sem
# ele os banimentos e a unicidade de RA não sobrevivem a uma restauração.
set -euo pipefail
umask 077

alvo="--linked"
pasta="backups"
for arg in "$@"; do
  case "$arg" in
    --linked|--local) alvo="$arg" ;;
    -*) echo "Opção desconhecida: $arg" >&2; exit 2 ;;
    *) pasta="$arg" ;;
  esac
done

: "${BACKUP_DESTINATARIO:?Defina BACKUP_DESTINATARIO com o id ou e-mail da chave GPG pública}"
command -v gpg >/dev/null || { echo "gpg não encontrado." >&2; exit 1; }
supabase="supabase"
command -v supabase >/dev/null || supabase="$(dirname "$0")/../node_modules/.bin/supabase"

if ! gpg --batch --list-keys "$BACKUP_DESTINATARIO" >/dev/null 2>&1; then
  echo "A chave pública '$BACKUP_DESTINATARIO' não está no chaveiro do GPG desta máquina." >&2
  exit 1
fi

mkdir -p "$pasta"
arquivo="$pasta/peripatos-$(date -u +%Y%m%dT%H%M%SZ).sql.gpg"

# Se qualquer etapa falhar, não fica um arquivo pela metade com cara de backup.
trap 'status=$?; if [ $status -ne 0 ]; then [ -f "$arquivo" ] && : > "$arquivo" && unlink "$arquivo"; echo "Backup FALHOU." >&2; fi' EXIT

# O segredo do HMAC (Vault) não sai no dump, mas sem ele um banco restaurado
# em outro projeto não reconhece os banidos nem os RAs já cadastrados: os
# HMACs guardados foram calculados com ESTA chave. Ela entra no mesmo fluxo
# criptografado, como um comando SQL que a restaura. Passa só por um pipe.
chave_hmac() {
  local chave
  chave=$("$supabase" db query "$alvo" -o csv \
    "select decrypted_secret from vault.decrypted_secrets where name = 'peripatos_ban_hmac_key'" 2>/dev/null | sed -n 2p | tr -d '\r"')
  if ! printf '%s' "$chave" | grep -Eq '^[0-9a-f]{64}$'; then
    echo "Não consegui ler o segredo peripatos_ban_hmac_key do Vault." >&2
    return 1
  fi
  printf '\n-- Segredo do HMAC de banimento e de RA (Vault)\n'
  printf "select vault.update_secret((select id from vault.secrets where name = 'peripatos_ban_hmac_key'), '%s');\n" "$chave"
}

# Só os schemas com dados do app. O schema storage fica de fora de propósito:
# ele guarda apenas o índice dos arquivos, e índice sem arquivo é pior do que
# nada (ver "Depois de restaurar" em docs/backup.md).
{ "$supabase" db dump "$alvo" --data-only --use-copy --schema public,private,auth 2>/dev/null; chave_hmac; } \
  | gpg --batch --yes --trust-model always --compress-algo zlib \
        --encrypt --recipient "$BACKUP_DESTINATARIO" --output "$arquivo"

# Um dump vazio criptografado ainda seria um arquivo "válido": confere o tamanho.
tamanho=$(stat -c %s "$arquivo")
if [ "$tamanho" -lt 2048 ]; then
  echo "O arquivo ficou pequeno demais ($tamanho bytes): o dump provavelmente veio vazio." >&2
  exit 1
fi

echo "Backup criptografado: $arquivo"
echo "Tamanho: $tamanho bytes"
echo "SHA-256: $(sha256sum "$arquivo" | cut -d' ' -f1)"
echo "Para restaurar: docs/backup.md"
