import { NextRequest } from 'next/server';
import { prisma, createAuditLog } from '@reelstack/database';
import { generateApiKey } from '@/lib/api/v1/api-keys';
import { withAuth, successResponse, errorResponse } from '@/lib/api/v1/middleware';
import type { AuthContext } from '@/lib/api/v1/types';

/** POST /api/v1/api-keys/:id/rotate - Rotate an API key (session only) */
export const POST = withAuth(
  { rateLimit: { maxRequests: 20, windowMs: 60_000 } },
  async (req: NextRequest, ctx: AuthContext) => {
    // API key management requires session auth (no API key self-management)
    if (ctx.apiKeyId) {
      return errorResponse('FORBIDDEN', 'Session required to manage API keys', 403);
    }

    const parts = req.nextUrl.pathname.split('/');
    // URL: /api/v1/api-keys/:id/rotate → id is second-to-last
    const id = parts[parts.length - 2];
    if (!id) {
      return errorResponse('VALIDATION_ERROR', 'API key ID required', 400);
    }

    // Find existing key
    const existing = await prisma.apiKey.findFirst({
      where: { id, userId: ctx.user.id, revokedAt: null, isActive: true },
    });

    if (!existing) {
      return errorResponse('NOT_FOUND', 'API key not found', 404);
    }

    // Revoke old key
    await prisma.apiKey.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        revokedReason: 'Rotated',
        isActive: false,
      },
    });

    // Create new key with same settings
    const { plaintext, prefix, hash } = generateApiKey('live');

    const newKey = await prisma.apiKey.create({
      data: {
        userId: ctx.user.id,
        name: existing.name,
        keyPrefix: prefix,
        keyHash: hash,
        scopes: existing.scopes ?? ['*'],
        rateLimitPerMinute: existing.rateLimitPerMinute,
        expiresAt: existing.expiresAt,
      },
    });

    createAuditLog({
      userId: ctx.user.id,
      action: 'apikey.rotate',
      target: id,
      metadata: { newKeyId: newKey.id },
    }).catch(() => {});

    return successResponse({
      id: newKey.id,
      name: newKey.name,
      key: plaintext,
      keyPrefix: prefix,
      scopes: newKey.scopes,
      expiresAt: newKey.expiresAt,
      createdAt: newKey.createdAt,
      rotatedFrom: id,
    });
  },
);
