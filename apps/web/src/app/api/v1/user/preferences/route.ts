import { NextRequest } from 'next/server';
import { getUserPreferences, updateUserPreferences } from '@reelstack/database';
import { withAuth, successResponse, errorResponse } from '@/lib/api/v1/middleware';
import { updatePreferencesSchema } from '@/lib/api/v1/schemas';
import { API_SCOPES } from '@reelstack/types';
import type { AuthContext } from '@/lib/api/v1/types';

/** GET /api/v1/user/preferences - Get current user preferences */
export const GET = withAuth(
  { scope: API_SCOPES.USER_READ },
  async (_req: NextRequest, ctx: AuthContext) => {
    const prefs = await getUserPreferences(ctx.user.id);
    return successResponse(prefs);
  }
);

/** PATCH /api/v1/user/preferences - Partial update user preferences */
export const PATCH = withAuth(
  { scope: API_SCOPES.USER_WRITE },
  async (req: NextRequest, ctx: AuthContext) => {
    const body = await req.json().catch(() => null);
    if (!body) {
      return errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 400);
    }

    const parsed = updatePreferencesSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        'VALIDATION_ERROR',
        parsed.error.issues.map((i) => i.message).join(', '),
        400
      );
    }

    const updated = await updateUserPreferences(ctx.user.id, parsed.data);
    return successResponse(updated);
  }
);
