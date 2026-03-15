import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import { getTemplatesByUser, createTemplate as dbCreateTemplate } from '@reelstack/database';
import { sanitizeStyle, BUILT_IN_TEMPLATES } from '@reelstack/core';
import { withAuth, successResponse, errorResponse } from '@/lib/api/v1/middleware';
import { createTemplateSchema } from '@/lib/api/v1/schemas';
import type { AuthContext } from '@/lib/api/v1/types';

/** GET /api/v1/templates - List user's templates + built-in */
export const GET = withAuth(
  { scope: API_SCOPES.TEMPLATES_READ },
  async (_req: NextRequest, ctx: AuthContext) => {
    const userTemplates = await getTemplatesByUser(ctx.user.id);

    const builtIn = BUILT_IN_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      style: t.style,
      category: t.category,
      isBuiltIn: true,
      isPublic: true,
    }));

    const custom = userTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      style: t.style,
      category: t.category,
      isBuiltIn: false,
      isPublic: t.isPublic,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    return successResponse([...builtIn, ...custom]);
  }
);

/** POST /api/v1/templates - Create a custom template */
export const POST = withAuth(
  { scope: API_SCOPES.TEMPLATES_WRITE },
  async (req: NextRequest, ctx: AuthContext) => {
    const body = await req.json().catch(() => null);
    if (!body) {
      return errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 400);
    }

    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        'VALIDATION_ERROR',
        parsed.error.issues.map((i) => i.message).join(', '),
        400
      );
    }

    const sanitized = sanitizeStyle(parsed.data.style as Record<string, unknown>);

    const template = await dbCreateTemplate({
      userId: ctx.user.id,
      name: parsed.data.name,
      description: parsed.data.description,
      style: sanitized,
      category: parsed.data.category,
      isPublic: parsed.data.isPublic,
    });

    return successResponse(
      {
        id: template.id,
        name: template.name,
        description: template.description,
        style: template.style,
        category: template.category,
        isPublic: template.isPublic,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      },
      201
    );
  }
);
