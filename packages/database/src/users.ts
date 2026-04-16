/**
 * User queries: lookup, upsert, preferences, tier, Sellf customer linking.
 * Owner-tier promotion lives in `apps/web/src/lib/auth.ts` (env-driven).
 */
import { prisma } from './client';

export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function getUserById(userId: string) {
  return prisma.user.findUnique({ where: { id: userId } });
}

export async function upsertUser(id: string, email: string) {
  return prisma.user.upsert({
    where: { id },
    update: { email },
    create: { id, email },
  });
}

export async function getUserPreferences(userId: string): Promise<Record<string, unknown>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  return (user?.preferences as Record<string, unknown>) ?? {};
}

export async function updateUserPreferences(
  userId: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const user = await prisma.$queryRaw<Array<{ preferences: Record<string, unknown> }>>`
    UPDATE "User"
    SET preferences = COALESCE(preferences, '{}'::jsonb) || ${JSON.stringify(data)}::jsonb
    WHERE id = ${userId}
    RETURNING preferences
  `;
  return (user[0]?.preferences as Record<string, unknown>) ?? {};
}

export async function updateUserTier(
  userId: string,
  tier: 'FREE' | 'SOLO' | 'PRO' | 'AGENCY' | 'OWNER'
) {
  return prisma.user.update({
    where: { id: userId },
    data: { tier },
  });
}

export async function getUserBySellfCustomerId(sellfCustomerId: string) {
  return prisma.user.findUnique({ where: { sellfCustomerId } });
}

export async function linkSellfCustomer(userId: string, sellfCustomerId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { sellfCustomerId },
  });
}
