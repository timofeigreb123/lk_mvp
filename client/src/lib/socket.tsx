import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from './auth';

type Ctx = { socket: Socket | null; online: Set<number> };
const SocketContext = createContext<Ctx>({ socket: null, online: new Set() });
export const useSocket = () => useContext(SocketContext);

/** Одно WebSocket-соединение на вкладку, пока пользователь залогинен. */
export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [online, setOnline] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!user) return;
    const s = io({ withCredentials: true });
    const refreshChats = () => qc.invalidateQueries({ queryKey: ['chats'] });

    s.on('message:new', refreshChats);
    s.on('chat:new', refreshChats);
    s.on('presence:list', (ids: number[]) => setOnline(new Set(ids)));
    s.on('presence', ({ userId, online }: { userId: number; online: boolean }) =>
      setOnline((prev) => {
        const next = new Set(prev);
        if (online) next.add(userId);
        else next.delete(userId);
        return next;
      }),
    );

    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [user?.id]);

  return <SocketContext.Provider value={{ socket, online }}>{children}</SocketContext.Provider>;
}
