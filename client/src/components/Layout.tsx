import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ClipboardList, Home, LogOut, MessageCircle, User as UserIcon } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth, useUser } from '../lib/auth';
import { shortName } from '../lib/format';
import type { ChatItem } from '../lib/types';
import { Avatar } from './ui';

const NAV = [
  { to: '/', label: 'Главная', icon: Home, end: true },
  { to: '/schedule', label: 'Расписание', icon: CalendarDays },
  { to: '/assignments', label: 'Задания', icon: ClipboardList },
  { to: '/chat', label: 'Чат', icon: MessageCircle },
  { to: '/profile', label: 'Профиль', icon: UserIcon },
];

export const Logo = ({ light }: { light?: boolean }) => (
  <div className="flex items-center gap-2">
    <img src="/logo.svg" alt="" className="h-8 w-8" />
    <span className={`text-xl font-extrabold tracking-tight ${light ? 'text-white' : 'text-ink'}`}>ННГАСУ</span>
  </div>
);

export function Layout() {
  const user = useUser();
  const { logout } = useAuth();
  const { data: chats } = useQuery({ queryKey: ['chats'], queryFn: () => api<ChatItem[]>('/chats') });
  const unread = chats?.reduce((n, c) => n + c.unread, 0) ?? 0;
  const badge = (to: string) => (to === '/chat' && unread > 0 ? unread : 0);

  return (
    <div className="min-h-screen md:pl-64">
      {/* Боковая панель (десктоп) */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-ink text-white md:flex">
        <div className="px-6 py-6">
          <Logo light />
          <div className="caps mt-2 !text-white/40">Личный кабинет</div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-white/10 text-white before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-primary' : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {label}
              {badge(to) > 0 && <span className="ml-auto rounded-full bg-primary px-2 text-xs font-bold">{badge(to)}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3 border-t border-white/10 px-5 py-4">
          <Avatar name={user.fullName} size={36} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{shortName(user.fullName)}</div>
            <div className="truncate text-xs text-white/50">{user.group?.name ?? 'Преподаватель'}</div>
          </div>
          <button onClick={logout} title="Выйти" className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Шапка (мобильная) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white px-4 py-3 md:hidden">
        <Logo />
        <button onClick={logout} className="rounded-lg p-2 text-muted hover:bg-bg">
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-6 md:px-8 md:pb-10 md:pt-8">
        <Outlet />
      </main>

      {/* Нижняя навигация (мобильная) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'text-primary' : 'text-muted'}`}
          >
            <Icon className="h-5 w-5" />
            {label}
            {badge(to) > 0 && (
              <span className="absolute right-1/4 top-1 rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">{badge(to)}</span>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
