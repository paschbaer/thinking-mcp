#!/usr/bin/env bash
# Backup script for the insight (EMMS) experience-memory store.
#
# Uses SQLite's `.backup` command — safe while the server is running
# (WAL mode produces a consistent snapshot). Falls back to plain copy
# if sqlite3 CLI is unavailable (slight risk of tearing under heavy
# write load; acceptable for this single-user deployment).
#
# Usage:
#   scripts/backup-store.sh [backup-dir]
# Default backup dir: ./emms-backups (inside the server folder, git-ignored).
# Keeps the last 14 backups, then prunes oldest.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$SERVER_DIR/emms-data"
DB="$DATA_DIR/emms-store.db"
BACKUP_DIR="${2:-$SERVER_DIR/emms-backups}"
KEEP=14

# restore mode: backup-store.sh restore <backup-file>
if [[ "${1:-}" == "restore" ]]; then
  SRC="${2:?usage: backup-store.sh restore <backup-file>}"
  [[ -f "$SRC" ]] || { echo "ERROR: backup not found: $SRC" >&2; exit 1; }
  echo "stopping insight container (data dir must be idle)..."
  docker compose -f "$SERVER_DIR/docker-compose.yml" stop insight || true
  cp "$DB" "$DB.pre-restore-$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
  rm -f "$DB-wal" "$DB-shm"
  cp "$SRC" "$DB"
  docker compose -f "$SERVER_DIR/docker-compose.yml" start insight
  echo "restored $SRC -> $DB (previous store kept as $DB.pre-restore-*)"
  exit 0
fi

if [[ ! -f "$DB" ]]; then
  echo "ERROR: store not found at $DB" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="$BACKUP_DIR/emms-store-$STAMP.db"

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB" ".backup '$TARGET'"
  MODE="sqlite3 .backup (consistent snapshot)"
else
  cp "$DB" "$TARGET"
  # include WAL if present and non-empty so the snapshot stays replayable
  [[ -s "$DB-wal" ]] && cp "$DB-wal" "$TARGET-wal"
  MODE="plain copy (sqlite3 CLI unavailable)"
fi

# prune old backups (keep newest $KEEP)
ls -1t "$BACKUP_DIR"/emms-store-*.db 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f

SIZE="$(du -h "$TARGET" | cut -f1)"
echo "backup OK: $TARGET ($SIZE) [$MODE]"

# quick integrity check (node/better-sqlite3; sqlite3 CLI is often absent)
NODE_DB="$(node -e "console.log(require.resolve('better-sqlite3'))" 2>/dev/null || true)"
if [[ -z "$NODE_DB" ]]; then
  NODE_DB="$SERVER_DIR/../../node_modules/better-sqlite3"
fi
if [[ -e "$NODE_DB" ]]; then
  node -e "
const Db = require('$NODE_DB');
const db = new Db('$TARGET', { readonly: true });
const integrity = db.pragma('integrity_check', { simple: true });
if (integrity !== 'ok') { console.error('ERROR: integrity check failed:', integrity); process.exit(1); }
console.log('integrity ok — episodes in snapshot:', db.prepare('SELECT COUNT(*) c FROM episodes').get().c);
" || exit 1
else
  echo "WARN: no sqlite3 CLI and no better-sqlite3 — skipped integrity check"
fi
