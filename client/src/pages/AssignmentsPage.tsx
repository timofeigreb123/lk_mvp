import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Clock, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, Empty, ErrorText, Field, FileDrop, Modal, PageHeader, Spinner, StatusBadge } from '../components/ui';
import { api, toForm } from '../lib/api';
import { useUser } from '../lib/auth';
import { fmtDateTime, fromNow, STATUS } from '../lib/format';
import type { AssignmentItem, Meta, Status } from '../lib/types';

const STATUS_FILTERS: Status[] = ['PENDING', 'OVERDUE', 'RETURNED', 'SUBMITTED', 'ACCEPTED'];

export function AssignmentsPage() {
  const user = useUser();
  const isTeacher = user.role === 'TEACHER';
  const [params, setParams] = useSearchParams();
  const subject = params.get('subject') ?? '';
  const [status, setStatus] = useState<Status | ''>('');
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ['assignments'], queryFn: () => api<AssignmentItem[]>('/assignments') });

  const subjects = [...new Map(data?.map((a) => [a.subject.id, a.subject])).values()];
  const list = data?.filter((a) => (!subject || a.subject.id === Number(subject)) && (!status || a.status === status));

  return (
    <>
      <PageHeader
        title="Задания"
        subtitle={isTeacher ? 'Задания, которые вы выдали группам' : 'Задания вашей группы и статус сдачи'}
        actions={
          isTeacher && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Новое задание
            </Button>
          )
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <select className="input !w-auto" value={subject} onChange={(e) => setParams(e.target.value ? { subject: e.target.value } : {})}>
          <option value="">Все предметы</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {!isTeacher &&
          (['', ...STATUS_FILTERS] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                status === s ? 'bg-ink text-white' : 'bg-white text-muted hover:text-ink'
              }`}
            >
              {s ? STATUS[s].label : 'Все'}
            </button>
          ))}
      </div>

      {isLoading ? (
        <Spinner />
      ) : !list?.length ? (
        <Card>
          <Empty icon={ClipboardList} title="Заданий нет" text={isTeacher ? 'Создайте первое задание для группы' : 'По выбранным фильтрам ничего не найдено'} />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((a) => (
            <Link key={a.id} to={`/assignments/${a.id}`}>
              <Card className="h-full p-5 transition hover:border-primary hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="caps !text-primary">{a.subject.name}</div>
                  {a.status && <StatusBadge status={a.status} />}
                  {a.stats && <Badge className="bg-primary-soft text-primary">{a.group.name}</Badge>}
                </div>
                <h3 className="mt-2 font-bold leading-snug">{a.title}</h3>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    до {fmtDateTime(a.deadline)} ({fromNow(a.deadline)})
                  </span>
                  {a.grade && <span className="font-semibold text-green-700">Оценка: {a.grade}</span>}
                </div>
                {a.stats && (
                  <div className="mt-3 flex gap-4 text-sm">
                    <span>
                      Сдали: <b>{a.stats.submitted}</b> / {a.stats.total}
                    </span>
                    {a.stats.toReview > 0 && <span className="font-semibold text-yellow-700">На проверке: {a.stats.toReview}</span>}
                  </div>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}

      {isTeacher && <CreateAssignmentModal open={creating} onClose={() => setCreating(false)} />}
    </>
  );
}

function CreateAssignmentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const meta = useQuery({ queryKey: ['meta'], queryFn: () => api<Meta>('/meta'), staleTime: Infinity });
  const [form, setForm] = useState({ pair: '', title: '', description: '', deadline: '' });
  const [files, setFiles] = useState<File[]>([]);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const create = useMutation({
    mutationFn: () => {
      const [subjectId, groupId] = form.pair.split(':');
      return api<{ id: number }>('/assignments', {
        form: toForm({ subjectId, groupId, title: form.title, description: form.description, deadline: new Date(form.deadline).toISOString() }, files),
      });
    },
    onSuccess: ({ id }) => {
      qc.invalidateQueries({ queryKey: ['assignments'] });
      navigate(`/assignments/${id}`);
    },
  });

  const submit = (e: FormEvent) => (e.preventDefault(), create.mutate());

  return (
    <Modal open={open} onClose={onClose} title="Новое задание">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Предмет и группа">
          <select className="input" value={form.pair} onChange={set('pair')} required>
            <option value="">— выберите —</option>
            {meta.data?.teaching.map((t) => (
              <option key={`${t.subject.id}:${t.group.id}`} value={`${t.subject.id}:${t.group.id}`}>
                {t.subject.name} · {t.group.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Название">
          <input className="input" value={form.title} onChange={set('title')} required minLength={3} />
        </Field>
        <Field label="Описание">
          <textarea className="input min-h-24" value={form.description} onChange={set('description')} />
        </Field>
        <Field label="Дедлайн">
          <input className="input" type="datetime-local" value={form.deadline} onChange={set('deadline')} required />
        </Field>
        <div>
          <span className="caps mb-1.5 block">Методические материалы</span>
          <FileDrop files={files} onChange={setFiles} />
        </div>
        <ErrorText error={create.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button loading={create.isPending}>Создать</Button>
        </div>
      </form>
    </Modal>
  );
}
