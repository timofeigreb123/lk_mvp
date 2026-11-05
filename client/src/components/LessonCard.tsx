import { ClipboardList, MapPin, MessageCircle, User as UserIcon, Users } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { fmt, LESSON_TYPE, lessonState, shortName } from '../lib/format';
import type { Bell, Lesson } from '../lib/types';
import { Badge, Button, Modal } from './ui';

/** Карточка пары. Клик — подробности и быстрые действия. */
export function LessonCard({ lesson, date, bells, showGroup }: { lesson: Lesson; date: string; bells: Bell[]; showGroup?: boolean }) {
  const [open, setOpen] = useState(false);
  const bell = bells.find((b) => b.n === lesson.pairNumber);
  const state = lessonState(date, bell);
  const t = LESSON_TYPE[lesson.type];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`relative w-full overflow-hidden rounded-lg border p-3 pl-4 text-left transition hover:shadow-md ${
          state === 'now' ? 'border-primary bg-primary-soft ring-2 ring-primary/30' : 'border-line bg-white'
        } ${state === 'past' ? 'opacity-60' : ''}`}
      >
        <span className={`absolute inset-y-0 left-0 w-1 ${t.bar}`} />
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-muted">
            {lesson.pairNumber} пара · {bell?.start}–{bell?.end}
          </span>
          {state === 'now' && <Badge className="bg-primary text-white">Сейчас</Badge>}
        </div>
        <div className="mt-1 font-semibold leading-snug">{lesson.subject.name}</div>
        <div className={`mt-0.5 text-xs font-semibold ${t.text}`}>
          {t.label}
          {lesson.subgroup && ` · подгр. ${lesson.subgroup}`}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {lesson.room}
          </span>
          <span className="inline-flex items-center gap-1">
            {showGroup ? <Users className="h-3.5 w-3.5" /> : <UserIcon className="h-3.5 w-3.5" />}
            {showGroup ? lesson.group.name : shortName(lesson.teacher.fullName)}
          </span>
        </div>
      </button>
      <LessonModal open={open} onClose={() => setOpen(false)} lesson={lesson} date={date} bell={bell} />
    </>
  );
}

function LessonModal({ open, onClose, lesson, date, bell }: { open: boolean; onClose: () => void; lesson: Lesson; date: string; bell?: Bell }) {
  const user = useUser();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const writeTeacher = async () => {
    setLoading(true);
    try {
      const { id } = await api<{ id: number }>('/chats/direct', { body: { userId: lesson.teacher.id } });
      navigate(`/chat/${id}`);
    } finally {
      setLoading(false);
    }
  };

  const rows = [
    ['Дата', `${fmt(date + 'T00:00', 'EEEE, d MMMM')}, ${bell?.start}–${bell?.end}`],
    ['Тип', LESSON_TYPE[lesson.type].label + (lesson.subgroup ? `, подгруппа ${lesson.subgroup}` : '')],
    ['Периодичность', lesson.weekType === 'ALL' ? 'каждую неделю' : `только по ${lesson.weekType === 'UPPER' ? 'верхним' : 'нижним'} неделям`],
    ['Аудитория', lesson.room],
    ['Преподаватель', lesson.teacher.fullName],
    ['Группа', lesson.group.name],
  ];

  return (
    <Modal open={open} onClose={onClose} title={lesson.subject.name}>
      <dl className="space-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-4">
            <dt className="w-32 shrink-0 text-muted">{k}</dt>
            <dd className="font-medium first-letter:uppercase">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => navigate(`/assignments?subject=${lesson.subject.id}`)}>
          <ClipboardList className="h-4 w-4" /> Задания по предмету
        </Button>
        {lesson.teacher.id !== user.id && (
          <Button onClick={writeTeacher} loading={loading}>
            <MessageCircle className="h-4 w-4" /> Написать преподавателю
          </Button>
        )}
      </div>
    </Modal>
  );
}
