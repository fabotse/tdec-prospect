#!/usr/bin/env bash
# Consulta somente leitura no banco de produção (usuário claude_ro).
# Uso: scripts/db-ro.sh "select ..."   ou   scripts/db-ro.sh < arquivo.sql
set -euo pipefail
cd "$(dirname "$0")/.."
url=$(grep -E '^SUPABASE_DB_URL=' .env.local | head -1 | cut -d= -f2- | tr -d "\"'")
[ -n "$url" ] || { echo "SUPABASE_DB_URL ausente no .env.local" >&2; exit 1; }
export PGOPTIONS='-c default_transaction_read_only=on'
if [ $# -gt 0 ]; then
  exec psql "$url" -X -v ON_ERROR_STOP=1 -c "$1"
else
  exec psql "$url" -X -v ON_ERROR_STOP=1
fi
