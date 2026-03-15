# VPS Deployment (Docker)

## Prerequisites

- A Linux VPS (Ubuntu 22.04+ recommended, 2GB+ RAM)
- Domain name (optional, for SSL)

## Quick Setup

```bash
git clone https://github.com/jurczykpawel/reelstack.git
cd reelstack
cp .env.example .env
```

Edit `.env`:

```env
AUTH_SECRET=<generate with: openssl rand -base64 32>
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/reelstack
REDIS_URL=redis://redis:6379
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=reelstack
NODE_ENV=production
```

Then run:

```bash
chmod +x scripts/setup-vps.sh
./scripts/setup-vps.sh
```

This will install Docker (if needed), build all images, start services, and run migrations.

## Manual Setup

```bash
# Build and start all services
docker compose -f docker-compose.prod.yml up -d --build

# Run migrations
docker compose -f docker-compose.prod.yml exec web \
  ./node_modules/.bin/prisma migrate deploy \
  --schema=/app/packages/database/prisma/schema.prisma
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| nginx | 80 | Reverse proxy + rate limiting |
| web | 3000 (internal) | Next.js app |
| worker | — | BullMQ render worker (FFmpeg) |
| postgres | 5432 (internal) | PostgreSQL database |
| redis | 6379 (internal) | BullMQ job queue |
| minio | 9000/9001 (internal) | Object storage |

## SSL with Let's Encrypt

Option 1: Use Caddy as reverse proxy (simplest — auto-SSL):

```bash
# Replace nginx service in docker-compose.prod.yml with:
# caddy:
#   image: caddy:2-alpine
#   ports: ["80:80", "443:443"]
#   volumes:
#     - ./Caddyfile:/etc/caddy/Caddyfile
#     - caddy_data:/data
```

Option 2: Use certbot with nginx:

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d yourdomain.com
# Then update docker/nginx.conf with SSL paths
```

## Monitoring

```bash
# View logs
docker compose -f docker-compose.prod.yml logs -f

# View specific service logs
docker compose -f docker-compose.prod.yml logs -f web
docker compose -f docker-compose.prod.yml logs -f worker

# Check health
curl http://localhost/api/health

# Restart services
docker compose -f docker-compose.prod.yml restart

# Stop everything
docker compose -f docker-compose.prod.yml down
```

## Backups

```bash
# Database backup
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U ${POSTGRES_USER} reelstack > backup.sql

# Restore
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U ${POSTGRES_USER} reelstack < backup.sql
```

## Updating

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec web \
  ./node_modules/.bin/prisma migrate deploy \
  --schema=/app/packages/database/prisma/schema.prisma
```

## Optional: Magic Link Emails

Add SMTP settings to `.env` to enable password-less login:

```env
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=re_xxxxx
EMAIL_FROM=noreply@yourdomain.com
```

Works with any SMTP provider: Resend, AWS SES, Mailgun, SendGrid, etc.
