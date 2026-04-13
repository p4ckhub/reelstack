import { readFileSync } from 'fs';
import path from 'path';
// Load .env from monorepo root (two levels up from apps/web/worker/)
// Only sets vars not already in process.env (respects explicit env vars)
try {
  const envPath = path.resolve(import.meta.dirname ?? __dirname, '../../..', '.env');
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const eqIdx = line.indexOf('=');
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
} catch {
  // .env not found, rely on explicit env vars
}

import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});

import { Worker } from 'bullmq';
import { createLogger } from '@reelstack/logger';
import { processReelPipelineJob } from '../src/lib/worker/reel-pipeline-worker';
import { processReelPublishJob } from '../src/lib/worker/reel-publish-worker';

const log = createLogger('reel-worker');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const url = new URL(redisUrl);

const connection = {
  host: url.hostname,
  port: parseInt(url.port || '6379', 10),
  password: url.password || undefined,
};

// Reel render worker - concurrency 1 (Chromium is memory-intensive)
const renderWorker = new Worker(
  'reel-render',
  async (job) => {
    log.info({ jobId: job.id, queue: 'reel-render' }, 'Processing reel-render job');
    await processReelPipelineJob(job.data.jobId, job.data.fromStepId);
    log.info({ jobId: job.id, queue: 'reel-render' }, 'Completed reel-render job');
  },
  {
    connection,
    concurrency: 1,
    // Render pipeline can take 3-5min (TTS + Remotion bundle + render)
    // Default lockDuration is 30s - must be longer than the longest blocking operation
    lockDuration: 360_000, // 6 minutes
  }
);

// Reel publish worker - concurrency 5 (lightweight HTTP calls)
const publishWorker = new Worker(
  'reel-publish',
  async (job) => {
    log.info({ jobId: job.id, queue: 'reel-publish' }, 'Processing reel-publish job');
    await processReelPublishJob(job.data.jobId, job.data);
    log.info({ jobId: job.id, queue: 'reel-publish' }, 'Completed reel-publish job');
  },
  {
    connection,
    concurrency: 5,
    // Publish jobs make network calls that could be slow
    lockDuration: 60_000, // 1 minute
  }
);

renderWorker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, queue: 'reel-render', err: err.message }, 'Render job failed');
  Sentry.captureException(err, { tags: { worker: 'reel-render', jobId: job?.id } });
});

publishWorker.on('failed', (job, err) => {
  log.error({ jobId: job?.id, queue: 'reel-publish', err: err.message }, 'Publish job failed');
  Sentry.captureException(err, { tags: { worker: 'reel-publish', jobId: job?.id } });
});

renderWorker.on('ready', () => {
  log.info({ queue: 'reel-render' }, 'BullMQ reel-render worker ready');
});

publishWorker.on('ready', () => {
  log.info({ queue: 'reel-publish' }, 'BullMQ reel-publish worker ready');
});

async function shutdown() {
  log.info('Shutting down...');
  await Promise.all([renderWorker.close(), publishWorker.close()]);
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
