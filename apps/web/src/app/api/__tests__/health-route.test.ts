// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

const mockQueryRaw = vi.fn();
vi.mock('@reelstack/database', () => ({
  prisma: {
    $queryRawUnsafe: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

vi.mock('@reelstack/queue', () => ({
  detectDeploymentMode: () => 'local',
}));

// --- Redis mock (net.createConnection) ---
let mockSocketBehavior: 'pong' | 'error' | 'connect-error' = 'pong';

vi.mock('net', async (importOriginal) => {
  const actual = await importOriginal<typeof import('net')>();
  return {
    ...actual,
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

vi.mock('http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('http')>();
  return {
    ...actual,
    request: createMockRequestFn(),
  };
});

vi.mock('https', async (importOriginal) => {
  const actual = await importOriginal<typeof import('https')>();
  return {
    ...actual,
    request: createMockRequestFn(),
  };
});

const { GET } = await import('../health/route');

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocketBehavior = 'pong';
    mockMinioStatus = 200;
    mockMinioError = null;
    vi.stubEnv('REDIS_URL', 'redis://:password@localhost:6379');
    vi.stubEnv('MINIO_ENDPOINT', '');
  });

  it('returns ok when all checks pass', async () => {
    mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);

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
    mockQueryRaw.mockRejectedValue(new Error('Connection refused'));

    const response = await GET();
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.status).toBe('error');
    expect(body.checks.database.status).toBe('error');
    expect(body.checks.database.error).toBe('Connection refused');
  });

  it('returns degraded (200) when redis is down but database is ok', async () => {
    mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);
    mockSocketBehavior = 'connect-error';

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('degraded');
    expect(body.checks.database.status).toBe('ok');
    expect(body.checks.redis.status).toBe('error');
  });

  it('omits storage check when MINIO_ENDPOINT is not set', async () => {
    mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const response = await GET();
    const body = await response.json();
    expect(body.checks.storage).toBeUndefined();
  });

  it('includes storage check when MINIO_ENDPOINT is set', async () => {
    vi.stubEnv('MINIO_ENDPOINT', 'localhost');
    vi.stubEnv('MINIO_PORT', '9000');
    vi.stubEnv('MINIO_USE_SSL', 'false');
    mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const response = await GET();
    const body = await response.json();
    expect(body.checks.storage).toBeDefined();
    expect(body.checks.storage.status).toBe('ok');
  });

  it('returns degraded when storage is down', async () => {
    vi.stubEnv('MINIO_ENDPOINT', 'localhost');
    vi.stubEnv('MINIO_PORT', '9000');
    vi.stubEnv('MINIO_USE_SSL', 'false');
    mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);
    mockMinioError = new Error('ECONNREFUSED');

    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe('degraded');
    expect(body.checks.storage.status).toBe('error');
  });

  it('returns redis error when REDIS_URL is not set', async () => {
    vi.stubEnv('REDIS_URL', '');
    mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe('degraded');
    expect(body.checks.redis.status).toBe('error');
    expect(body.checks.redis.error).toBe('REDIS_URL not set');
  });
});
