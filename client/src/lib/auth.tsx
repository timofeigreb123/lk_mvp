import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { api } from './api';
import type { User } from './types';

type Auth = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<Auth>(null!);
export const useAuth = () => useContext(AuthContext);

/** Обязательно внутри защищённых страниц: пользователь уже загружен. */
export const useUser = () => useAuth().user!;

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<User>('/auth/me').catch(() => null),
    staleTime: Infinity,
  });

  // Смена пользователя: выкидываем чужой кэш, но не трогаем сам запрос ['me'] (на него подписан App)
  const switchUser = (user: User | null) => {
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    qc.setQueryData(['me'], user);
  };

  const login = async (email: string, password: string) => {
    switchUser(await api<User>('/auth/login', { body: { email, password } }));
  };

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    switchUser(null);
  };

  return (
    <AuthContext.Provider value={{ user: me.data ?? null, loading: me.isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
