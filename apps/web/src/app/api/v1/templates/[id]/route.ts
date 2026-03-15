import { NextRequest } from 'next/server';
import { API_SCOPES } from '@reelstack/types';
import {
  getTemplateById,
  updateTemplate as dbUpdateTemplate,
  deleteTemplate as dbDeleteTemplate,
} from '@reelstack/database';
import { sanitizeStyle, BUILT_IN_TEMPLATES } from '@reelstack/core';
import { withAuth, successResponse, errorResponse } from '@/lib/api/v1/middleware';
import { updateTemplateSchema } from '@/lib/api/v1/schemas';
import type { AuthContext } from '@/lib/api/v1/types';

/** GET /api/v1/templates/:id */
export const GET = withAuth(
  { scope: API_SCOPES.TEMPLATES_READ },
  async (_req: NextRequest, ctx: AuthContext) => {
    // Extract id from URL
    const id = extractId(_req.url);

    // Check built-in templates first
    const builtIn = BUILT_IN_TEMPLATES.find((t) => t.id === id);
    if (builtIn) {
      return successResponse({
        id: builtIn.id,
        name: builtIn.name,
        description: builtIn.description,
        style: builtIn.style,
        category: builtIn.category,
        isBuiltIn: true,
        isPublic: true,
      });
    }

    const template = await getTemplateById(id, ctx.user.id);
    if (!template) {
      return errorResponse('NOT_FOUND', 'Template not found', 404);
    }

    return successResponse({
      id: template.id,
      name: template.name,
      description: template.description,
      style: template.style,
      category: template.category,
      isBuiltIn: false,
      isPublic: template.isPublic,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    });
  }
);

/** PATCH /api/v1/templates/:id */
export const PATCH = withAuth(
  { scope: API_SCOPES.TEMPLATES_WRITE },
  async (req: NextRequest, ctx: AuthContext) => {
    const id = extractId(req.url);

    // Cannot update built-in templates
    if (BUILT_IN_TEMPLATES.some((t) => t.id === id)) {
      return errorResponse('FORBIDDEN', 'Cannot modify built-in templates', 403);
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 400);
    }

    const parsed = updateTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        'VALIDATION_ERROR',
        parsed.error.issues.map((i) => i.message).join(', '),
        400
      );
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.category !== undefined) updateData.category = parsed.data.category;
    if (parsed.data.isPublic !== undefined) updateData.isPublic = parsed.data.isPublic;
    if (parsed.data.style !== undefined) {
      updateData.style = sanitizeStyle(parsed.data.style as Record<string, unknown>);
    }

    const result = await dbUpdateTemplate(id, ctx.user.id, updateData);
    if (result.count === 0) {
      return errorResponse('NOT_FOUND', 'Template not found', 404);
    }

    return successResponse({ updated: true });
  }
);

/** DELETE /api/v1/templates/:id */
export const DELETE = withAuth(
  { scope: API_SCOPES.TEMPLATES_WRITE },
  async (_req: NextRequest, ctx: AuthContext) => {
    const id = extractId(_req.url);

    if (BUILT_IN_TEMPLATES.some((t) => t.id === id)) {
      return errorResponse('FORBIDDEN', 'Cannot delete built-in templates', 403);
    }

    const result = await dbDeleteTemplate(id, ctx.user.id);
    if (result.count === 0) {
      return errorResponse('NOT_FOUND', 'Template not found', 404);
    }

    return successResponse({ deleted: true });
  }
);

function extractId(url: string): string {
  const parts = new URL(url).pathname.split('/');
  return parts[parts.length - 1];
}
