// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { databaseMockFactory, mockPrisma } from '@/__test-utils__/database-mock';

vi.mock('@reelstack/database', databaseMockFactory);

import { queueMockFactory } from '@/__test-utils__/queue-mock';
vi.mock('@reelstack/queue', queueMockFactory);

// --- Redis mock (net.createConnection) ---
let mockSocketBehavior: 'pong' | 'error' | 'connect-error' = 'pong';

vi.mock('net', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require('events');
  return {
    createConnection: (_opts: unknown, onConnect?: () => void) => {
      const socket = new EventEmitter() as EventEmitter & {
        write: ReturnType<typeof vi.fn>;
        destroy: ReturnType<typeof vi.fn>;
      };
      socket.write = vi.fn();
      socket.destroy = vi.fn();

      if (mockSocketBehavior === 'connect-error') {
        process.nextTick(() => socket.emit('error', new Error('ECONNREFUSED')));
      } else {
        process.nextTick(() => {
          if (onConnect) onConnect();
          if (mockSocketBehavior === 'pong') {
            process.nextTick(() => socket.emit('data', Buffer.from('+OK\r\n+PONG\r\n')));
          } else if (mockSocketBehavior === 'error') {
            process.nextTick(() => socket.emit('data', Buffer.from('-ERR auth failed\r\n')));
          }
        });
      }

      return socket;
    },
  };
});

// --- MinIO mock (http.request / https.request) ---
let mockMinioStatus = 200;
let mockMinioError: Error | null = null;

function createMockRequestFn() {
  return (_opts: unknown, callback?: (res: unknown) => void) => {
    const req = new EventEmitter() as EventEmitter & {
      end: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
    };
    req.end = vi.fn().mockImplementation(() => {
      if (mockMinioError) {
        process.nextTick(() => req.emit('error', mockMinioError));
        return;
      }
      const res = new EventEmitter() as EventEmitter & {
        statusCode: number;
        resume: ReturnType<typeof vi.fn>;
      };
      res.statusCode = mockMinioStatus;
      res.resume = vi.fn();
      process.nextTick(() => {
        if (callback) callback(res);
      });
    });
    req.destroy = vi.fn();
    return req;
  };
}

vi.mock('http', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const http = require('http');
  return { ...http, request: createMockRequestFn() };
});

vi.mock('https', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const https = require('https');
  return { ...https, request: createMockRequestFn() };
});

const { GET } = await import('../health/route');

describe('GET /api/health', () => {
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    mockSocketBehavior = 'pong';
    mockMinioStatus = 200;
    mockMinioError = null;
    // Save + set env (vi.stubEnv not available in bun)
    for (const key of ['REDIS_URL', 'MINIO_ENDPOINT', 'MINIO_PORT', 'MINIO_USE_SSL']) {
      envBackup[key] = process.env[key];
    }
    process.env['REDIS_URL'] = 'redis://:password@localhost:6379';
    process.env['MINIO_ENDPOINT'] = '';
  });

  afterEach(() => {
    // Restore env
    for (const [key, val] of Object.entries(envBackup)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it('returns ok when all checks pass', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);

    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.checks.database.status).toBe('ok');
    expect(body.checks.database.latencyMs).toBeTypeOf('number');
    expect(body.checks.redis.status).toBe('ok');
    expect(body.checks.redis.latencyMs).toBeTypeOf('number');
    expect(body.mode).toBe('local');
    expect(body.timestamp).toBeDefined();
  });

  it('returns error (503) when database is down', async () => {
    mockPrisma.$queryRawUnsafe.mockRejectedValue(new Error('Connection refused'));

    const response = await GET();
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.status).toBe('error');
    expect(body.checks.database.status).toBe('error');
    expect(body.checks.database.error).toBe('Connection refused');
  });

  it('returns degraded (200) when redis is down but database is ok', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);
    mockSocketBehavior = 'connect-error';

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('degraded');
    expect(body.checks.database.status).toBe('ok');
    expect(body.checks.redis.status).toBe('error');
  });

  it('omits storage check when MINIO_ENDPOINT is not set', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);

    const response = await GET();
    const body = await response.json();
    expect(body.checks.storage).toBeUndefined();
  });

  it('includes storage check when MINIO_ENDPOINT is set', async () => {
    process.env['MINIO_ENDPOINT'] = 'localhost';
    process.env['MINIO_PORT'] = '9000';
    process.env['MINIO_USE_SSL'] = 'false';
    mockPrisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);

    const response = await GET();
    const body = await response.json();
    expect(body.checks.storage).toBeDefined();
    expect(body.checks.storage.status).toBe('ok');
  });

  it('returns degraded when storage is down', async () => {
    process.env['MINIO_ENDPOINT'] = 'localhost';
    process.env['MINIO_PORT'] = '9000';
    process.env['MINIO_USE_SSL'] = 'false';
    mockPrisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);
    mockMinioError = new Error('ECONNREFUSED');

    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe('degraded');
    expect(body.checks.storage.status).toBe('error');
  });

  it('returns redis error when REDIS_URL is not set', async () => {
    process.env['REDIS_URL'] = '';
    mockPrisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);

    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe('degraded');
    expect(body.checks.redis.status).toBe('error');
    expect(body.checks.redis.error).toBe('REDIS_URL not set');
  });
});
