import { NextRequest } from 'next/server';
import { revokeApiKey, createAuditLog } from '@reelstack/database';
import { withAuth, successResponse, errorResponse } from '@/lib/api/v1/middleware';
import type { AuthContext } from '@/lib/api/v1/types';

/** DELETE /api/v1/api-keys/:id - Revoke an API key (session only) */
export const DELETE = withAuth(
  { rateLimit: { maxRequests: 20, windowMs: 60_000 } },
  async (req: NextRequest, ctx: AuthContext) => {
    // API key management requires session auth (no API key self-management)
    if (ctx.apiKeyId) {
      return errorResponse('FORBIDDEN', 'Session required to manage API keys', 403);
    }

    const parts = req.nextUrl.pathname.split('/');
    const id = parts[parts.length - 1];
    if (!id) {
      return errorResponse('VALIDATION_ERROR', 'API key ID required', 400);
    }

    const result = await revokeApiKey(id, ctx.user.id);

    if (result.count === 0) {
      return errorResponse('NOT_FOUND', 'API key not found', 404);
    }

    createAuditLog({
      userId: ctx.user.id,
      action: 'apikey.revoke',
      target: id,
    }).catch(() => {});

    return successResponse({ revoked: true });
  }
);
