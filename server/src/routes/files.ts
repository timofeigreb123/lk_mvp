import path from 'node:path';
import { Router } from 'express';
import type { AuthUser } from '../auth.js';
import { prisma } from '../lib/db.js';
import { forbidden, HttpError, intId, notFound } from '../lib/http.js';
import { fileRows, fileSelect, upload, UPLOAD_DIR } from '../lib/upload.js';

export const filesRouter = Router();

/** Загрузка вложений для чата. Файлы привязываются к сообщению при отправке. */
filesRouter.post('/files', upload.array('files'), async (req, res) => {
  const rows = fileRows(req.files, req.user.id);
  if (!rows.length) throw new HttpError(400, 'Нет файлов');
  const created = await prisma.$transaction(rows.map((data) => prisma.file.create({ data, select: fileSelect })));
  res.status(201).json(created);
});

type FileRow = { uploaderId: number; assignmentId: number | null; submissionId: number | null; messageId: number | null };

/** Файл доступен тем, кто видит его «владельца»: задание, сдачу или сообщение. */
async function canAccess(user: AuthUser, f: FileRow): Promise<boolean> {
  if (f.uploaderId === user.id) return true;
  if (f.assignmentId) {
    const a = await prisma.assignment.findUnique({ where: { id: f.assignmentId } });
    return !!a && (a.teacherId === user.id || a.groupId === user.groupId);
  }
  if (f.submissionId) {
    const s = await prisma.submission.findUnique({ where: { id: f.submissionId }, include: { assignment: true } });
    return !!s && (s.studentId === user.id || s.assignment.teacherId === user.id);
  }
  if (f.messageId) {
    const m = await prisma.message.findUnique({ where: { id: f.messageId } });
    return !!m && !!(await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId: m.chatId, userId: user.id } } }));
  }
  return false;
}

/** Скачивание. PDF и картинки открываются в браузере, остальное — скачивается. */
filesRouter.get('/files/:id', async (req, res) => {
  const f = await prisma.file.findUnique({ where: { id: intId(req.params.id) } });
  if (!f) throw notFound();
  if (!(await canAccess(req.user, f))) throw forbidden();

  const inline = /^(image\/|application\/pdf|text\/plain)/.test(f.mime);
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.originalName)}`);
  res.type(f.mime).sendFile(path.join(UPLOAD_DIR, f.storedName));
});
