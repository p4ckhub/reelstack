import { NextRequest } from 'next/server';
import {
  prisma,
  getApiKeysByUser,
  createApiKey as dbCreateApiKey,
  createAuditLog,
} from '@reelstack/database';
import { createLogger } from '@reelstack/logger';

const log = createLogger('api-keys');
import { SCOPE_PRESETS } from '@reelstack/types';
import { generateApiKey } from '@/lib/api/v1/api-keys';
import { withAuth, successResponse, errorResponse } from '@/lib/api/v1/middleware';
import { createApiKeySchema } from '@/lib/api/v1/schemas';
import type { AuthContext } from '@/lib/api/v1/types';

/** GET /api/v1/api-keys - List user's API keys (session only) */
export const GET = withAuth(
  { rateLimit: { maxRequests: 20, windowMs: 60_000 } },
  async (_req: NextRequest, ctx: AuthContext) => {
    // API key management requires session auth (no API key self-management)
    if (ctx.apiKeyId) {
      return errorResponse('FORBIDDEN', 'Session required to manage API keys', 403);
    }

    const keys = await getApiKeysByUser(ctx.user.id);

    return successResponse(
      keys.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        scopes: k.scopes,
        rateLimitPerMinute: k.rateLimitPerMinute,
        isActive: k.isActive,
        expiresAt: k.expiresAt,
        lastUsedAt: k.lastUsedAt,
        usageCount: Number(k.usageCount),
        createdAt: k.createdAt,
      }))
    );
  }
);

/** POST /api/v1/api-keys - Create a new API key (session only) */
export const POST = withAuth(
  { rateLimit: { maxRequests: 20, windowMs: 60_000 } },
  async (req: NextRequest, ctx: AuthContext) => {
    // API key management requires session auth (no API key self-management)
    if (ctx.apiKeyId) {
      return errorResponse('FORBIDDEN', 'Session required to manage API keys', 403);
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 400);
    }

    const parsed = createApiKeySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        'VALIDATION_ERROR',
        parsed.error.issues.map((i) => i.message).join(', '),
        400
      );
    }

    // Limit keys per user
    const existingCount = await prisma.apiKey.count({
      where: { userId: ctx.user.id, revokedAt: null },
    });
    if (existingCount >= 10) {
      return errorResponse('QUOTA_EXCEEDED', 'Maximum 10 active API keys', 400);
    }

    const { plaintext, prefix, hash } = generateApiKey('live');

    const scopes = parsed.data.scopes ?? SCOPE_PRESETS.full;
    const expiresAt = parsed.data.expiresInDays
      ? new Date(Date.now() + parsed.data.expiresInDays * 86400000)
      : undefined;

    const record = await dbCreateApiKey({
      userId: ctx.user.id,
      name: parsed.data.name,
      keyPrefix: prefix,
      keyHash: hash,
      scopes: scopes as string[],
      expiresAt,
    });

    createAuditLog({
      userId: ctx.user.id,
      action: 'apikey.create',
      target: record.id,
      ip: req.headers.get('x-forwarded-for') ?? undefined,
    }).catch((err) => log.warn({ err, userId: ctx.user.id }, 'Audit log failed'));

    // Return plaintext key ONLY on creation (never stored in DB)
    return successResponse(
      {
        id: record.id,
        name: record.name,
        key: plaintext,
        keyPrefix: prefix,
        scopes,
        expiresAt: record.expiresAt,
        createdAt: record.createdAt,
      },
      201
    );
  }
);
