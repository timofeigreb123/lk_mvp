import { useQuery } from '@tanstack/react-query';
import { addWeeks, format } from 'date-fns';
import { CalendarOff, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { LessonCard } from '../components/LessonCard';
import { Badge, Button, Card, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { fmt, WEEK_TYPE } from '../lib/format';
import type { Meta, Week } from '../lib/types';

type Filter = { kind: 'mine' | 'groupId' | 'teacherId' | 'room'; value: string };

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');

export function SchedulePage() {
  const user = useUser();
  const [date, setDate] = useState(() => new Date());
  const [filter, setFilter] = useState<Filter>({ kind: 'mine', value: '' });

  const meta = useQuery({ queryKey: ['meta'], queryFn: () => api<Meta>('/meta'), staleTime: Infinity });

  const params = new URLSearchParams({ date: ymd(date) });
  if (filter.kind !== 'mine' && filter.value) params.set(filter.kind, filter.value);
  const week = useQuery({ queryKey: ['schedule', params.toString()], queryFn: () => api<Week>(`/schedule?${params}`) });

  const today = ymd(new Date());
  const options =
    filter.kind === 'groupId'
      ? meta.data?.groups.map((g) => [String(g.id), g.name])
      : filter.kind === 'teacherId'
        ? meta.data?.teachers.map((t) => [String(t.id), t.fullName])
        : filter.kind === 'room'
          ? meta.data?.rooms.map((r) => [r, r])
          : null;

  // В карточке показываем группу, если смотрим пары преподавателя или аудитории
  const showGroup = filter.kind === 'teacherId' || filter.kind === 'room' || (filter.kind === 'mine' && user.role === 'TEACHER');

  const w = week.data;
  return (
    <>
      <PageHeader
        title="Расписание"
        subtitle={
          w && (
            <span className="inline-flex flex-wrap items-center gap-2">
              {fmt(w.days[0].date, 'd MMM')} – {fmt(w.days[5].date, 'd MMM yyyy')}
              <Badge className="bg-primary-soft text-primary">{WEEK_TYPE[w.weekType]}</Badge>
            </span>
          )
        }
        actions={
          <>
            <Button variant="outline" className="!px-2.5" onClick={() => setDate(addWeeks(date, -1))} aria-label="Предыдущая неделя">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => setDate(new Date())}>
              Сегодня
            </Button>
            <Button variant="outline" className="!px-2.5" onClick={() => setDate(addWeeks(date, 1))} aria-label="Следующая неделя">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        }
      />

      {/* Фильтр */}
      <div className="mb-6 flex flex-wrap gap-2">
        <select className="input !w-auto" value={filter.kind} onChange={(e) => setFilter({ kind: e.target.value as Filter['kind'], value: '' })}>
          <option value="mine">{user.role === 'TEACHER' ? 'Мои пары' : `Моя группа (${user.group?.name})`}</option>
          <option value="groupId">Группа</option>
          <option value="teacherId">Преподаватель</option>
          <option value="room">Аудитория</option>
        </select>
        {options && (
          <select className="input !w-auto min-w-48" value={filter.value} onChange={(e) => setFilter({ ...filter, value: e.target.value })}>
            <option value="">— выберите —</option>
            {options.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        )}
      </div>

      {!w ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {w.days.map((d) => {
            const isToday = d.date === today;
            return (
              <Card key={d.date} className={`p-3 ${isToday ? 'ring-2 ring-primary' : ''}`}>
                <div className="mb-3 flex items-baseline justify-between px-1">
                  <span className="font-bold capitalize">{fmt(d.date, 'EEEE')}</span>
                  <span className={`text-sm ${isToday ? 'font-bold text-primary' : 'text-muted'}`}>
                    {isToday ? 'сегодня' : fmt(d.date, 'd MMM')}
                  </span>
                </div>
                <div className="space-y-2">
                  {d.lessons.length ? (
                    d.lessons.map((l) => (
                      <LessonCard key={l.id} lesson={l} date={d.date} bells={w.bells} showGroup={showGroup} />
                    ))
                  ) : (
                    <div className="flex flex-col items-center py-6 text-sm text-muted">
                      <CalendarOff className="mb-1 h-5 w-5" />
                      Нет занятий
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
