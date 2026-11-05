import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Avatar, Button, Card, ErrorText, Field, PageHeader } from '../components/ui';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';

export function ProfilePage() {
  const user = useUser();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const change = useMutation({
    mutationFn: () => api('/auth/password', { body: { current, next } }),
    onSuccess: () => (setCurrent(''), setNext('')),
  });

  const info = [
    ['Email', user.email],
    ['Роль', user.role === 'TEACHER' ? 'Преподаватель' : 'Студент'],
    user.group && ['Группа', user.group.name],
    user.department && ['Кафедра', user.department],
  ].filter(Boolean) as [string, string][];

  return (
    <>
      <PageHeader title="Профиль" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <Avatar name={user.fullName} size={64} />
            <div>
              <div className="text-xl font-bold">{user.fullName}</div>
              <div className="text-sm text-muted">{user.group?.name ?? user.department}</div>
            </div>
          </div>
          <dl className="mt-6 space-y-3 text-sm">
            {info.map(([k, v]) => (
              <div key={k} className="flex gap-4">
                <dt className="w-24 shrink-0 text-muted">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-lg font-bold">Смена пароля</h2>
          <form onSubmit={(e: FormEvent) => (e.preventDefault(), change.mutate())} className="space-y-4">
            <Field label="Текущий пароль">
              <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            </Field>
            <Field label="Новый пароль">
              <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={6} />
            </Field>
            <ErrorText error={change.error} />
            {change.isSuccess && <p className="text-sm text-green-700">Пароль изменён</p>}
            <Button loading={change.isPending}>Сохранить</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
