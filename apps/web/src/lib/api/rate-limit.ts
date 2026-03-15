import { createLogger } from '@reelstack/logger';

const log = createLogger('rate-limit');

// ==========================================
// In-memory store (fallback)
// ==========================================

const store = new Map<string, { count: number; resetAt: number }>();

let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 60_000; // cleanup every 60s

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
}

function rateLimitMemory(
  key: string,
  config: RateLimitConfig,
  { failOpen = false }: { failOpen?: boolean } = {}
): RateLimitResult {
  try {
    const now = Date.now();

    // Periodic cleanup of expired entries to prevent unbounded growth
    if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
      lastCleanup = now;
      for (const [k, value] of store) {
        if (value.resetAt < now) {
          store.delete(k);
        }
      }
    }

    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + config.windowMs });
      return { success: true, remaining: config.maxRequests - 1 };
    }

    entry.count++;
    const remaining = Math.max(0, config.maxRequests - entry.count);

    if (entry.count > config.maxRequests) {
      return { success: false, remaining: 0 };
    }

    return { success: true, remaining };
  } catch {
    if (failOpen) {
      return { success: true, remaining: 0 };
    }
    return { success: false, remaining: 0 };
  }
}

// ==========================================
// Redis-backed store
// ==========================================

type IoRedis = import('ioredis').Redis;

let redisClient: IoRedis | null = null;
let redisUnavailable = false;

async function getRedisClient(): Promise<IoRedis | null> {
  if (redisClient) return redisClient;
  if (redisUnavailable) return null;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    const { default: Redis } = await import('ioredis');
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 3000,
      enableOfflineQueue: false,
    });
    await client.connect();
    log.info('Redis rate limiter connected');
    redisClient = client;
    return redisClient;
  } catch (err) {
    log.warn({ err }, 'Redis rate limiter unavailable, falling back to memory');
    redisUnavailable = true;
    return null;
  }
}

async function rateLimitRedis(
  key: string,
  config: RateLimitConfig,
  opts: { failOpen?: boolean } = {}
): Promise<RateLimitResult> {
  const redis = await getRedisClient();
  if (!redis) return rateLimitMemory(key, config, opts);

  const { maxRequests, windowMs } = config;
  const redisKey = `rl:${key}`;
  const windowSec = Math.ceil(windowMs / 1000);

  try {
    const results = await redis
      .multi()
      .incr(redisKey)
      .pttl(redisKey)
      .exec();

    const count = (results?.[0]?.[1] as number) ?? 1;
    const ttl = (results?.[1]?.[1] as number) ?? -1;

    // Set expiry on first request in window (ttl -1 = no expiry, -2 = key gone)
    if (ttl < 0) {
      await redis.expire(redisKey, windowSec);
    }

    const remaining = Math.max(0, maxRequests - count);

    return {
      success: count <= maxRequests,
      remaining,
    };
  } catch (err) {
    log.warn({ err }, 'Redis rate limit error, falling back to memory');
    return rateLimitMemory(key, config, opts);
  }
}

// ==========================================
// Main export
// ==========================================

/**
 * Rate limiter with Redis support.
 *
 * When REDIS_URL is set, uses a Redis INCR+EXPIRE sliding window counter
 * shared across all instances. Falls back to in-memory when Redis is
 * unavailable or not configured.
 *
 * FAIL-CLOSED by default: rejects requests when the backing store errors.
 * Set `failOpen: true` to allow requests through on errors.
 */
export async function rateLimit(
  key: string,
  config: RateLimitConfig = { maxRequests: 100, windowMs: 60_000 },
  { failOpen = false }: { failOpen?: boolean } = {}
): Promise<RateLimitResult> {
  if (process.env.REDIS_URL) {
    return rateLimitRedis(key, config, { failOpen });
  }
  return rateLimitMemory(key, config, { failOpen });
}
