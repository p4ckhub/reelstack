import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

// Collect default Node.js metrics (memory, CPU, event loop)
collectDefaultMetrics({ register: registry });

// -- API Metrics --

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'] as const,
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

// -- Reel Pipeline Metrics --

export const reelJobsTotal = new Counter({
  name: 'reel_jobs_total',
  help: 'Total reel jobs processed',
  labelNames: ['status'] as const,
  registers: [registry],
});

export const reelRenderDuration = new Histogram({
  name: 'reel_render_duration_seconds',
  help: 'Reel render duration in seconds',
  labelNames: ['step'] as const,
  buckets: [1, 5, 10, 30, 60, 120, 300],
  registers: [registry],
});

export const reelQueueDepth = new Gauge({
  name: 'reel_queue_depth',
  help: 'Current reel job queue depth',
  labelNames: ['queue'] as const,
  registers: [registry],
});
