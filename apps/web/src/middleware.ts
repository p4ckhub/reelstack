import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Auth.js v5 stores session in this cookie (JWT strategy)
  const sessionToken =
    req.cookies.get('authjs.session-token')?.value ||
    req.cookies.get('__Secure-authjs.session-token')?.value;
  const isLoggedIn = !!sessionToken;

  // Protect dashboard routes
  if (pathname.startsWith('/dashboard') && !isLoggedIn) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // API v1 routes handle their own auth (API key or session)
  if (pathname.startsWith('/api/v1')) {
    return NextResponse.next();
  }

  // Protect API routes (except auth, health, inngest)
  if (
    pathname.startsWith('/api') &&
    !pathname.startsWith('/api/auth') &&
    !pathname.startsWith('/api/health') &&
    !pathname.startsWith('/api/inngest') &&
    !isLoggedIn
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Redirect authenticated users away from auth pages
  if (pathname.startsWith('/login') && isLoggedIn) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*', '/login'],
};
