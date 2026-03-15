import { NextRequest } from 'next/server';
import { successResponse } from '@/lib/api/v1/middleware';

/**
 * GET /api/v1/image/templates
 *
 * Returns list of available image templates.
 * Public endpoint — no auth required.
 */
export async function GET(_req: NextRequest) {
  const { listTemplates } = await import('@reelstack/image-gen');
  const templates = listTemplates();
  return successResponse({ templates });
}
