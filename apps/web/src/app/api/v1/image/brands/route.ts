import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import { withAuth, successResponse } from '@/lib/api/v1/middleware';
import type { AuthContext } from '@/lib/api/v1/types';

/**
 * GET /api/v1/image/brands
 *
 * Returns list of available built-in brands.
 * Auth required.
 */
export const GET = withAuth(
  { scope: API_SCOPES.REEL_READ },
  async (_req: NextRequest, _ctx: AuthContext) => {
    const { listBrands, DEFAULT_BRANDS_DIR } = await import('@reelstack/image-gen');
    const brands = listBrands(DEFAULT_BRANDS_DIR);
    return successResponse({ brands });
  }
);
