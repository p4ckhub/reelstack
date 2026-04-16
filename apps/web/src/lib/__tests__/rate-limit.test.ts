import { describe, it, expect } from 'vitest';
import { rateLimit } from '../api/rate-limit';

describe('rateLimit', () => {
  it('allows requests within limit', async () => {
    const key = `test-${Date.now()}`;
    const result = await rateLimit(key, { maxRequests: 5, windowMs: 60000 });

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('blocks requests over limit', async () => {
    const key = `test-block-${Date.now()}`;
    const config = { maxRequests: 2, windowMs: 60000 };

    await rateLimit(key, config);
    await rateLimit(key, config);
    const result = await rateLimit(key, config);

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('resets after window expires', async () => {
    const key = `test-reset-${Date.now()}`;
    // Redis stores TTL with second precision (Math.ceil(windowMs/1000)), so
    // windowMs must be ≥ 1000 for the test to pass against both the Redis
    // path (when local Redis is running) and the in-memory fallback.
    const config = { maxRequests: 1, windowMs: 1000 };

    await rateLimit(key, config);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const result = await rateLimit(key, config);
    expect(result.success).toBe(true);
  });
});
