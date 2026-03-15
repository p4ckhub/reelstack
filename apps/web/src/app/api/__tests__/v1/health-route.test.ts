import { describe, it, expect } from 'vitest';

const { GET } = await import('../../v1/health/route');

describe('GET /api/v1/health', () => {
  it('returns ok status with version', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBe('1.0.0');
    expect(body.timestamp).toBeDefined();
  });
});
