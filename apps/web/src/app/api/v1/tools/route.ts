import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import { discoverTools } from '@reelstack/agent';
import { withAuth, successResponse } from '@/lib/api/v1/middleware';
import type { AuthContext } from '@/lib/api/v1/types';

/**
 * GET /api/v1/tools
 *
 * Returns every generation tool the server can currently reach (i.e.
 * every tool whose env-var key is set). Used by the dashboard wizard
 * to render a "pick an image / video model" dropdown. The planner
 * still picks the best default when the user doesn't override.
 */
export const GET = withAuth(
  { scope: API_SCOPES.REEL_READ },
  async (_req: NextRequest, _ctx: AuthContext) => {
    const tools = discoverTools();
    const manifest = await Promise.all(
      tools.map(async (t) => {
        const health = await t.healthCheck();
        return {
          id: t.id,
          name: t.name,
          available: health.available,
          reason: health.available ? null : (health.reason ?? 'unavailable'),
          assetTypes: t.capabilities.map((c) => c.assetType),
          costTier: t.capabilities[0]?.costTier ?? 'moderate',
        };
      })
    );

    return successResponse({
      tools: manifest.filter((t) => t.available),
    });
  }
);
