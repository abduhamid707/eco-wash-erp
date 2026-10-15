#!/usr/bin/env bash
set -euo pipefail
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.full.yml}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/eco-wash-$timestamp.dump"
tmp="$out.partial"
trap 'rm -f "$tmp"' EXIT
docker compose -f "$COMPOSE_FILE" exec -T db pg_dump -U eco -d eco_wash -Fc > "$tmp"
test -s "$tmp"
mv "$tmp" "$out"
chmod 600 "$out"
trap - EXIT
echo "Backup created: $out"
