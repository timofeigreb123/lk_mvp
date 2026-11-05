import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { HttpError } from './http.js';

export const UPLOAD_DIR = fileURLToPath(new URL('../../uploads', import.meta.url));
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt',
  'zip', 'rar', '7z', 'jpg', 'jpeg', 'png', 'dwg', 'dxf',
]);

/** Браузер шлёт имя в UTF-8, а busboy читает его как latin1 — возвращаем кириллицу. */
function fixName(name: string): string {
  return /[^\u0000-ÿ]/.test(name) ? name : Buffer.from(name, 'latin1').toString('utf8');
}

export const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    file.originalname = fixName(file.originalname);
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    if (ALLOWED.has(ext)) cb(null, true);
    else cb(new HttpError(400, `Недопустимый тип файла: .${ext || '?'}`));
  },
});

/** Превращает загруженные multer'ом файлы в строки для таблицы File. */
export function fileRows(files: unknown, uploaderId: number) {
  return ((files as Express.Multer.File[] | undefined) ?? []).map((f) => ({
    originalName: f.originalname,
    storedName: f.filename,
    mime: f.mimetype,
    size: f.size,
    uploaderId,
  }));
}

export const fileSelect = { id: true, originalName: true, size: true, mime: true } as const;
