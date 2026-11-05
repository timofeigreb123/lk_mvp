import { useState, type FormEvent } from 'react';
import { Logo } from '../components/Layout';
import { Button, ErrorText, Field } from '../components/ui';
import { useAuth } from '../lib/auth';

const DEMO = [
  { label: 'Студент · АРХ-21', email: 'student@nngasu.ru' },
  { label: 'Студент · ПГС-22', email: 'pgs@nngasu.ru' },
  { label: 'Преподаватель (Петров С. Н.)', email: 'teacher@nngasu.ru' },
  { label: 'Преподаватель (Смирнова Е. В.)', email: 'teacher2@nngasu.ru' },
];

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e?: FormEvent, creds = { email, password }) => {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(creds.email, creds.password);
    } catch (err) {
      setError(err);
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-12 text-white lg:flex">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-white p-1">
            <img src="/logo.svg" alt="" className="h-8 w-8" />
          </div>
          <span className="text-2xl font-extrabold">ННГАСУ</span>
        </div>
        <div>
          <h1 className="text-5xl font-extrabold leading-tight">Личный кабинет студента и преподавателя</h1>
          <p className="mt-4 max-w-md text-lg text-white/80">Расписание, задания и общение — в одном месте.</p>
        </div>
        <div className="text-sm text-white/70">Нижегородский государственный архитектурно-строительный университет</div>
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10" />
        <div className="absolute -bottom-32 right-24 h-72 w-72 rounded-full bg-white/10" />
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h2 className="text-2xl font-extrabold">Вход</h2>
          <p className="mt-1 text-sm text-muted">Используйте корпоративную почту</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Email">
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student@nngasu.ru" required />
            </Field>
            <Field label="Пароль">
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <ErrorText error={error} />
            <Button className="w-full" loading={loading}>
              Войти
            </Button>
          </form>

          <div className="mt-8 rounded-xl border border-line bg-white p-4">
            <div className="caps mb-2">Демо-доступ · пароль 123456</div>
            <div className="space-y-1">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  onClick={() => submit(undefined, { email: d.email, password: '123456' })}
                  className="flex w-full justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-primary-soft"
                >
                  <span className="font-medium">{d.label}</span>
                  <span className="text-muted">{d.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
