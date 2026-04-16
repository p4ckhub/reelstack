/** Subtitle style template CRUD. */
import { prisma, prismaRead } from './client';

export async function createTemplate(data: {
  userId: string;
  name: string;
  description?: string;
  style: object;
  category?: string;
  isPublic?: boolean;
}) {
  return prisma.template.create({
    data: {
      userId: data.userId,
      name: data.name,
      description: data.description ?? '',
      style: data.style,
      category: data.category ?? 'custom',
      isPublic: data.isPublic ?? false,
    },
  });
}

export async function getTemplatesByUser(userId: string) {
  return prismaRead.template.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getTemplateById(id: string, userId: string) {
  return prismaRead.template.findFirst({ where: { id, userId } });
}

export async function getPublicTemplates(cursor?: string, limit = 20) {
  return prismaRead.template.findMany({
    where: { isPublic: true },
    orderBy: { usageCount: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
}

export async function updateTemplate(
  id: string,
  userId: string,
  data: {
    name?: string;
    description?: string;
    style?: object;
    category?: string;
    isPublic?: boolean;
  }
) {
  return prisma.template.updateMany({
    where: { id, userId },
    data,
  });
}

export async function deleteTemplate(id: string, userId: string) {
  return prisma.template.deleteMany({ where: { id, userId } });
}

export async function incrementTemplateUsage(id: string) {
  return prisma.template.update({
    where: { id },
    data: { usageCount: { increment: 1 } },
  });
}
