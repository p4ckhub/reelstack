/** Usage analytics — aggregate credit consumption this month. */
import { prismaRead } from './client';

/** Returns total credits used this month (SUM of creditCost). */
export async function getMonthlyCreditsUsed(userId: string): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const result = await prismaRead.reelJob.aggregate({
    where: { userId, createdAt: { gte: startOfMonth } },
    _sum: { creditCost: true },
  });
  return result._sum.creditCost ?? 0;
}
