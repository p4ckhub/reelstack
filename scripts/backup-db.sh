#!/bin/bash
# Daily PostgreSQL backup
# Usage: ./scripts/backup-db.sh
# Add to crontab: 0 3 * * * /path/to/backup-db.sh

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/reelstack_$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

# Use DATABASE_URL or default
DB_URL="${DATABASE_URL:-postgresql://reelstack:reelstack@localhost:5432/reelstack}"

echo "[backup] Starting PostgreSQL backup..."
pg_dump "$DB_URL" | gzip > "$BACKUP_FILE"
echo "[backup] Created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Cleanup old backups
echo "[backup] Removing backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "reelstack_*.sql.gz" -mtime +$RETENTION_DAYS -delete -print
echo "[backup] Done."
