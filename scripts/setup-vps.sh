#!/bin/bash
set -e

echo "=== ReelStack VPS Setup ==="

# Check Docker
if ! command -v docker &> /dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  echo "Docker installed. Please re-login and re-run this script."
  exit 0
fi

# Check .env
if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
  echo "Please edit .env with your configuration, then re-run this script."
  exit 1
fi

# Check if user wants reel rendering
PROFILE_FLAGS=""
if [ "${ENABLE_REEL_WORKER:-}" = "true" ] || [ "$1" = "--with-reel" ]; then
  echo "Reel worker enabled (Chromium + Remotion rendering)"
  echo "Note: requires minimum 4GB RAM"
  PROFILE_FLAGS="--profile reel"
fi

# Build and start
echo "Building and starting services..."
docker compose -f docker-compose.prod.yml $PROFILE_FLAGS up -d --build

# Wait for postgres
echo "Waiting for PostgreSQL..."
sleep 5

# Run migrations
echo "Running database migrations..."
docker compose -f docker-compose.prod.yml exec web ./node_modules/.bin/prisma migrate deploy --schema=/app/packages/database/prisma/schema.prisma

# Health check
echo "Checking health..."
sleep 3
if curl -sf http://localhost/api/health > /dev/null; then
  echo ""
  echo "=== Setup complete! ==="
  echo "Services running:"
  echo "  - nginx (reverse proxy)"
  echo "  - web (Next.js app)"
  echo "  - worker (subtitle burning)"
  if [ -n "$PROFILE_FLAGS" ]; then
    echo "  - reel-worker (Remotion video rendering)"
  fi
  echo "  - postgres, redis, minio"
  echo ""
  echo "Application is running at http://localhost"
else
  echo "Warning: Health check failed. Check logs with: docker compose -f docker-compose.prod.yml logs"
fi
