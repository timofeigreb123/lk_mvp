import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, CheckCheck, MessageCircle, Paperclip, Plus, Search, Send, Users, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ACCEPT, Avatar, Card, Empty, FileLinks, Modal, Spinner } from '../components/ui';
import { api, toForm } from '../lib/api';
import { useUser } from '../lib/auth';
import { fmt, fmtMsgTime, fmtSize, shortName } from '../lib/format';
import { useSocket } from '../lib/socket';
import type { ChatItem, FileInfo, Message, User } from '../lib/types';

export function ChatPage() {
  const { id } = useParams();
  const chatId = id ? Number(id) : null;
  const [search, setSearch] = useState('');
  const [newChat, setNewChat] = useState(false);
  const { online } = useSocket();
  const { data: chats } = useQuery({ queryKey: ['chats'], queryFn: () => api<ChatItem[]>('/chats') });

  const list = chats?.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()));
  const active = chats?.find((c) => c.id === chatId);

  return (
    <Card className="flex h-[calc(100dvh-9.5rem)] overflow-hidden md:h-[calc(100vh-4.5rem)]">
      {/* Список диалогов — на телефоне скрыт, когда открыт чат */}
      <aside className={`w-full flex-col border-r border-line md:flex md:w-80 ${chatId ? 'hidden' : 'flex'}`}>
        <div className="flex items-center gap-2 border-b border-line p-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input !pl-9" placeholder="Поиск" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button onClick={() => setNewChat(true)} title="Новый диалог" className="rounded-lg bg-primary p-2.5 text-white hover:bg-primary-hover">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {!list ? (
            <Spinner />
          ) : (
            list.map((c) => (
              <li key={c.id}>
                <Link to={`/chat/${c.id}`} className={`flex items-center gap-3 px-4 py-3 hover:bg-bg ${c.id === chatId ? 'bg-primary-soft' : ''}`}>
                  {c.type === 'GROUP' ? (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-white">
                      <Users className="h-5 w-5" />
                    </div>
                  ) : (
                    <Avatar name={c.title} size={44} online={!!c.peer && online.has(c.peer.id)} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold">{c.type === 'DIRECT' ? shortName(c.title) : c.title}</span>
                      <span className="shrink-0 text-xs text-muted">{c.lastMessage && fmtMsgTime(c.lastMessage.createdAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-muted">
                        {c.lastMessage ? (c.lastMessage.text || '📎 Файл') : 'Нет сообщений'}
                      </span>
                      {c.unread > 0 && <span className="shrink-0 rounded-full bg-primary px-1.5 text-xs font-bold text-white">{c.unread}</span>}
                    </div>
                  </div>
                </Link>
              </li>
            ))
          )}
        </ul>
      </aside>

      <section className={`min-w-0 flex-1 flex-col ${chatId ? 'flex' : 'hidden md:flex'}`}>
        {chatId ? (
          <Conversation key={chatId} chatId={chatId} chat={active} />
        ) : (
          <div className="m-auto">
            <Empty icon={MessageCircle} title="Выберите диалог" text="Или начните новый — кнопка «+» над списком" />
          </div>
        )}
      </section>

      <NewChatModal open={newChat} onClose={() => setNewChat(false)} />
    </Card>
  );
}

/* ---------- Окно переписки ---------- */
function Conversation({ chatId, chat }: { chatId: number; chat?: ChatItem }) {
  const me = useUser();
  const qc = useQueryClient();
  const { socket, online } = useSocket();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [readUpTo, setReadUpTo] = useState(0);
  const [typing, setTyping] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Первая порция истории
  useEffect(() => {
    api<{ messages: Message[]; hasMore: boolean; readUpTo: number }>(`/chats/${chatId}/messages`).then(
      (r) => {
        setMessages(r.messages);
        setHasMore(r.hasMore);
        setReadUpTo(r.readUpTo);
      },
      (e: Error) => setLoadError(e.message),
    );
  }, [chatId]);

  // Отмечаем прочитанным последнее сообщение
  const lastId = messages?.at(-1)?.id;
  useEffect(() => {
    if (lastId) socket?.emit('read', { chatId, messageId: lastId });
  }, [lastId, socket, chatId]);

  // Realtime-события этого чата
  useEffect(() => {
    if (!socket) return;
    let typingTimer: ReturnType<typeof setTimeout>;
    const onMessage = (m: Message) => {
      if (m.chatId !== chatId) return;
      stickToBottom.current = true;
      setMessages((prev) => (prev && !prev.some((x) => x.id === m.id) ? [...prev, m] : prev));
      if (m.sender.id !== me.id) setTyping(null);
    };
    const onRead = (r: { chatId: number; userId: number; messageId: number }) => {
      if (r.chatId !== chatId) return;
      if (r.userId === me.id) qc.invalidateQueries({ queryKey: ['chats'] });
      else setReadUpTo((v) => Math.max(v, r.messageId));
    };
    const onTyping = (t: { chatId: number; userId: number }) => {
      if (t.chatId !== chatId) return;
      setTyping(t.userId === chat?.peer?.id ? 'печатает…' : 'кто-то печатает…');
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => setTyping(null), 3000);
    };
    socket.on('message:new', onMessage).on('read', onRead).on('typing', onTyping);
    return () => {
      clearTimeout(typingTimer);
      socket.off('message:new', onMessage).off('read', onRead).off('typing', onTyping);
    };
  }, [socket, chatId, me.id, chat?.peer?.id]);

  // Прокрутка вниз при новых сообщениях; при подгрузке старых — сохраняем позицию
  const prevHeight = useRef(0);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (stickToBottom.current) el.scrollTop = el.scrollHeight;
    else el.scrollTop = el.scrollHeight - prevHeight.current;
  }, [messages]);

  const loadOlder = async () => {
    if (!messages?.length) return;
    const r = await api<{ messages: Message[]; hasMore: boolean }>(`/chats/${chatId}/messages?before=${messages[0].id}`);
    stickToBottom.current = false;
    prevHeight.current = scroller.current?.scrollHeight ?? 0;
    setMessages([...r.messages, ...messages]);
    setHasMore(r.hasMore);
  };

  if (loadError)
    return (
      <div className="m-auto text-center">
        <Empty icon={MessageCircle} title="Чат недоступен" text={loadError} />
        <Link to="/chat" className="text-sm font-semibold text-primary hover:underline">
          К списку диалогов
        </Link>
      </div>
    );

  const subtitle =
    chat?.type === 'GROUP'
      ? `${chat.membersCount} участников`
      : chat?.peer && (online.has(chat.peer.id) ? 'в сети' : chat.peer.role === 'TEACHER' ? 'преподаватель' : 'студент');

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Link to="/chat" className="rounded-lg p-1 text-muted hover:bg-bg md:hidden">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        {chat && <Avatar name={chat.title} size={40} online={!!chat.peer && online.has(chat.peer.id)} />}
        <div className="min-w-0">
          <div className="truncate font-bold">{chat?.title ?? '…'}</div>
          <div className={`text-xs ${typing ? 'text-primary' : 'text-muted'}`}>{typing ?? subtitle}</div>
        </div>
      </header>

      <div ref={scroller} className="flex-1 space-y-2 overflow-y-auto bg-bg/60 px-4 py-4">
        {!messages ? (
          <Spinner />
        ) : (
          <>
            {hasMore && (
              <div className="text-center">
                <button onClick={loadOlder} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-muted shadow-sm hover:text-primary">
                  Показать более ранние
                </button>
              </div>
            )}
            {messages.map((m, i) => {
              const mine = m.sender.id === me.id;
              const newDay = i === 0 || fmt(m.createdAt, 'yyyy-MM-dd') !== fmt(messages[i - 1].createdAt, 'yyyy-MM-dd');
              const showName = chat?.type === 'GROUP' && !mine && messages[i - 1]?.sender.id !== m.sender.id;
              return (
                <div key={m.id}>
                  {newDay && <div className="caps py-2 text-center">{fmt(m.createdAt, 'd MMMM')}</div>}
                  <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 shadow-sm ${mine ? 'rounded-br-md bg-primary text-white' : 'rounded-bl-md bg-white'}`}>
                      {showName && <div className="mb-0.5 text-xs font-bold text-primary">{shortName(m.sender.fullName)}</div>}
                      {m.text && <div className="whitespace-pre-wrap break-words">{m.text}</div>}
                      {m.files.length > 0 && <div className="mt-1 text-ink"><FileLinks files={m.files} compact /></div>}
                      <div className={`mt-0.5 flex items-center justify-end gap-1 text-[11px] ${mine ? 'text-white/70' : 'text-muted'}`}>
                        {fmt(m.createdAt, 'HH:mm')}
                        {mine && (m.id <= readUpTo ? <CheckCheck className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <Composer chatId={chatId} />
    </>
  );
}

/* ---------- Поле ввода с вложениями ---------- */
function Composer({ chatId }: { chatId: number }) {
  const { socket } = useSocket();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);

  const onChange = (v: string) => {
    setText(v);
    if (Date.now() - lastTyping.current > 2000) {
      lastTyping.current = Date.now();
      socket?.emit('typing', { chatId });
    }
  };

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    if (sending || !socket || (!text.trim() && !files.length)) return;
    setSending(true);
    setError('');
    try {
      // Сначала загружаем файлы по HTTP, затем отправляем сообщение с их id через сокет
      const uploaded = files.length ? await api<FileInfo[]>('/files', { form: toForm({}, files) }) : [];
      const res: { ok?: true; error?: string } = await socket.emitWithAck('message:send', {
        chatId,
        text,
        fileIds: uploaded.map((f) => f.id),
      });
      if (res.error) throw new Error(res.error);
      setText('');
      setFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить');
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={send} className="border-t border-line bg-white p-3">
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-bg px-2.5 py-1 text-sm">
              <Paperclip className="h-3.5 w-3.5 text-muted" />
              <span className="max-w-40 truncate">{f.name}</span>
              <span className="text-xs text-muted">{fmtSize(f.size)}</span>
              <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-muted hover:text-red-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="flex items-end gap-2">
        <button type="button" onClick={() => fileInput.current?.click()} className="rounded-lg p-2.5 text-muted hover:bg-bg hover:text-primary" title="Прикрепить файл">
          <Paperclip className="h-5 w-5" />
        </button>
        <input ref={fileInput} type="file" multiple accept={ACCEPT} hidden onChange={(e) => (setFiles([...files, ...Array.from(e.target.files ?? [])]), (e.target.value = ''))} />
        <textarea
          rows={1}
          className="input max-h-32 resize-none"
          placeholder="Сообщение…"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button disabled={sending} className="rounded-lg bg-primary p-2.5 text-white hover:bg-primary-hover disabled:opacity-50" title="Отправить">
          <Send className="h-5 w-5" />
        </button>
      </div>
    </form>
  );
}

/* ---------- Новый диалог ---------- */
function NewChatModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['users', q], queryFn: () => api<User[]>(`/users/search?q=${encodeURIComponent(q)}`), enabled: open });

  const start = async (userId: number) => {
    const { id } = await api<{ id: number }>('/chats/direct', { body: { userId } });
    await qc.invalidateQueries({ queryKey: ['chats'] });
    onClose();
    navigate(`/chat/${id}`);
  };

  return (
    <Modal open={open} onClose={onClose} title="Новый диалог">
      <input className="input" autoFocus placeholder="ФИО или группа" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-3 max-h-80 overflow-y-auto">
        {users.data?.map((u) => (
          <li key={u.id}>
            <button onClick={() => start(u.id)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-bg">
              <Avatar name={u.fullName} size={36} />
              <div>
                <div className="text-sm font-semibold">{u.fullName}</div>
                <div className="text-xs text-muted">{u.role === 'TEACHER' ? u.department : `Студент · ${u.group?.name}`}</div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
