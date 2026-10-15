#!/usr/bin/env bash
set -euo pipefail
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.full.yml}"
FILE="${1:-}"
if [[ -z "$FILE" || ! -s "$FILE" ]]; then
 echo "Usage: scripts/restore.sh /path/to/backup.dump" >&2
 exit 2
fi
echo "DANGER: This operation replaces live ECO WASH database records."
read -r -p "Type RESTORE ECO WASH to continue: " answer
if [[ "$answer" != "RESTORE ECO WASH" ]]; then
 echo "Restore cancelled"; exit 1
fi
docker compose -f "$COMPOSE_FILE" stop api
trap 'echo "Review logs and restart API only after verification" >&2' EXIT
cat "$FILE" | docker compose -f "$COMPOSE_FILE" exec -T db pg_restore -U eco -d eco_wash --clean --if-exists --no-owner --no-privileges --exit-on-error
docker compose -f "$COMPOSE_FILE" start api
trap - EXIT
echo "Restore completed; verify balances at /audit/reconciliation before resuming business."
