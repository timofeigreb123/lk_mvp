export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Opts = { method?: string; body?: unknown; form?: FormData };

/** Запрос к API. JSON — через body, файлы — через form (multipart). */
export async function api<T = unknown>(path: string, { method, body, form }: Opts = {}): Promise<T> {
  const res = await fetch('/api' + path, {
    method: method ?? (body !== undefined || form ? 'POST' : 'GET'),
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Ошибка запроса');
  return data as T;
}

export const fileUrl = (id: number) => `/api/files/${id}`;

export function toForm(fields: Record<string, string | number>, files: File[] = []) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  for (const f of files) fd.append('files', f);
  return fd;
}
