import { differenceInMinutes, format, formatDistanceToNowStrict, isToday, isYesterday } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { Bell, LessonType, Status } from './types';

/** 'YYYY-MM-DD' парсится как локальная дата (а не UTC), остальное — как есть. */
const toDate = (d: string | Date) => (typeof d === 'string' && d.length === 10 ? new Date(d + 'T00:00') : new Date(d));

export const fmt = (d: string | Date, pattern: string) => format(toDate(d), pattern, { locale: ru });

export const fmtDateTime = (d: string | Date) => fmt(d, 'd MMMM, HH:mm');

/** Время сообщения: «14:05», «вчера», «3 нояб.» */
export function fmtMsgTime(d: string) {
  const date = new Date(d);
  if (isToday(date)) return fmt(date, 'HH:mm');
  if (isYesterday(date)) return 'вчера';
  return fmt(date, 'd MMM');
}

/** «через 2 дня» / «3 часа назад» */
export const fromNow = (d: string | Date) =>
  formatDistanceToNowStrict(new Date(d), { locale: ru, addSuffix: true });

export function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 ** 2).toFixed(1)} МБ`;
}

export const initials = (name: string) =>
  name.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase();

/** «Иванов Иван Алексеевич» → «Иванов И. А.» */
export const shortName = (name: string) => {
  const [last, ...rest] = name.split(' ');
  return [last, ...rest.map((p) => p[0] + '.')].join(' ');
};

export const LESSON_TYPE: Record<LessonType, { label: string; bar: string; text: string }> = {
  LECTURE: { label: 'Лекция', bar: 'bg-primary', text: 'text-primary' },
  PRACTICE: { label: 'Практика', bar: 'bg-blue-500', text: 'text-blue-600' },
  LAB: { label: 'Лабораторная', bar: 'bg-violet-500', text: 'text-violet-600' },
};

export const STATUS: Record<Status, { label: string; cls: string }> = {
  PENDING: { label: 'Не сдано', cls: 'bg-gray-100 text-gray-700' },
  OVERDUE: { label: 'Просрочено', cls: 'bg-red-50 text-red-700' },
  SUBMITTED: { label: 'На проверке', cls: 'bg-yellow-50 text-yellow-800' },
  RETURNED: { label: 'На доработку', cls: 'bg-orange-50 text-orange-700' },
  ACCEPTED: { label: 'Принято', cls: 'bg-green-50 text-green-700' },
};

export const WEEK_TYPE = { UPPER: 'Верхняя неделя', LOWER: 'Нижняя неделя' } as const;

/** Состояние пары относительно текущего момента. */
export function lessonState(date: string, bell: Bell | undefined): 'past' | 'now' | 'future' {
  if (!bell) return 'future';
  const start = new Date(`${date}T${bell.start}`);
  const end = new Date(`${date}T${bell.end}`);
  const now = new Date();
  if (now > end) return 'past';
  if (now >= start) return 'now';
  return 'future';
}

/** «через 25 мин» до начала пары */
export function minutesUntil(date: string, time: string) {
  return differenceInMinutes(new Date(`${date}T${time}`), new Date());
}
