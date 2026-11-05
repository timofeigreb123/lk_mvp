import fs from 'node:fs';
import type { ErrorRequestHandler } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const forbidden = () => new HttpError(403, 'Нет доступа');
export const notFound = () => new HttpError(404, 'Не найдено');

/** id из URL/запроса: положительное целое, иначе 404. */
export function intId(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
}

/** Единый формат ошибок: { error: string }. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // Запрос упал после загрузки — удаляем уже сохранённые файлы, чтобы не копить мусор
  for (const f of (req.files as Express.Multer.File[] | undefined) ?? []) fs.rm(f.path, { force: true }, () => {});

  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Некорректный JSON' });
  if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? 'Неверные данные' });
  if (err instanceof MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Файл больше 50 МБ' : `Ошибка загрузки: ${err.message}`;
    return res.status(400).json({ error: msg });
  }
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
};
