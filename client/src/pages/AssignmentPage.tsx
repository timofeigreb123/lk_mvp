import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, Clock, User as UserIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar, Badge, Button, Card, ErrorText, FileDrop, FileLinks, Spinner, StatusBadge } from '../components/ui';
import { api, toForm } from '../lib/api';
import { useUser } from '../lib/auth';
import { fmtDateTime, fromNow } from '../lib/format';
import type { AssignmentDetail, Submission } from '../lib/types';

export function AssignmentPage() {
  const { id } = useParams();
  const user = useUser();
  const { data: a, error } = useQuery({ queryKey: ['assignment', id], queryFn: () => api<AssignmentDetail>(`/assignments/${id}`) });

  if (error) return <ErrorText error={error} />;
  if (!a) return <Spinner />;

  return (
    <>
      <Link to="/assignments" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> Все задания
      </Link>

      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="caps !text-primary">{a.subject.name}</span>
          <Badge className="bg-bg text-muted">{a.group.name}</Badge>
          {a.status && <StatusBadge status={a.status} />}
        </div>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight">{a.title}</h1>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> Дедлайн: <b className="text-ink">{fmtDateTime(a.deadline)}</b> ({fromNow(a.deadline)})
          </span>
          <span className="inline-flex items-center gap-1.5">
            <UserIcon className="h-4 w-4" /> {a.teacher.fullName}
          </span>
        </div>
        {a.description && <p className="mt-4 whitespace-pre-line leading-relaxed">{a.description}</p>}
        {a.files.length > 0 && (
          <div className="mt-4">
            <div className="caps">Материалы</div>
            <FileLinks files={a.files} />
          </div>
        )}
      </Card>

      {user.role === 'STUDENT' ? <StudentView a={a} /> : <TeacherView a={a} />}
    </>
  );
}

/* ---------- Студент: сдача и история попыток ---------- */
function StudentView({ a }: { a: AssignmentDetail }) {
  const qc = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [comment, setComment] = useState('');
  const canSubmit = ['PENDING', 'OVERDUE', 'RETURNED'].includes(a.status!);

  const submit = useMutation({
    mutationFn: () => api(`/assignments/${a.id}/submissions`, { form: toForm({ comment }, files) }),
    onSuccess: () => {
      setFiles([]);
      setComment('');
      qc.invalidateQueries({ queryKey: ['assignment', String(a.id)] });
      qc.invalidateQueries({ queryKey: ['assignments'] });
    },
  });

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      {canSubmit && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-bold">{a.status === 'RETURNED' ? 'Повторная сдача' : 'Сдать работу'}</h2>
          <form onSubmit={(e: FormEvent) => (e.preventDefault(), submit.mutate())} className="space-y-4">
            <FileDrop files={files} onChange={setFiles} />
            <textarea className="input min-h-20" placeholder="Комментарий для преподавателя (необязательно)" value={comment} onChange={(e) => setComment(e.target.value)} />
            {a.status === 'OVERDUE' && <p className="text-sm text-red-600">Дедлайн прошёл — работа будет отмечена как сданная с опозданием.</p>}
            <ErrorText error={submit.error} />
            <Button className="w-full" disabled={!files.length} loading={submit.isPending}>
              Отправить на проверку
            </Button>
          </form>
        </Card>
      )}
      <Card className={`p-6 ${canSubmit ? '' : 'lg:col-span-2'}`}>
        <h2 className="mb-4 text-lg font-bold">Мои попытки</h2>
        {a.mySubmissions?.length ? (
          <div className="space-y-4">
            {[...a.mySubmissions].reverse().map((s) => (
              <Attempt key={s.id} s={s} deadline={a.deadline} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Вы ещё не сдавали эту работу.</p>
        )}
      </Card>
    </div>
  );
}

/** Одна попытка сдачи: файлы, комментарий студента, отзыв преподавателя. */
function Attempt({ s, deadline }: { s: Submission; deadline: string }) {
  const late = new Date(s.submittedAt) > new Date(deadline);
  return (
    <div className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <b>Попытка {s.attempt}</b>
        <span className="text-muted">{fmtDateTime(s.submittedAt)}</span>
        {late && <Badge className="bg-red-50 text-red-700">с опозданием</Badge>}
        <span className="ml-auto">
          <StatusBadge status={s.status} />
        </span>
      </div>
      <FileLinks files={s.files} />
      {s.comment && <p className="mt-2 text-sm text-muted">«{s.comment}»</p>}
      {s.reviewedAt && (
        <div className="mt-3 rounded-lg bg-bg p-3 text-sm">
          {s.grade && (
            <div>
              Оценка: <b>{s.grade}</b>
            </div>
          )}
          {s.teacherComment && <div className="mt-1">{s.teacherComment}</div>}
        </div>
      )}
    </div>
  );
}

/* ---------- Преподаватель: список студентов и проверка ---------- */
function TeacherView({ a }: { a: AssignmentDetail }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const students = a.students ?? [];
  const submitted = students.filter((s) => s.submissions.length).length;

  return (
    <Card className="mt-6 overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-6 py-4">
        <h2 className="text-lg font-bold">Сдача работ</h2>
        <span className="text-sm text-muted">
          Сдали {submitted} из {students.length}
        </span>
      </div>
      <ul className="divide-y divide-line">
        {students.map(({ student, status, submissions }) => {
          const last = submissions.at(-1);
          const open = openId === student.id;
          return (
            <li key={student.id}>
              <button
                onClick={() => setOpenId(open ? null : student.id)}
                disabled={!last}
                className="flex w-full items-center gap-3 px-6 py-3 text-left hover:bg-bg disabled:cursor-default disabled:hover:bg-transparent"
              >
                <Avatar name={student.fullName} size={32} />
                <span className="flex-1 font-medium">{student.fullName}</span>
                {last && <span className="hidden text-sm text-muted sm:inline">{fmtDateTime(last.submittedAt)}</span>}
                <StatusBadge status={status} />
                {last && <ChevronDown className={`h-4 w-4 text-muted transition ${open ? 'rotate-180' : ''}`} />}
              </button>
              {open && last && (
                <div className="space-y-3 bg-bg/60 px-6 py-4">
                  {[...submissions].reverse().map((s) => (
                    <Attempt key={s.id} s={s} deadline={a.deadline} />
                  ))}
                  <ReviewForm key={last.id} assignmentId={a.id} submission={last} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

const GRADES = ['5', '4', '3', '2', 'зачёт', 'незачёт'];

function ReviewForm({ assignmentId, submission }: { assignmentId: number; submission: Submission }) {
  const qc = useQueryClient();
  const [grade, setGrade] = useState(submission.grade ?? '');
  const [comment, setComment] = useState(submission.teacherComment ?? '');

  const review = useMutation({
    mutationFn: (status: 'ACCEPTED' | 'RETURNED') =>
      api(`/submissions/${submission.id}/review`, { method: 'PATCH', body: { status, grade, teacherComment: comment } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignment', String(assignmentId)] });
      qc.invalidateQueries({ queryKey: ['assignments'] });
    },
  });

  return (
    <div className="rounded-lg border border-primary/30 bg-white p-4">
      <div className="caps mb-2">Проверка попытки {submission.attempt}</div>
      <div className="flex flex-wrap gap-2">
        {GRADES.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGrade(grade === g ? '' : g)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${grade === g ? 'border-primary bg-primary text-white' : 'border-line hover:border-primary'}`}
          >
            {g}
          </button>
        ))}
      </div>
      <textarea className="input mt-3 min-h-16" placeholder="Комментарий студенту" value={comment} onChange={(e) => setComment(e.target.value)} />
      <ErrorText error={review.error} />
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button variant="outline" loading={review.isPending && review.variables === 'RETURNED'} onClick={() => review.mutate('RETURNED')}>
          На доработку
        </Button>
        <Button loading={review.isPending && review.variables === 'ACCEPTED'} onClick={() => review.mutate('ACCEPTED')}>
          Принять
        </Button>
      </div>
    </div>
  );
}
