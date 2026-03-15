import { auth } from '@/lib/auth';
import { prisma } from '@reelstack/database';

export async function getAuthUser() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (!dbUser) return null;

  return { dbUser };
}
