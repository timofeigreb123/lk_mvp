import { Router } from 'express';
import { z } from 'zod';
import { prisma, publicUser } from '../lib/db.js';
import { forbidden, HttpError, intId } from '../lib/http.js';
import { fileSelect } from '../lib/upload.js';
import { getIo } from '../socket.js';

export const chatRouter = Router();

const messageInclude = {
  sender: { select: { id: true, fullName: true } },
  files: { select: fileSelect },
} as const;

async function assertMember(chatId: number, userId: number) {
  const m = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId } } });
  if (!m) throw forbidden();
  return m;
}

/** Сохраняет сообщение и рассылает его всем участникам чата. Вызывается из сокета. */
export async function sendMessage(userId: number, chatId: number, text: string, fileIds: number[] = []) {
  await assertMember(chatId, userId);
  text = text.trim();
  if (!text && !fileIds.length) throw new HttpError(400, 'Пустое сообщение');
  if (text.length > 4000) throw new HttpError(400, 'Сообщение длиннее 4000 символов');

  const msg = await prisma.message.create({ data: { chatId, senderId: userId, text } });
  if (fileIds.length) {
    // Прикрепить можно только свои, ещё ни к чему не привязанные файлы
    await prisma.file.updateMany({
      where: { id: { in: fileIds }, uploaderId: userId, messageId: null, assignmentId: null, submissionId: null },
      data: { messageId: msg.id },
    });
  }
  await markRead(userId, chatId, msg.id);
  const full = await prisma.message.findUniqueOrThrow({ where: { id: msg.id }, include: messageInclude });
  getIo().to(`chat:${chatId}`).emit('message:new', full);
  return full;
}

export async function markRead(userId: number, chatId: number, messageId: number) {
  const { count } = await prisma.chatMember.updateMany({
    where: { chatId, userId, lastReadMessageId: { lt: messageId } },
    data: { lastReadMessageId: messageId },
  });
  if (count) getIo().to(`chat:${chatId}`).emit('read', { chatId, userId, messageId });
}

/** Список чатов пользователя: последнее сообщение, число непрочитанных, собеседник. */
chatRouter.get('/chats', async (req, res) => {
  const me = req.user.id;
  const memberships = await prisma.chatMember.findMany({
    where: { userId: me },
    include: {
      chat: {
        include: {
          members: { include: { user: { select: { id: true, fullName: true, role: true } } } },
          messages: { orderBy: { id: 'desc' }, take: 1, include: messageInclude },
        },
      },
    },
  });

  const chats = await Promise.all(
    memberships.map(async ({ chat, lastReadMessageId }) => {
      const peer = chat.type === 'DIRECT' ? chat.members.find((m) => m.userId !== me)?.user ?? null : null;
      return {
        id: chat.id,
        type: chat.type,
        title: peer?.fullName ?? chat.title ?? 'Чат',
        peer,
        membersCount: chat.members.length,
        lastMessage: chat.messages[0] ?? null,
        unread: await prisma.message.count({
          where: { chatId: chat.id, id: { gt: lastReadMessageId }, senderId: { not: me } },
        }),
      };
    }),
  );
  chats.sort((a, b) => (b.lastMessage?.id ?? 0) - (a.lastMessage?.id ?? 0));
  res.json(chats);
});

/** История сообщений порциями по 30, от новых к старым (параметр before = id). */
chatRouter.get('/chats/:id/messages', async (req, res) => {
  const chatId = intId(req.params.id);
  await assertMember(chatId, req.user.id);
  const before = req.query.before ? intId(req.query.before) : undefined;
  const LIMIT = 30;

  const [messages, others] = await Promise.all([
    prisma.message.findMany({
      where: { chatId, ...(before && { id: { lt: before } }) },
      include: messageInclude,
      orderBy: { id: 'desc' },
      take: LIMIT + 1,
    }),
    prisma.chatMember.findMany({ where: { chatId, userId: { not: req.user.id } } }),
  ]);

  res.json({
    messages: messages.slice(0, LIMIT).reverse(),
    hasMore: messages.length > LIMIT,
    // До какого id сообщения прочитаны собеседником(ами) — для галочек ✓✓
    readUpTo: Math.max(0, ...others.map((o) => o.lastReadMessageId)),
  });
});

/** Найти или создать личный диалог с пользователем. */
chatRouter.post('/chats/direct', async (req, res) => {
  const me = req.user.id;
  const { userId } = z.object({ userId: z.number() }).parse(req.body);
  if (userId === me) throw new HttpError(400, 'Нельзя написать самому себе');
  if (!(await prisma.user.findUnique({ where: { id: userId } }))) throw new HttpError(404, 'Пользователь не найден');

  const existing = await prisma.chat.findFirst({
    where: { type: 'DIRECT', AND: [{ members: { some: { userId: me } } }, { members: { some: { userId } } }] },
  });
  if (existing) return res.json({ id: existing.id });

  const chat = await prisma.chat.create({
    data: { type: 'DIRECT', members: { create: [{ userId: me }, { userId }] } },
  });
  // Подписываем уже открытые сокеты обоих участников на новый чат
  const io = getIo();
  io.in([`user:${me}`, `user:${userId}`]).socketsJoin(`chat:${chat.id}`);
  io.to(`user:${userId}`).emit('chat:new', { id: chat.id });
  res.status(201).json({ id: chat.id });
});

/** Поиск людей для нового диалога (фильтр в JS — LIKE в SQLite не умеет регистр кириллицы). */
chatRouter.get('/users/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const users = await prisma.user.findMany({
    where: { id: { not: req.user.id } },
    select: publicUser,
    orderBy: { fullName: 'asc' },
  });
  res.json(users.filter((u) => !q || u.fullName.toLowerCase().includes(q) || u.group?.name.toLowerCase().includes(q)).slice(0, 20));
});
