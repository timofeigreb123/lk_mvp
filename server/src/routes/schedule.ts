import { Router } from 'express';
import { z } from 'zod';
import { prisma, publicUser } from '../lib/db.js';
import { addDays, BELLS, mondayOf, SEMESTER_START, weekType, ymd } from '../lib/week.js';

export const scheduleRouter = Router();

/** Справочники для фильтров и форм. */
scheduleRouter.get('/meta', async (req, res) => {
  const [groups, teachers, rooms, teaching] = await Promise.all([
    prisma.group.findMany({ orderBy: { name: 'asc' } }),
    prisma.user.findMany({ where: { role: 'TEACHER' }, select: publicUser, orderBy: { fullName: 'asc' } }),
    prisma.lesson.findMany({ distinct: ['room'], select: { room: true }, orderBy: { room: 'asc' } }),
    // Пары «предмет + группа», которые ведёт преподаватель — для формы создания задания
    req.user.role === 'TEACHER'
      ? prisma.lesson.findMany({
          where: { teacherId: req.user.id },
          distinct: ['subjectId', 'groupId'],
          select: { subject: true, group: { select: { id: true, name: true } } },
        })
      : [],
  ]);
  res.json({ groups, teachers, rooms: rooms.map((r) => r.room), teaching, bells: BELLS, semesterStart: ymd(SEMESTER_START) });
});

/**
 * Расписание на неделю, в которую попадает date.
 * Фильтр: groupId | teacherId | room. По умолчанию — своя группа (студент) или свои пары (преподаватель).
 */
scheduleRouter.get('/schedule', async (req, res) => {
  const q = z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата в формате YYYY-MM-DD').optional(),
      groupId: z.coerce.number().optional(),
      teacherId: z.coerce.number().optional(),
      room: z.string().optional(),
    })
    .parse(req.query);

  const monday = mondayOf(q.date ? new Date(q.date + 'T00:00') : new Date());
  const wt = weekType(monday);

  let filter: object;
  if (q.groupId) filter = { groupId: q.groupId };
  else if (q.teacherId) filter = { teacherId: q.teacherId };
  else if (q.room) filter = { room: q.room };
  else if (req.user.role === 'TEACHER') filter = { teacherId: req.user.id };
  else filter = { groupId: req.user.groupId ?? -1 };

  const lessons = await prisma.lesson.findMany({
    where: { ...filter, weekType: { in: ['ALL', wt] } },
    include: {
      subject: true,
      teacher: { select: { id: true, fullName: true } },
      group: { select: { id: true, name: true } },
    },
    orderBy: [{ pairNumber: 'asc' }, { subgroup: 'asc' }],
  });

  const days = [1, 2, 3, 4, 5, 6].map((dow) => ({
    date: ymd(addDays(monday, dow - 1)),
    dayOfWeek: dow,
    lessons: lessons.filter((l) => l.dayOfWeek === dow),
  }));

  res.json({ weekStart: ymd(monday), weekType: wt, bells: BELLS, days });
});
