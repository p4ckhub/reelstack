import NextAuth from 'next-auth';
import type { Provider } from 'next-auth/providers';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@reelstack/database';
import { createLogger } from '@reelstack/logger';
import { rateLimit } from '@/lib/api/rate-limit';

const log = createLogger('auth');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Nodemailer = require('next-auth/providers/nodemailer').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Credentials = require('next-auth/providers/credentials').default;

const providers: Provider[] = [
  Nodemailer({
    server: {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    },
    from: process.env.EMAIL_FROM || 'noreply@reelstack.io',
  }),
];

/**
 * Dev-only credentials provider: lets you sign in locally with just an email
 * (no SMTP required). Gated on NODE_ENV=development AND ALLOW_DEV_LOGIN=1
 * so it can never accidentally ship to production.
 */
if (process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_LOGIN === '1') {
  log.warn('⚠️  Dev login provider ENABLED — any email logs in without password');
  providers.push(
    Credentials({
      id: 'dev-login',
      name: 'Dev Login (localhost only)',
      credentials: {
        email: { label: 'Email', type: 'email' },
      },
      async authorize(credentials: Record<string, unknown> | undefined) {
        const email = String(credentials?.email ?? '')
          .trim()
          .toLowerCase();
        if (!email || !email.includes('@')) return null;

        // Upsert user so downstream code (tier, credits) works
        const user = await prisma.user.upsert({
          where: { email },
          update: {},
          create: { email, emailVerified: new Date() },
        });
        return { id: user.id, email: user.email, name: user.name };
      },
    })
  );
}

const useSecureCookies = (process.env.NODE_ENV as string) === 'production';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma as never),
  session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 /* 7 days */ },
  providers,
  pages: {
    signIn: '/login',
    verifyRequest: '/login?verify=1',
  },
  cookies: {
    sessionToken: {
      name: useSecureCookies ? '__Secure-authjs.session-token' : 'authjs.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
      },
    },
    csrfToken: {
      name: useSecureCookies ? '__Host-authjs.csrf-token' : 'authjs.csrf-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
      },
    },
  },
  callbacks: {
    async signIn({ user, account }) {
      // Rate-limit magic link requests: 5 per 10 minutes per email
      if (account?.provider === 'nodemailer' && user.email) {
        const rl = await rateLimit(`magic-link:${user.email}`, {
          maxRequests: 5,
          windowMs: 10 * 60 * 1000,
        });
        if (!rl.success) {
          log.warn({ email: user.email }, 'Magic link rate limit exceeded');
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id! },
          select: { tier: true },
        });
        token.tier = dbUser?.tier ?? 'FREE';
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as unknown as Record<string, unknown>).tier = token.tier;
      }
      return session;
    },
  },
});
