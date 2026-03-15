import { NextResponse } from 'next/server';

function withCacheControl(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export function apiError(status: number, message: string) {
  return withCacheControl(NextResponse.json({ error: message }, { status }));
}

export function apiSuccess(data: unknown, status = 200) {
  return withCacheControl(NextResponse.json(data, { status }));
}
