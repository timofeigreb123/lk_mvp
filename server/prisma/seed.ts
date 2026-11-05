/**
 * Демо-данные: 2 группы, 3 преподавателя, 10 студентов, расписание, задания, чаты.
 * Пароль у всех аккаунтов: 123456.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { UPLOAD_DIR } from '../src/lib/upload.js';

const prisma = new PrismaClient();
const DAY = 864e5;
const daysFromNow = (n: number, hour = 23, min = 59) => {
  const d = new Date(Date.now() + n * DAY);
  d.setHours(hour, min, 0, 0);
  return d;
};

/** Создаёт на диске небольшой текстовый файл и возвращает строку для таблицы File. */
function demoFile(name: string, uploaderId: number, content = 'Демонстрационный файл ЛК ННГАСУ.\n') {
  const storedName = randomUUID() + path.extname(name);
  fs.writeFileSync(path.join(UPLOAD_DIR, storedName), content);
  return { originalName: name, storedName, mime: 'text/plain', size: Buffer.byteLength(content), uploaderId };
}

async function main() {
  // Seed идемпотентен: удаляет все данные и загруженные файлы, затем создаёт демо-набор заново
  await prisma.$transaction([
    prisma.file.deleteMany(), prisma.message.deleteMany(), prisma.chatMember.deleteMany(), prisma.chat.deleteMany(),
    prisma.submission.deleteMany(), prisma.assignment.deleteMany(), prisma.lesson.deleteMany(),
    prisma.subject.deleteMany(), prisma.user.deleteMany(), prisma.group.deleteMany(),
  ]);
  for (const f of fs.readdirSync(UPLOAD_DIR)) fs.rmSync(path.join(UPLOAD_DIR, f), { force: true });

  const passwordHash = await bcrypt.hash('123456', 10);

  // --- Группы ---
  const arh = await prisma.group.create({ data: { name: 'АРХ-21', course: 3, faculty: 'Архитектурный факультет' } });
  const pgs = await prisma.group.create({ data: { name: 'ПГС-22', course: 2, faculty: 'Инженерно-строительный институт' } });

  // --- Преподаватели ---
  const teacher = (email: string, fullName: string, department: string) =>
    prisma.user.create({ data: { email, fullName, department, role: 'TEACHER', passwordHash } });
  const petrov = await teacher('teacher@nngasu.ru', 'Петров Сергей Николаевич', 'Кафедра архитектурного проектирования');
  const smirnova = await teacher('teacher2@nngasu.ru', 'Смирнова Елена Викторовна', 'Кафедра строительной механики');
  const kuznecov = await teacher('teacher3@nngasu.ru', 'Кузнецов Андрей Павлович', 'Кафедра инженерной геометрии');

  // --- Студенты ---
  const students = async (groupId: number, prefix: string, names: string[]) =>
    Promise.all(
      names.map((fullName, i) =>
        prisma.user.create({
          data: { email: i === 0 ? `${prefix}@nngasu.ru` : `${prefix}${i + 1}@nngasu.ru`, fullName, groupId, role: 'STUDENT', passwordHash },
        }),
      ),
    );
  const arhS = await students(arh.id, 'student', [
    'Иванов Иван Алексеевич', 'Соколова Анна Игоревна', 'Морозов Дмитрий Олегович', 'Волкова Мария Сергеевна', 'Лебедев Артём Викторович',
  ]);
  const pgsS = await students(pgs.id, 'pgs', [
    'Новиков Кирилл Андреевич', 'Фёдорова Ольга Павловна', 'Козлов Никита Романович', 'Егорова Дарья Денисовна', 'Павлов Максим Ильич',
  ]);
  const [ivanov, sokolova, morozov, volkova] = arhS;

  // --- Предметы ---
  const subj = async (name: string) => prisma.subject.create({ data: { name } });
  const archDesign = await subj('Архитектурное проектирование');
  const archHistory = await subj('История архитектуры');
  const structMech = await subj('Строительная механика');
  const strength = await subj('Сопротивление материалов');
  const concrete = await subj('Железобетонные конструкции');
  const descGeom = await subj('Начертательная геометрия');
  const engGraph = await subj('Инженерная графика');

  // --- Расписание: [день, пара, неделя, предмет, преподаватель, тип, аудитория, подгруппа?] ---
  type Row = [number, number, string, { id: number }, { id: number }, string, string, number?];
  const lessons = async (groupId: number, rows: Row[]) =>
    prisma.lesson.createMany({
      data: rows.map(([dayOfWeek, pairNumber, weekType, s, t, type, room, subgroup]) => ({
        groupId, dayOfWeek, pairNumber, weekType, subjectId: s.id, teacherId: t.id, type, room, subgroup,
      })),
    });

  await lessons(arh.id, [
    [1, 1, 'ALL', archDesign, petrov, 'LECTURE', 'А-301'],
    [1, 2, 'ALL', archDesign, petrov, 'PRACTICE', 'А-305'],
    [1, 4, 'UPPER', structMech, smirnova, 'LECTURE', 'Б-210'],
    [2, 2, 'ALL', archHistory, petrov, 'LECTURE', 'А-101'],
    [2, 3, 'LOWER', descGeom, kuznecov, 'PRACTICE', 'В-412'],
    [2, 3, 'UPPER', descGeom, kuznecov, 'LAB', 'В-415'],
    [3, 1, 'ALL', structMech, smirnova, 'PRACTICE', 'Б-214'],
    [3, 2, 'ALL', engGraph, kuznecov, 'PRACTICE', 'В-412'],
    [4, 3, 'ALL', archDesign, petrov, 'PRACTICE', 'А-305'],
    [4, 4, 'ALL', archDesign, petrov, 'PRACTICE', 'А-305'],
    [4, 5, 'LOWER', archHistory, petrov, 'PRACTICE', 'А-103'],
    [5, 2, 'ALL', descGeom, kuznecov, 'LECTURE', 'В-101'],
    [5, 3, 'LOWER', structMech, smirnova, 'LAB', 'Б-118', 1],
    [6, 1, 'UPPER', engGraph, kuznecov, 'LECTURE', 'В-101'],
  ]);
  await lessons(pgs.id, [
    [1, 2, 'ALL', strength, smirnova, 'LECTURE', 'Б-201'],
    [1, 3, 'ALL', strength, smirnova, 'PRACTICE', 'Б-214'],
    [2, 1, 'ALL', concrete, smirnova, 'LECTURE', 'Б-201'],
    [2, 2, 'UPPER', engGraph, kuznecov, 'PRACTICE', 'В-412'],
    [3, 3, 'ALL', structMech, smirnova, 'LECTURE', 'Б-210'],
    [3, 4, 'LOWER', concrete, smirnova, 'PRACTICE', 'Б-216'],
    [4, 1, 'ALL', descGeom, kuznecov, 'LECTURE', 'В-101'],
    [4, 2, 'ALL', strength, smirnova, 'LAB', 'Б-118'],
    [4, 6, 'UPPER', archDesign, petrov, 'LECTURE', 'А-301'],
    [5, 1, 'ALL', structMech, smirnova, 'PRACTICE', 'Б-214'],
    [5, 2, 'ALL', concrete, smirnova, 'PRACTICE', 'Б-216'],
  ]);

  // --- Задания ---
  const assignment = (data: {
    title: string; description: string; deadline: Date; subject: { id: number }; group: { id: number }; teacher: { id: number }; files?: string[];
  }) =>
    prisma.assignment.create({
      data: {
        title: data.title,
        description: data.description,
        deadline: data.deadline,
        subjectId: data.subject.id,
        groupId: data.group.id,
        teacherId: data.teacher.id,
        files: { create: (data.files ?? []).map((n) => demoFile(n, data.teacher.id, `Методические указания: ${data.title}\n`)) },
      },
    });

  const a1 = await assignment({
    title: 'Эскизный проект индивидуального жилого дома',
    description: 'Разработать эскиз: генплан, планы этажей, 2 фасада, разрез. Формат А1, допускается PDF или DWG.',
    deadline: daysFromNow(5), subject: archDesign, group: arh, teacher: petrov, files: ['Задание_эскизный_проект.txt'],
  });
  const a2 = await assignment({
    title: 'РГР №2. Расчёт статически определимой фермы',
    description: 'Определить усилия в стержнях фермы методом вырезания узлов. Вариант — по номеру в списке группы.',
    deadline: daysFromNow(2), subject: structMech, group: arh, teacher: smirnova, files: ['Варианты_РГР2.txt'],
  });
  const a3 = await assignment({
    title: 'Эпюр №1. Пересечение поверхностей',
    description: 'Построить линию пересечения конуса и цилиндра. Оформление — по ГОСТ 2.301.',
    deadline: daysFromNow(-3), subject: descGeom, group: arh, teacher: kuznecov,
  });
  await assignment({
    title: 'Реферат: архитектура Нижнего Новгорода XIX века',
    description: 'Объём 15–20 страниц, не менее 10 источников. Тему согласовать на практике.',
    deadline: daysFromNow(12), subject: archHistory, group: arh, teacher: petrov,
  });
  const a5 = await assignment({
    title: 'Чертёж узла в AutoCAD',
    description: 'Выполнить чертёж узла сопряжения балки и колонны. Сдать в формате DWG.',
    deadline: daysFromNow(-1), subject: engGraph, group: arh, teacher: kuznecov,
  });
  await assignment({
    title: 'Лабораторная работа №3. Испытание стали на растяжение',
    description: 'Оформить протокол испытаний, построить диаграмму растяжения, сделать выводы.',
    deadline: daysFromNow(4), subject: strength, group: pgs, teacher: smirnova,
  });
  await assignment({
    title: 'Курсовой проект: расчёт плиты перекрытия',
    description: 'Расчёт и конструирование многопустотной плиты. Пояснительная записка + лист графики.',
    deadline: daysFromNow(20), subject: concrete, group: pgs, teacher: smirnova,
  });

  // --- Сдачи ---
  const submit = (assignmentId: number, student: { id: number; fullName: string }, extra: object = {}, attempt = 1) =>
    prisma.submission.create({
      data: {
        assignmentId, studentId: student.id, attempt, status: 'SUBMITTED',
        files: { create: [demoFile(`Работа_${student.fullName.split(' ')[0]}_${attempt}.txt`, student.id)] },
        ...extra,
      },
    });
  await submit(a2.id, sokolova, { comment: 'Вариант 2' });
  await submit(a2.id, morozov, { comment: 'Вариант 3' });
  await submit(a1.id, volkova);
  await submit(a3.id, ivanov, { status: 'ACCEPTED', grade: '5', teacherComment: 'Отлично, аккуратное оформление.', reviewedAt: new Date() });
  await submit(a3.id, sokolova, { status: 'ACCEPTED', grade: '4', teacherComment: 'Есть неточности в обводке.', reviewedAt: new Date() });
  await submit(a5.id, ivanov, {
    status: 'RETURNED', teacherComment: 'Не проставлены размеры и выноски. Исправьте и сдайте повторно.', reviewedAt: new Date(),
  });

  // --- Чаты ---
  const groupChat = async (group: { id: number; name: string }, members: { id: number }[]) =>
    prisma.chat.create({
      data: { type: 'GROUP', title: `${group.name} · группа`, groupId: group.id, members: { create: members.map((m) => ({ userId: m.id })) } },
    });
  const arhChat = await groupChat(arh, [...arhS, petrov, smirnova, kuznecov]);
  await groupChat(pgs, [...pgsS, petrov, smirnova, kuznecov]);

  const direct = (a: { id: number }, b: { id: number }) =>
    prisma.chat.create({ data: { type: 'DIRECT', members: { create: [{ userId: a.id }, { userId: b.id }] } } });

  const say = (chatId: number, sender: { id: number }, text: string, minutesAgo: number) =>
    prisma.message.create({ data: { chatId, senderId: sender.id, text, createdAt: new Date(Date.now() - minutesAgo * 60e3) } });

  await say(arhChat.id, petrov, 'Коллеги, напоминаю: в четверг сдача эскизов на клаузуру.', 300);
  await say(arhChat.id, sokolova, 'Сергей Николаевич, можно в цифровом виде?', 290);
  await say(arhChat.id, petrov, 'Можно, PDF через раздел «Задания».', 285);

  const d1 = await direct(ivanov, petrov);
  await say(d1.id, ivanov, 'Здравствуйте! Подскажите, какой масштаб для генплана?', 180);
  await say(d1.id, petrov, 'Добрый день. 1:500, план этажей — 1:100.', 170);
  await say(d1.id, ivanov, 'Спасибо!', 165);
  const last = await say(d1.id, petrov, 'И не забудьте экспликацию помещений.', 20);

  const d2 = await direct(ivanov, sokolova);
  await say(d2.id, sokolova, 'Ваня, ты уже сделал РГР по строймеху?', 60);

  // Отметки прочитанного: у Иванова одно непрочитанное от Петрова и одно от Соколовой
  const all = await prisma.message.findMany({ select: { id: true, chatId: true } });
  const maxId = (chatId: number) => Math.max(...all.filter((m) => m.chatId === chatId).map((m) => m.id));
  await prisma.chatMember.updateMany({ where: { chatId: arhChat.id }, data: { lastReadMessageId: maxId(arhChat.id) } });
  await prisma.chatMember.update({ where: { chatId_userId: { chatId: d1.id, userId: ivanov.id } }, data: { lastReadMessageId: last.id - 1 } });
  await prisma.chatMember.update({ where: { chatId_userId: { chatId: d1.id, userId: petrov.id } }, data: { lastReadMessageId: last.id } });

  console.log('Seed готов. Вход: student@nngasu.ru / teacher@nngasu.ru, пароль 123456');
}

main().finally(() => prisma.$disconnect());
