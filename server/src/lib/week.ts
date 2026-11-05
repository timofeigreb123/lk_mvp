/** Начало семестра: от него чередуются верхняя и нижняя недели (первая неделя — верхняя). */
export const SEMESTER_START = new Date(2026, 8, 1);

/** Расписание звонков (номер пары → время). */
export const BELLS = [
  { n: 1, start: '08:00', end: '09:30' },
  { n: 2, start: '09:40', end: '11:10' },
  { n: 3, start: '11:20', end: '12:50' },
  { n: 4, start: '13:30', end: '15:00' },
  { n: 5, start: '15:10', end: '16:40' },
  { n: 6, start: '16:50', end: '18:20' },
  { n: 7, start: '18:30', end: '20:00' },
];

const DAY = 864e5;

export function mondayOf(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  return r;
}

/** UPPER — верхняя неделя, LOWER — нижняя. */
export function weekType(d: Date): 'UPPER' | 'LOWER' {
  const weeks = Math.round((mondayOf(d).getTime() - mondayOf(SEMESTER_START).getTime()) / (7 * DAY));
  return ((weeks % 2) + 2) % 2 === 0 ? 'UPPER' : 'LOWER';
}

/** Дата в формате YYYY-MM-DD по локальному времени. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
