#!/usr/bin/env bash
# Conserta o gateway local do Supabase (Kong) quando a rede injeta um
# "search domain" no DNS.
#
# Sintoma: depois de `supabase start`, http://127.0.0.1:54321 não responde
# (as requisições ficam penduradas) ou o próprio `supabase start` trava em
# "health check".
#
# Causa: algumas redes (a do campus, por exemplo) entregam por DHCP um
# `search <dominio>` que vai parar no /etc/resolv.conf dos contêineres. O Kong
# tenta primeiro "supabase_rest_<projeto>.<dominio>"; se o DNS da rede responde
# qualquer nome com um IP (wildcard), o Kong manda as requisições para lá.
#
# O que este script faz: tira a linha `search` SÓ de dentro do contêiner do
# Kong e recarrega o Kong. Não altera nada no seu sistema. Precisa rodar de
# novo sempre que o contêiner for recriado (`supabase stop` + `start`).
#
# Correção permanente, se preferir: em /etc/docker/daemon.json,
#   { "dns-search": ["."] }   e reinicie o Docker.
set -euo pipefail

kong=$(docker ps --format '{{.Names}}' | grep '^supabase_kong_' | head -1 || true)
if [ -z "$kong" ]; then
  echo "Nenhum contêiner supabase_kong_* rodando. Rode 'supabase start' antes." >&2
  exit 1
fi

if ! docker exec "$kong" grep -q '^search' /etc/resolv.conf; then
  echo "$kong: sem 'search' no resolv.conf, nada a fazer."
  exit 0
fi

docker exec -u root "$kong" sh -c "grep -v '^search' /etc/resolv.conf > /tmp/resolv.new && cat /tmp/resolv.new > /etc/resolv.conf"
# Recarrega como o usuário do Kong (como root ele regravaria arquivos que o
# próprio Kong depois não consegue ler).
docker exec "$kong" kong reload >/dev/null
echo "$kong: 'search' removido e Kong recarregado."
