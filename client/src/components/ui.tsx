import { FileText, Loader2, Paperclip, Upload, X, type LucideIcon } from 'lucide-react';
import { useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { fileUrl } from '../lib/api';
import { fmtSize, initials, STATUS } from '../lib/format';
import type { FileInfo, Status } from '../lib/types';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ---------- Кнопка ---------- */
const VARIANTS = {
  primary: 'bg-primary text-white hover:bg-primary-hover',
  outline: 'border border-line bg-white hover:border-primary hover:text-primary',
  ghost: 'text-muted hover:bg-bg hover:text-ink',
};
export function Button({
  variant = 'primary',
  loading,
  className,
  children,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS; loading?: boolean }) {
  return (
    <button
      {...p}
      disabled={p.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/* ---------- Контейнеры ---------- */
export const Card = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cx('rounded-xl border border-line/70 bg-white shadow-sm', className)}>{children}</div>
);

export const PageHeader = ({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{title}</h1>
      {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export const Spinner = () => (
  <div className="flex justify-center py-16 text-primary">
    <Loader2 className="h-7 w-7 animate-spin" />
  </div>
);

export const Empty = ({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text?: string }) => (
  <div className="flex flex-col items-center py-12 text-center">
    <div className="mb-3 rounded-full bg-primary-soft p-3 text-primary">
      <Icon className="h-6 w-6" />
    </div>
    <div className="font-semibold">{title}</div>
    {text && <div className="mt-1 max-w-xs text-sm text-muted">{text}</div>}
  </div>
);

export const ErrorText = ({ error }: { error: unknown }) =>
  error ? <p className="text-sm text-red-600">{error instanceof Error ? error.message : String(error)}</p> : null;

/* ---------- Бейджи и аватар ---------- */
export const Badge = ({ className, children }: { className?: string; children: ReactNode }) => (
  <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', className)}>{children}</span>
);

export const StatusBadge = ({ status }: { status: Status }) => (
  <Badge className={STATUS[status].cls}>{STATUS[status].label}</Badge>
);

export function Avatar({ name, size = 40, online }: { name: string; size?: number; online?: boolean }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="flex h-full w-full items-center justify-center rounded-full bg-primary font-bold text-white"
        style={{ fontSize: size * 0.38 }}
      >
        {initials(name)}
      </div>
      {online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-green-500" />}
    </div>
  );
}

/* ---------- Модальное окно ---------- */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:max-w-lg sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-bg">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Поле формы ---------- */
export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block">
    <span className="caps mb-1.5 block">{label}</span>
    {children}
  </label>
);

/* ---------- Файлы ---------- */
export const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.7z,.jpg,.jpeg,.png,.dwg,.dxf';

/** Зона drag & drop + выбранные файлы с возможностью удалить. */
export function FileDrop({ files, onChange }: { files: File[]; onChange: (f: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const add = (list: FileList | null) => list && onChange([...files, ...Array.from(list)]);

  return (
    <div>
      <div
        onClick={() => input.current?.click()}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => (e.preventDefault(), setOver(false), add(e.dataTransfer.files))}
        className={cx(
          'flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition',
          over ? 'border-primary bg-primary-soft' : 'border-line hover:border-primary',
        )}
      >
        <Upload className="mb-2 h-6 w-6 text-primary" />
        <div className="text-sm font-semibold">Перетащите файлы или нажмите для выбора</div>
        <div className="mt-1 text-xs text-muted">PDF, DOCX, XLSX, DWG, DXF, ZIP, JPG… до 50 МБ</div>
        <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
      </div>
      {files.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-2 rounded-lg bg-bg px-3 py-2 text-sm">
              <Paperclip className="h-4 w-4 shrink-0 text-muted" />
              <span className="truncate">{f.name}</span>
              <span className="ml-auto shrink-0 text-xs text-muted">{fmtSize(f.size)}</span>
              <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="text-muted hover:text-red-600">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Список ссылок на загруженные файлы. */
export function FileLinks({ files, compact }: { files: FileInfo[]; compact?: boolean }) {
  if (!files.length) return null;
  return (
    <ul className={cx('flex flex-wrap gap-2', !compact && 'mt-2')}>
      {files.map((f) => (
        <li key={f.id}>
          <a
            href={fileUrl(f.id)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-sm hover:border-primary hover:text-primary"
          >
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{f.originalName}</span>
            <span className="shrink-0 text-xs text-muted">{fmtSize(f.size)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
