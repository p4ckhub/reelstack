import { NextResponse } from 'next/server';
import { prisma } from '@reelstack/database';
import { detectDeploymentMode } from '@reelstack/queue';
import { createConnection } from 'net';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';

type CheckResult = {
  status: 'ok' | 'error';
  latencyMs: number;
  error?: string;
};

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeoutMs),
    ),
  ]);
}

const CHECK_TIMEOUT_MS = 3000;

async function checkDatabase(): Promise<CheckResult> {
  const start = performance.now();
  try {
    await withTimeout(
      prisma.$queryRawUnsafe('SELECT 1'),
      CHECK_TIMEOUT_MS,
    );
    return { status: 'ok', latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Redis health check using raw TCP + RESP protocol.
 * Sends AUTH (if password set) then PING, expects +PONG.
 */
async function checkRedis(): Promise<CheckResult> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return { status: 'error', latencyMs: 0, error: 'REDIS_URL not set' };
  }

  const start = performance.now();
  try {
    const url = new URL(redisUrl);
    const host = url.hostname || '127.0.0.1';
    const port = parseInt(url.port || '6379', 10);
    const password = url.password || undefined;

    const ok = await withTimeout(
      redisPing(host, port, password),
      CHECK_TIMEOUT_MS,
    );
    return ok
      ? { status: 'ok', latencyMs: Math.round(performance.now() - start) }
      : { status: 'error', latencyMs: Math.round(performance.now() - start), error: 'PING failed' };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

function redisPing(host: string, port: number, password?: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port }, () => {
      const commands = password
        ? `AUTH ${password}\r\nPING\r\n`
        : 'PING\r\n';
      socket.write(commands);
    });

    let data = '';
    socket.on('data', (chunk) => {
      data += chunk.toString();
      if (data.includes('+PONG')) {
        socket.destroy();
        resolve(true);
      } else if (data.includes('-ERR') || data.includes('-NOAUTH')) {
        socket.destroy();
        reject(new Error(data.trim()));
      }
    });

    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });
  });
}

/**
 * MinIO/S3 health check using the /minio/health/live endpoint.
 */
async function checkStorage(): Promise<CheckResult | null> {
  const endpoint = process.env.MINIO_ENDPOINT;
  if (!endpoint) {
    return null;
  }

  const port = parseInt(process.env.MINIO_PORT || '9000', 10);
  const useSSL = process.env.MINIO_USE_SSL === 'true';

  const start = performance.now();
  try {
    await withTimeout(minioHealthCheck(endpoint, port, useSSL), CHECK_TIMEOUT_MS);
    return { status: 'ok', latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

function minioHealthCheck(host: string, port: number, useSSL: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const reqFn = useSSL ? httpsRequest : httpRequest;
    const req = reqFn(
      { hostname: host, port, path: '/minio/health/live', method: 'GET', timeout: CHECK_TIMEOUT_MS },
      (res) => {
        // MinIO returns 200 for healthy
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          res.resume();
          resolve();
        } else {
          res.resume();
          reject(new Error(`MinIO health returned HTTP ${res.statusCode}`));
        }
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.end();
  });
}

export async function GET() {
  const [database, redis, storage] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkStorage(),
  ]);

  const checks: Record<string, CheckResult> = { database, redis };
  if (storage) {
    checks.storage = storage;
  }

  const databaseFailed = database.status === 'error';
  const anyFailed = Object.values(checks).some((c) => c.status === 'error');

  let status: 'ok' | 'degraded' | 'error';
  let httpStatus: number;

  if (databaseFailed) {
    status = 'error';
    httpStatus = 503;
  } else if (anyFailed) {
    status = 'degraded';
    httpStatus = 200;
  } else {
    status = 'ok';
    httpStatus = 200;
  }

  return NextResponse.json(
    {
      status,
      mode: detectDeploymentMode(),
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: httpStatus },
  );
}
