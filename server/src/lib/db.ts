import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

/** Поля пользователя, которые можно отдавать клиенту (без пароля). */
export const publicUser = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  department: true,
  group: { select: { id: true, name: true } },
} as const;
