import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth.js';
import { prisma } from '../lib/db.js';
import { forbidden, HttpError, intId, notFound } from '../lib/http.js';
import { fileRows, fileSelect, upload } from '../lib/upload.js';

export const assignmentsRouter = Router();

type Sub = { status: string; attempt: number; submittedAt: Date };

/**
 * Статус задания для студента. PENDING/OVERDUE не хранятся в БД —
 * вычисляются по дедлайну и последней сдаче.
 */
function studentStatus(deadline: Date, last?: Sub) {
  if (!last) return deadline < new Date() ? 'OVERDUE' : 'PENDING';
  return last.status; // SUBMITTED | RETURNED | ACCEPTED
}

const latest = <T extends Sub>(subs: T[]) => subs.reduce<T | undefined>((a, s) => (!a || s.attempt > a.attempt ? s : a), undefined);

const base = {
  subject: true,
  group: { select: { id: true, name: true } },
  teacher: { select: { id: true, fullName: true } },
} as const;

assignmentsRouter.get('/assignments', async (req, res) => {
  const { id, role, groupId } = req.user;

  if (role === 'STUDENT') {
    const list = await prisma.assignment.findMany({
      where: { groupId: groupId ?? -1 },
      include: { ...base, submissions: { where: { studentId: id } } },
      orderBy: { deadline: 'asc' },
    });
    return res.json(
      list.map(({ submissions, ...a }) => {
        const last = latest(submissions);
        return { ...a, status: studentStatus(a.deadline, last), grade: last?.grade ?? null };
      }),
    );
  }

  const list = await prisma.assignment.findMany({
    where: { teacherId: id },
    include: { ...base, submissions: true },
    orderBy: { deadline: 'asc' },
  });
  const groupSizes = Object.fromEntries(
    (await prisma.user.groupBy({ by: ['groupId'], where: { role: 'STUDENT' }, _count: true })).map((g) => [g.groupId, g._count]),
  );
  res.json(
    list.map(({ submissions, ...a }) => {
      const byStudent = new Map<number, Sub>();
      for (const s of submissions) if ((byStudent.get(s.studentId)?.attempt ?? 0) < s.attempt) byStudent.set(s.studentId, s);
      const lasts = [...byStudent.values()];
      return {
        ...a,
        stats: {
          total: groupSizes[a.groupId] ?? 0,
          submitted: lasts.length,
          toReview: lasts.filter((s) => s.status === 'SUBMITTED').length,
        },
      };
    }),
  );
});

assignmentsRouter.get('/assignments/:id', async (req, res) => {
  const { id: userId, role, groupId } = req.user;
  const a = await prisma.assignment.findUnique({
    where: { id: intId(req.params.id) },
    include: { ...base, files: { select: fileSelect } },
  });
  if (!a) throw notFound();

  const subInclude = { files: { select: fileSelect } };

  if (role === 'STUDENT') {
    if (a.groupId !== groupId) throw forbidden();
    const mySubmissions = await prisma.submission.findMany({
      where: { assignmentId: a.id, studentId: userId },
      include: subInclude,
      orderBy: { attempt: 'asc' },
    });
    return res.json({ ...a, status: studentStatus(a.deadline, latest(mySubmissions)), mySubmissions });
  }

  if (a.teacherId !== userId) throw forbidden();
  const students = await prisma.user.findMany({
    where: { groupId: a.groupId, role: 'STUDENT' },
    select: {
      id: true,
      fullName: true,
      submissions: { where: { assignmentId: a.id }, include: subInclude, orderBy: { attempt: 'asc' } },
    },
    orderBy: { fullName: 'asc' },
  });
  res.json({
    ...a,
    students: students.map(({ submissions, ...s }) => ({
      student: s,
      status: studentStatus(a.deadline, latest(submissions)),
      submissions,
    })),
  });
});

/** Создание задания преподавателем (multipart: поля + files[]). */
assignmentsRouter.post('/assignments', requireRole('TEACHER'), upload.array('files'), async (req, res) => {
  const body = z
    .object({
      title: z.string().trim().min(3, 'Название — минимум 3 символа'),
      description: z.string().trim().default(''),
      deadline: z.coerce.date({ message: 'Укажите дедлайн' }),
      subjectId: z.coerce.number(),
      groupId: z.coerce.number(),
    })
    .parse(req.body);

  const teaches = await prisma.lesson.findFirst({
    where: { teacherId: req.user.id, subjectId: body.subjectId, groupId: body.groupId },
  });
  if (!teaches) throw new HttpError(400, 'Вы не ведёте этот предмет у этой группы');

  const a = await prisma.assignment.create({
    data: { ...body, teacherId: req.user.id, files: { create: fileRows(req.files, req.user.id) } },
  });
  res.status(201).json({ id: a.id });
});

/** Сдача работы студентом. Повторная сдача — только после «на доработку». */
assignmentsRouter.post('/assignments/:id/submissions', requireRole('STUDENT'), upload.array('files'), async (req, res) => {
  const a = await prisma.assignment.findUnique({ where: { id: intId(req.params.id) } });
  if (!a) throw notFound();
  if (a.groupId !== req.user.groupId) throw forbidden();

  const files = fileRows(req.files, req.user.id);
  if (!files.length) throw new HttpError(400, 'Прикрепите хотя бы один файл');

  const last = await prisma.submission.findFirst({
    where: { assignmentId: a.id, studentId: req.user.id },
    orderBy: { attempt: 'desc' },
  });
  if (last && last.status !== 'RETURNED') throw new HttpError(400, 'Работа уже сдана');

  await prisma.submission.create({
    data: {
      assignmentId: a.id,
      studentId: req.user.id,
      attempt: (last?.attempt ?? 0) + 1,
      comment: String(req.body.comment ?? '').trim(),
      status: 'SUBMITTED',
      files: { create: files },
    },
  });
  res.status(201).json({ ok: true });
});

/** Проверка работы преподавателем. */
assignmentsRouter.patch('/submissions/:id/review', requireRole('TEACHER'), async (req, res) => {
  const body = z
    .object({
      status: z.enum(['ACCEPTED', 'RETURNED']),
      grade: z.string().trim().max(20).optional(),
      teacherComment: z.string().trim().optional(),
    })
    .parse(req.body);

  const s = await prisma.submission.findUnique({ where: { id: intId(req.params.id) }, include: { assignment: true } });
  if (!s) throw notFound();
  if (s.assignment.teacherId !== req.user.id) throw forbidden();
  const newer = await prisma.submission.count({
    where: { assignmentId: s.assignmentId, studentId: s.studentId, attempt: { gt: s.attempt } },
  });
  if (newer) throw new HttpError(400, 'Проверять можно только последнюю попытку');

  await prisma.submission.update({
    where: { id: s.id },
    data: { ...body, grade: body.grade || null, reviewedAt: new Date() },
  });
  res.json({ ok: true });
});
