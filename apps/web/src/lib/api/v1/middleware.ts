import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { auth } from '@/lib/auth';
import { httpRequestsTotal, httpRequestDuration } from '@/lib/metrics';
import { prisma } from '@reelstack/database';
import { getApiKeyByHash, touchApiKey } from '@reelstack/database';
import { createLogger } from '@reelstack/logger';
import type { ApiScope } from '@reelstack/types';
import { API_SCOPES, AppError } from '@reelstack/types';
import { extractApiKey, hashApiKey, verifyApiKeyHash } from './api-keys';
import type { AuthContext, ApiV1Error, ApiV1Success, PaginatedResponse } from './types';
import { rateLimit } from '../rate-limit';

const log = createLogger('api-v1');

// ==========================================
// Authentication
// ==========================================

/**
 * Authenticate a request via session JWT OR API key.
 * Returns AuthContext on success, null on failure.
 */
export async function authenticate(req: NextRequest): Promise<AuthContext | null> {
  // 1. Try API key auth first
  const apiKey = extractApiKey(req.headers);
  if (apiKey) {
    return authenticateApiKey(apiKey, req);
  }

  // 2. Fall back to session auth
  return authenticateSession();
}

async function authenticateApiKey(
  plaintext: string,
  req: NextRequest
): Promise<AuthContext | null> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const candidateHash = hashApiKey(plaintext);
  const record = await getApiKeyByHash(candidateHash);

  if (!record) {
    log.warn({ ip, reason: 'key not found' }, 'API key auth failed');
    return null;
  }

  // Verify hash with timing-safe comparison
  if (!verifyApiKeyHash(candidateHash, record.keyHash)) {
    log.warn({ keyId: record.id, ip, reason: 'hash mismatch' }, 'API key auth failed');
    return null;
  }

  // Check active and not revoked
  if (!record.isActive || record.revokedAt) {
    log.warn({ keyId: record.id, ip, reason: 'revoked/inactive' }, 'API key auth failed');
    return null;
  }

  // Check expiration
  if (record.expiresAt && record.expiresAt < new Date()) {
    log.warn({ keyId: record.id, ip, reason: 'expired' }, 'API key auth failed');
    return null;
  }

  // Touch usage stats (fire-and-forget)
  touchApiKey(record.id, ip !== 'unknown' ? ip : undefined).catch((err) =>
    log.warn({ keyId: record.id, err }, 'Failed to touch API key')
  );

  const scopes = (Array.isArray(record.scopes) ? record.scopes : ['*']) as ApiScope[];

  return {
    user: record.user,
    apiKeyId: record.id,
    scopes,
  };
}

async function authenticateSession(): Promise<AuthContext | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user) return null;

  // Session auth gets full access
  return {
    user,
    apiKeyId: null,
    scopes: [API_SCOPES.FULL_ACCESS],
  };
}

// ==========================================
// Authorization - scope checking
// ==========================================

/** Check if the auth context has the required scope */
export function hasScope(ctx: AuthContext, requiredScope: ApiScope): boolean {
  // Full access (*) grants everything
  if (ctx.scopes.includes(API_SCOPES.FULL_ACCESS)) return true;
  return ctx.scopes.includes(requiredScope);
}

// ==========================================
// Handler wrapper with auth + rate limiting
// ==========================================

type HandlerFn = (req: NextRequest, ctx: AuthContext) => Promise<NextResponse>;

interface WithAuthOptions {
  /** Required scope for this endpoint */
  scope?: ApiScope;
  /** Rate limit config - defaults to 60/min for API key, 100/min for session */
  rateLimit?: { maxRequests: number; windowMs: number };
}

/**
 * Wrap a route handler with authentication, scope checking, and rate limiting.
 *
 * Usage:
 *   export const GET = withAuth({ scope: API_SCOPES.VIDEOS_READ }, async (req, ctx) => { ... });
 */
export function withAuth(
  options: WithAuthOptions,
  handler: HandlerFn
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest) => {
    const startTime = Date.now();
    const route = req.nextUrl.pathname;

    // 1. Authenticate
    const ctx = await authenticate(req);
    if (!ctx) {
      const response = errorResponse('UNAUTHORIZED', 'Invalid or missing authentication', 401);
      httpRequestsTotal.inc({ method: req.method, route, status: '401' });
      httpRequestDuration.observe({ method: req.method, route }, (Date.now() - startTime) / 1000);
      return response;
    }

    // 2. Check scope
    if (options.scope && !hasScope(ctx, options.scope)) {
      const response = errorResponse('FORBIDDEN', `Missing required scope: ${options.scope}`, 403);
      httpRequestsTotal.inc({ method: req.method, route, status: '403' });
      httpRequestDuration.observe({ method: req.method, route }, (Date.now() - startTime) / 1000);
      return response;
    }

    // 3. Rate limit (skipped in development for easier testing)
    if (process.env.NODE_ENV !== 'development') {
      const rateLimitKey = ctx.apiKeyId ?? ctx.user.id;
      const rateLimitConfig = options.rateLimit ?? {
        maxRequests: ctx.apiKeyId ? 60 : 100,
        windowMs: 60_000,
      };
      const rl = await rateLimit(`v1:${rateLimitKey}`, rateLimitConfig);
      if (!rl.success) {
        const response = errorResponse('RATE_LIMITED', 'Too many requests', 429);
        httpRequestsTotal.inc({ method: req.method, route, status: '429' });
        httpRequestDuration.observe({ method: req.method, route }, (Date.now() - startTime) / 1000);
        return response;
      }
    }

    // 4. Execute handler
    try {
      const response = await handler(req, ctx);
      const duration = (Date.now() - startTime) / 1000;
      httpRequestsTotal.inc({ method: req.method, route, status: response.status.toString() });
      httpRequestDuration.observe({ method: req.method, route }, duration);
      return addSecurityHeaders(response);
    } catch (err) {
      const duration = (Date.now() - startTime) / 1000;

      if (err instanceof AppError) {
        httpRequestsTotal.inc({ method: req.method, route, status: err.statusCode.toString() });
        httpRequestDuration.observe({ method: req.method, route }, duration);
        return errorResponse(err.code as ApiV1Error['error']['code'], err.message, err.statusCode);
      }

      httpRequestsTotal.inc({ method: req.method, route, status: '500' });
      httpRequestDuration.observe({ method: req.method, route }, duration);
      log.error({ err, path: req.nextUrl.pathname }, 'Unhandled error');
      Sentry.captureException(err, { tags: { route: req.nextUrl.pathname } });
      return errorResponse('INTERNAL_ERROR', 'Internal server error', 500);
    }
  };
}

// ==========================================
// Response helpers
// ==========================================

export function successResponse<T>(data: T, status = 200): NextResponse {
  return addSecurityHeaders(NextResponse.json({ data } satisfies ApiV1Success<T>, { status }));
}

export function errorResponse(
  code: ApiV1Error['error']['code'],
  message: string,
  status: number
): NextResponse {
  return addSecurityHeaders(
    NextResponse.json({ error: { code, message } } satisfies ApiV1Error, { status })
  );
}

export function paginatedResponse<T>(
  items: T[],
  limit: number,
  getCursor: (item: T) => string
): NextResponse {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore && data.length > 0 ? getCursor(data[data.length - 1]) : null;

  return addSecurityHeaders(
    NextResponse.json({
      data,
      pagination: { nextCursor, hasMore },
    } satisfies PaginatedResponse<T>)
  );
}

// ==========================================
// Security headers
// ==========================================

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=()');
  response.headers.set('Cache-Control', 'no-store');
  const hstsMaxAge = process.env.HSTS_MAX_AGE ?? '63072000';
  if (hstsMaxAge !== '0') {
    response.headers.set('Strict-Transport-Security', `max-age=${hstsMaxAge}; includeSubDomains`);
  }
  return response;
}
