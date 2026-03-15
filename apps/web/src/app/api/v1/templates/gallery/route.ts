import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import { getPublicTemplates } from '@reelstack/database';
import { BUILT_IN_TEMPLATES } from '@reelstack/core';
import { withAuth, successResponse, paginatedResponse } from '@/lib/api/v1/middleware';
import { paginationSchema } from '@/lib/api/v1/schemas';


/** GET /api/v1/templates/gallery - Public template gallery */
export const GET = withAuth(
  { scope: API_SCOPES.TEMPLATES_READ },
  async (req: NextRequest) => {
    const url = new URL(req.url);
    const params = paginationSchema.safeParse({
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    });

    const limit = params.success ? (params.data.limit ?? 20) : 20;
    const cursor = params.success ? params.data.cursor : undefined;

    // First page includes built-in templates
    if (!cursor) {
      const builtIn = BUILT_IN_TEMPLATES.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        style: t.style,
        category: t.category,
        isBuiltIn: true,
        usageCount: t.usageCount,
      }));

      const publicTemplates = await getPublicTemplates(undefined, limit);
      const userTemplates = publicTemplates.slice(0, limit).map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        style: t.style,
        category: t.category,
        isBuiltIn: false,
        usageCount: t.usageCount,
      }));

      return successResponse([...builtIn, ...userTemplates]);
    }

    // Paginated user-created public templates
    const templates = await getPublicTemplates(cursor, limit);
    return paginatedResponse(
      templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        style: t.style,
        category: t.category,
        isBuiltIn: false,
        usageCount: t.usageCount,
      })),
      limit,
      (t) => t.id
    );
  }
);
