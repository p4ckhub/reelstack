#!/usr/bin/env bash
# ============================================================
# bin/dev-up.sh — one-command local dev environment
# ============================================================
# Boots the full local ReelStack stack in Docker:
#   postgres, redis, minio, web (Next.js), worker
# Auto-creates .env.dev on first run, MinIO bucket, DB schema.
# ============================================================

set -euo pipefail
cd "$(dirname "$0")/.."

REPO="$(pwd)"
ENV_FILE="$REPO/.env.dev"
EXAMPLE="$REPO/.env.dev.example"
COMPOSE="docker compose -f docker-compose.dev.yml --env-file .env.dev"

# 1. Ensure .env.dev exists
if [[ ! -f "$ENV_FILE" ]]; then
  echo "→ Creating $ENV_FILE from template..."
  cp "$EXAMPLE" "$ENV_FILE"
  # Auto-generate AUTH_SECRET so the user doesn't have to
  SECRET=$(openssl rand -base64 32)
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s|^AUTH_SECRET=.*|AUTH_SECRET=$SECRET|" "$ENV_FILE"
  else
    sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=$SECRET|" "$ENV_FILE"
  fi
  echo ""
  echo "  ⚠️  Created $ENV_FILE — open it and add:"
  echo "       ANTHROPIC_API_KEY=sk-ant-..."
  echo "       OPENAI_API_KEY=sk-... (or OPENROUTER_API_KEY=...)"
  echo ""
  echo "  Then re-run: bin/dev-up.sh"
  exit 0
fi

# 2. Warn about missing keys (don't block — user may intentionally skip)
MISSING=()
grep -q '^ANTHROPIC_API_KEY=.\+' "$ENV_FILE" || MISSING+=("ANTHROPIC_API_KEY (required for planner)")
if ! grep -q '^OPENAI_API_KEY=.\+' "$ENV_FILE" && ! grep -q '^OPENROUTER_API_KEY=.\+' "$ENV_FILE"; then
  MISSING+=("OPENAI_API_KEY or OPENROUTER_API_KEY (required for transcription)")
fi
if (( ${#MISSING[@]} > 0 )); then
  echo "  ⚠️  Missing API keys in .env.dev — reel generation will fail at those steps:"
  for m in "${MISSING[@]}"; do echo "      - $m"; done
  echo ""
fi

# 3. Build + start
echo "→ Starting dev stack (this may take a few minutes on first run)..."
$COMPOSE up -d --build --wait
echo ""
echo "  ✔ Dev stack ready."
echo ""
echo "  Web:           http://localhost:3001"
echo "  MinIO console: http://localhost:9001  (${MINIO_ACCESS_KEY:-reelstack} / ${MINIO_SECRET_KEY:-reelstack-dev-secret})"
echo "  Postgres:      localhost:5433   (postgres / postgres)"
echo "  Redis:         localhost:6379   (password: reelstack-dev)"
echo ""
echo "  Sign in: click 'Dev login (bypass magic link)' on /login — any email."
echo "  Logs:    docker compose -f docker-compose.dev.yml logs -f [web|worker]"
echo "  Stop:    docker compose -f docker-compose.dev.yml down"
echo "  Reset:   docker compose -f docker-compose.dev.yml down -v"
