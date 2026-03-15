# Multi-Worker Deployment

Scale reel rendering by running multiple reel-worker containers.

## Architecture

```
nginx (port 80)
  └── web (Next.js API + frontend)
        └── Redis (BullMQ job queue)
              ├── reel-worker-1 (concurrency: 1)
              ├── reel-worker-2 (concurrency: 1)
              └── reel-worker-3 (concurrency: 1)
```

Each worker processes one render at a time (Chromium is memory-heavy).
BullMQ distributes jobs automatically - no configuration needed.

## Quick Start

```bash
# Scale to 3 workers
docker compose -f docker-compose.prod.yml up -d --scale reel-worker=3

# Check worker status
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f reel-worker
```

## Resource Requirements

| Workers | Min RAM | Recommended | Max Concurrent Renders |
|---------|---------|-------------|----------------------|
| 1 | 2 GB | 4 GB | 1 |
| 2 | 4 GB | 6 GB | 2 |
| 3 | 6 GB | 8 GB | 3 |
| 5 | 10 GB | 16 GB | 5 |

Each worker uses ~1-2 GB during Chromium rendering.

## Remotion Bundle Caching

Each worker independently caches the Remotion webpack bundle in `/tmp/remotion-bundle/`.
First render on a new worker takes ~200s extra for bundling.

To pre-warm bundles:
```bash
# After deploy, trigger one render per worker
for i in $(seq 1 3); do
  curl -X POST http://localhost:3080/api/v1/reel/create \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"script": "warm up"}' &
done
```

Or use `REMOTION_BUNDLE_PATH` to mount a pre-built bundle:
```yaml
volumes:
  - ./remotion-bundle:/app/remotion-bundle
environment:
  - REMOTION_BUNDLE_PATH=/app/remotion-bundle
```

## Monitoring

Check queue depth:
```bash
# Via Redis CLI
docker compose exec redis redis-cli -a $REDIS_PASSWORD LLEN bull:reel-render:wait

# Via Prometheus (if configured)
curl http://localhost:3080/api/metrics?token=$METRICS_TOKEN | grep reel_queue_depth
```

## Graceful Shutdown

Workers handle SIGTERM gracefully - they finish the current job before stopping.
Docker Compose sends SIGTERM on `docker compose stop` with a 30s grace period.

For zero-downtime updates:
```bash
# Scale up new workers first
docker compose -f docker-compose.prod.yml up -d --scale reel-worker=4

# Wait for new workers to be ready
sleep 10

# Scale back down (old workers finish their jobs)
docker compose -f docker-compose.prod.yml up -d --scale reel-worker=3
```
