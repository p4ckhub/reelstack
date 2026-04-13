/**
 * Shared @/lib/api/v1/middleware mock factory for apps/web tests.
 *
 * Same pattern as database-mock.ts — prevents vi.mock cross-contamination
 * in bun's single-process test runner.
 */
import { vi } from 'vitest';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const mockAuthenticate = vi.fn();

export function middlewareMockFactory() {
  function withAuth(
    _options: unknown,
    handler: (req: NextRequest, ctx: unknown) => Promise<NextResponse>
  ) {
    return async (req: NextRequest) => {
      const ctx = await mockAuthenticate(req);
      if (!ctx) {
        return NextResponse.json(
          { error: { code: 'UNAUTHORIZED', message: 'Invalid or missing authentication' } },
          { status: 401 }
        );
      }
      try {
        return await handler(req, ctx);
      } catch (err) {
        console.error(err);
        return NextResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
          { status: 500 }
        );
      }
    };
  }

  function successResponse(data: unknown, status = 200) {
    return NextResponse.json({ data }, { status });
  }

  function errorResponse(code: string, message: string, status: number) {
    return NextResponse.json({ error: { code, message } }, { status });
  }

  function paginatedResponse(
    items: unknown[],
    limit: number,
    getCursor: (item: unknown) => string
  ) {
    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore && data.length > 0 ? getCursor(data[data.length - 1]) : null;
    return NextResponse.json({ data, pagination: { nextCursor, hasMore } });
  }

  return {
    withAuth,
    successResponse,
    errorResponse,
    paginatedResponse,
    authenticate: mockAuthenticate,
  };
}
