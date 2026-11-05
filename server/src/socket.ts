import type { Server as HttpServer } from 'node:http';
import { parse } from 'cookie';
import { Server } from 'socket.io';
import { verifyToken } from './auth.js';
import { prisma } from './lib/db.js';
import { markRead, sendMessage } from './routes/chat.js';

let io: Server;
export const getIo = () => io;

/** userId → число открытых вкладок (онлайн, пока > 0). */
const online = new Map<number, number>();

type Ack = (r: { ok: true } | { error: string }) => void;

export function initSocket(server: HttpServer) {
  io = new Server(server);

  // Авторизация по той же httpOnly-cookie, что и REST
  io.use((socket, next) => {
    const id = verifyToken(parse(socket.handshake.headers.cookie ?? '').token);
    if (!id) return next(new Error('unauthorized'));
    socket.data.userId = id;
    next();
  });

  io.on('connection', async (socket) => {
    const userId: number = socket.data.userId;
    const chats = await prisma.chatMember.findMany({ where: { userId }, select: { chatId: true } });
    socket.join([`user:${userId}`, ...chats.map((c) => `chat:${c.chatId}`)]);

    online.set(userId, (online.get(userId) ?? 0) + 1);
    io.emit('presence', { userId, online: true });
    socket.emit('presence:list', [...online.keys()]);

    // Данные от клиента не доверенные: всё приводим к нужным типам, ошибки не роняют процесс
    socket.on('message:send', async (p: { chatId?: number; text?: string; fileIds?: number[] }, ack?: Ack) => {
      try {
        const fileIds = Array.isArray(p?.fileIds) ? p.fileIds.map(Number).filter(Number.isInteger) : [];
        await sendMessage(userId, Number(p?.chatId), String(p?.text ?? ''), fileIds);
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ error: e instanceof Error ? e.message : 'Ошибка' });
      }
    });

    socket.on('typing', (p?: { chatId?: number }) => {
      const chatId = Number(p?.chatId);
      if (socket.rooms.has(`chat:${chatId}`)) socket.to(`chat:${chatId}`).emit('typing', { chatId, userId });
    });

    socket.on('read', (p?: { chatId?: number; messageId?: number }) => {
      const chatId = Number(p?.chatId);
      const messageId = Number(p?.messageId);
      if (Number.isInteger(chatId) && Number.isInteger(messageId)) markRead(userId, chatId, messageId).catch(() => {});
    });

    socket.on('disconnect', () => {
      const n = (online.get(userId) ?? 1) - 1;
      if (n > 0) return void online.set(userId, n);
      online.delete(userId);
      io.emit('presence', { userId, online: false });
    });
  });
}
