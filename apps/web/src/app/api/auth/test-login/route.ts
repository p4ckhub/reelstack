import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@reelstack/database';
import { encode } from 'next-auth/jwt';
import { createLogger } from '@reelstack/logger';

const log = createLogger('test-login');

/**
 * POST /api/auth/test-login
 * Test-only endpoint: creates a user and returns a session cookie.
 * Only available when NODE_ENV !== 'production'.
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_TEST_LOGIN !== 'true') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }

  const env = process.env.NODE_ENV as string;

  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    // Upsert user
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email },
    });

    const cookieName =
      env === 'production'
        ? '__Secure-authjs.session-token'
        : 'authjs.session-token';

    // Create JWT matching NextAuth's format (salt = cookie name in Auth.js v5)
    const token = await encode({
      token: {
        id: user.id,
        email: user.email,
        name: user.name,
        tier: user.tier,
        sub: user.id,
      },
      secret: process.env.AUTH_SECRET!,
      salt: cookieName,
      maxAge: 7 * 24 * 60 * 60,
    });

    const response = NextResponse.json({ ok: true, userId: user.id });
    response.cookies.set(cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: env === 'production',
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    log.error({ err: error }, 'Test login error');
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    );
  }
}
