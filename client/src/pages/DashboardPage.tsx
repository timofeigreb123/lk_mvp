import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowRight, CalendarCheck, ClipboardCheck, MessageCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LessonCard } from '../components/LessonCard';
import { Avatar, Card, Empty, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { fmt, fmtMsgTime, fromNow, lessonState, minutesUntil, WEEK_TYPE } from '../lib/format';
import type { AssignmentItem, ChatItem, Week } from '../lib/types';

const Section = ({ title, to, children }: { title: string; to: string; children: ReactNode }) => (
  <Card className="p-5">
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-lg font-bold">{title}</h2>
      <Link to={to} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
        Все <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
    {children}
  </Card>
);

export function DashboardPage() {
  const user = useUser();
  const isTeacher = user.role === 'TEACHER';
  const today = format(new Date(), 'yyyy-MM-dd');

  // Главная собирается из тех же запросов, что и разделы — кэш общий
  const week = useQuery({ queryKey: ['schedule', `date=${today}`], queryFn: () => api<Week>(`/schedule?date=${today}`) });
  const assignments = useQuery({ queryKey: ['assignments'], queryFn: () => api<AssignmentItem[]>('/assignments') });
  const chats = useQuery({ queryKey: ['chats'], queryFn: () => api<ChatItem[]>('/chats') });

  const day = week.data?.days.find((d) => d.date === today);
  const bells = week.data?.bells ?? [];
  const next = day?.lessons.find((l) => lessonState(today, bells.find((b) => b.n === l.pairNumber)) !== 'past');
  const nextStart = next && bells.find((b) => b.n === next.pairNumber)?.start;
  const minutes = nextStart ? minutesUntil(today, nextStart) : 0;

  const tasks = isTeacher
    ? assignments.data?.filter((a) => a.stats!.toReview > 0)
    : assignments.data?.filter((a) => ['PENDING', 'OVERDUE', 'RETURNED'].includes(a.status!));
  const unreadChats = chats.data?.filter((c) => c.unread > 0) ?? [];

  return (
    <>
      <div className="mb-6">
        <div className="caps">{fmt(new Date(), 'EEEE, d MMMM')} · {week.data && WEEK_TYPE[week.data.weekType]}</div>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">Здравствуйте, {user.fullName.split(' ').slice(1, isTeacher ? 3 : 2).join(' ')}!</h1>
        {next && minutes > 0 && (
          <p className="mt-1 text-muted">
            Следующая пара — <b className="text-ink">{next.subject.name}</b> через {minutes} мин, ауд. {next.room}
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section title="Сегодня" to="/schedule">
            {day?.lessons.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {day.lessons.map((l) => (
                  <LessonCard key={l.id} lesson={l} date={today} bells={bells} showGroup={isTeacher} />
                ))}
              </div>
            ) : (
              <Empty icon={CalendarCheck} title="Сегодня пар нет" text="Можно отдохнуть или заняться заданиями" />
            )}
          </Section>
        </div>

        <Section title="Новые сообщения" to="/chat">
          {unreadChats.length ? (
            <ul className="space-y-1">
              {unreadChats.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <Link to={`/chat/${c.id}`} className="flex items-center gap-3 rounded-lg p-2 hover:bg-bg">
                    <Avatar name={c.title} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{c.title}</div>
                      <div className="truncate text-sm text-muted">{c.lastMessage?.text || 'Файл'}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-muted">{c.lastMessage && fmtMsgTime(c.lastMessage.createdAt)}</span>
                      <span className="rounded-full bg-primary px-1.5 text-xs font-bold text-white">{c.unread}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={MessageCircle} title="Всё прочитано" />
          )}
        </Section>

        <div className="lg:col-span-3">
          <Section title={isTeacher ? 'Работы на проверке' : 'Ближайшие дедлайны'} to="/assignments">
            {tasks?.length ? (
              <ul className="divide-y divide-line">
                {tasks.slice(0, 5).map((a) => (
                  <li key={a.id}>
                    <Link to={`/assignments/${a.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:text-primary">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{a.title}</div>
                        <div className="text-sm text-muted">
                          {a.subject.name}
                          {isTeacher && ` · ${a.group.name}`}
                        </div>
                      </div>
                      {isTeacher ? (
                        <span className="rounded-full bg-yellow-50 px-2.5 py-0.5 text-xs font-semibold text-yellow-800">{a.stats!.toReview} на проверке</span>
                      ) : (
                        <>
                          <span className="text-sm text-muted">{fromNow(a.deadline)}</span>
                          <StatusBadge status={a.status!} />
                        </>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon={ClipboardCheck} title={isTeacher ? 'Нет работ на проверке' : 'Все задания сданы'} />
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
