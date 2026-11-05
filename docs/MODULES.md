# Модули

```
lk_mvp/
├─ package.json          npm workspaces + скрипты setup / dev / start / seed
├─ server/               API + WebSocket + БД
│  ├─ .env               DATABASE_URL, JWT_SECRET, PORT
│  ├─ prisma/
│  │  ├─ schema.prisma   модель данных
│  │  └─ seed.ts         демо-данные
│  ├─ uploads/           загруженные файлы (имена — uuid)
│  └─ src/
│     ├─ index.ts        сборка приложения: middleware, роуты, сокет, раздача client/dist
│     ├─ auth.ts         вход/выход, JWT-cookie, requireAuth / requireRole
│     ├─ socket.ts       Socket.IO: авторизация, комнаты, онлайн, события чата
│     ├─ lib/            db, ошибки, неделя и звонки, загрузка файлов
│     └─ routes/         schedule, assignments, chat, files
└─ client/               React-приложение
   └─ src/
      ├─ main.tsx        провайдеры: React Query → Auth → Socket → Router
      ├─ App.tsx         маршруты; без входа — экран логина
      ├─ lib/            api, auth, socket, format, types
      ├─ components/     ui (кит), Layout (меню), LessonCard
      └─ pages/          по странице на раздел
```

---

## Сервер

### Общее

- **Ошибки.** Код выбрасывает `HttpError(status, message)` (`lib/http.ts`), а `errorHandler` отвечает `{ error: "текст" }`. Ошибки Zod (валидация) и Multer (загрузка) приводятся к коду 400 с понятным текстом. Express 5 сам ловит ошибки async-обработчиков, поэтому `try/catch` в роутах не нужен.
- **Доступ.** Все `/api/*`, кроме `/api/auth/login|logout`, требуют входа: `requireAuth` кладёт в `req.user` поля `{ id, role, groupId }`. `requireRole('TEACHER')` ограничивает маршрут одной ролью. Права на конкретный объект (своя группа, своё задание) проверяются внутри роута.
- **Enum'ы.** SQLite их не поддерживает, поэтому роли и статусы хранятся строками. Допустимые значения перечислены в комментариях `schema.prisma`.

### auth — `src/auth.ts`

JWT (7 дней) в httpOnly-cookie `token`, пароли хешируются bcrypt. По той же cookie авторизуется сокет.

| Метод | Путь | Описание |
|---|---|---|
| POST | `/api/auth/login` | `{ email, password }` → пользователь + cookie |
| POST | `/api/auth/logout` | удалить cookie |
| GET | `/api/auth/me` | текущий пользователь |
| POST | `/api/auth/password` | `{ current, next }` — смена пароля |

### schedule — `src/routes/schedule.ts`, `src/lib/week.ts`

- `SEMESTER_START` — начало семестра. Первая неделя считается **верхней** (`UPPER`), дальше верхние и нижние (`LOWER`) недели чередуются.
- `BELLS` — расписание звонков. Сервер отдаёт его клиенту, на клиенте звонки не дублируются.
- Пара хранится как «день недели + номер пары + тип недели (`ALL` — каждую | `UPPER` — по верхним | `LOWER` — по нижним)». Даты вычисляются на лету.

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/meta` | группы, преподаватели, аудитории, звонки; для преподавателя ещё `teaching` — пары «предмет + группа», которые он ведёт |
| GET | `/api/schedule?date=YYYY-MM-DD&groupId=\|teacherId=\|room=` | неделя, в которую попадает `date`: `{ weekStart, weekType, bells, days[6] }`. Без фильтра студент получает свою группу, преподаватель свои пары |

### assignments — `src/routes/assignments.ts`

**Статусы** для студента вычисляются по дедлайну и последней попытке:

| Статус | Условие |
|---|---|
| `PENDING` — не сдано | попыток нет, дедлайн впереди |
| `OVERDUE` — просрочено | попыток нет, дедлайн прошёл |
| `SUBMITTED` — на проверке | последняя попытка ждёт проверки |
| `RETURNED` — на доработку | преподаватель вернул, можно сдать снова |
| `ACCEPTED` — принято | работа принята |

`PENDING` и `OVERDUE` в БД не хранятся. Каждая сдача — отдельная запись `Submission` с номером `attempt`, поэтому история попыток сохраняется.

| Метод | Путь | Кто | Описание |
|---|---|---|---|
| GET | `/api/assignments` | все | студент: задания группы + `status`, `grade`; преподаватель: свои задания + `stats { total, submitted, toReview }` |
| GET | `/api/assignments/:id` | все | + файлы; студент: `mySubmissions`; преподаватель: `students[]` со всеми попытками |
| POST | `/api/assignments` | TEACHER | multipart: `title, description, deadline, subjectId, groupId, files[]`. Только для предмета и группы, которые преподаватель ведёт |
| POST | `/api/assignments/:id/submissions` | STUDENT | multipart: `comment, files[]` (минимум 1 файл). Запрещено, если последняя попытка не `RETURNED` |
| PATCH | `/api/submissions/:id/review` | TEACHER | `{ status: ACCEPTED\|RETURNED, grade?, teacherComment? }` |

### files — `src/routes/files.ts`, `src/lib/upload.ts`

- Допустимые форматы: pdf, doc(x), xls(x), ppt(x), txt, zip, rar, 7z, jpg, png, **dwg, dxf**. До 50 МБ на файл, до 10 файлов за раз.
- На диске файл хранится как `uuid.ext`, оригинальное имя лежит в БД. Кириллица в именах исправляется в `fixName`.
- Файл принадлежит заданию, сдаче или сообщению. Доступ (`canAccess`) есть у загрузившего и у тех, кто видит владельца файла: группа задания, автор сдачи и преподаватель, участники чата.

| Метод | Путь | Описание |
|---|---|---|
| POST | `/api/files` | загрузить вложения для чата → `[{ id, originalName, size, mime }]` |
| GET | `/api/files/:id` | скачать; pdf, картинки и txt открываются в браузере |

### chat — `src/routes/chat.ts`, `src/socket.ts`

- Типы чатов: `DIRECT` (двое) и `GROUP` (группа + её преподаватели, создаются в seed).
- **Прочитанное.** У каждого участника хранится `ChatMember.lastReadMessageId`. Непрочитанные — это чужие сообщения с `id` больше этого значения. ✓✓ ставится, если `id` сообщения ≤ `readUpTo` (максимум отметок у собеседников).
- **Отправка** идёт через сокет: `sendMessage()` проверяет членство, сохраняет сообщение, привязывает файлы и рассылает его в комнату `chat:<id>`.
- **Онлайн** — счётчик открытых вкладок в памяти процесса.

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/chats` | мои чаты: `title`, `peer`, `lastMessage`, `unread` |
| GET | `/api/chats/:id/messages?before=<id>` | 30 сообщений до `before` + `hasMore`, `readUpTo` |
| POST | `/api/chats/direct` | `{ userId }` → найти или создать личный диалог |
| GET | `/api/users/search?q=` | поиск людей по ФИО или группе |

**События Socket.IO.** При подключении сокет входит в комнаты `user:<id>` и `chat:<id>` для каждого своего чата.

| Направление | Событие | Данные |
|---|---|---|
| клиент → сервер | `message:send` (с ack) | `{ chatId, text, fileIds? }` → `{ ok }` или `{ error }` |
| клиент → сервер | `typing` | `{ chatId }` |
| клиент → сервер | `read` | `{ chatId, messageId }` |
| сервер → клиент | `message:new` | сообщение целиком |
| сервер → клиент | `read` | `{ chatId, userId, messageId }` |
| сервер → клиент | `typing` | `{ chatId, userId }` |
| сервер → клиент | `presence` / `presence:list` | `{ userId, online }` / `[userId…]` |
| сервер → клиент | `chat:new` | `{ id }` — с вами начали новый диалог |

### Модель данных — `prisma/schema.prisma`

```
Group 1─* User(STUDENT)          User(TEACHER) 1─* Lesson, Assignment
Group 1─* Lesson *─1 Subject
Assignment 1─* Submission *─1 User(STUDENT)
File → Assignment | Submission | Message   (ровно один владелец)
Chat 1─* ChatMember *─1 User;  Chat 1─* Message
```

---

## Клиент

### lib

| Файл | Назначение |
|---|---|
| `api.ts` | `api(path, { method, body, form })` — обёртка над fetch. Ошибки сервера бросаются как `ApiError` с русским текстом. `toForm()` собирает multipart |
| `auth.tsx` | `AuthProvider`, `useAuth()` (`user`, `login`, `logout`), `useUser()` — пользователь на защищённых страницах |
| `socket.tsx` | одно соединение на вкладку после входа. `useSocket()` → `{ socket, online }`. На новые сообщения обновляет список чатов и счётчики |
| `format.ts` | даты (ru), размеры файлов, ФИО, подписи типов пар и статусов, `lessonState()` (прошла / идёт / впереди) |
| `types.ts` | типы ответов API |

Данные загружаются через **TanStack Query**. Ключи общие для всех страниц (`['chats']`, `['assignments']`, `['schedule', params]`, `['meta']`), поэтому главная использует тот же кэш, что и разделы.

### components

- `ui.tsx` — кит: `Button`, `Card`, `PageHeader`, `Badge`, `StatusBadge`, `Avatar`, `Modal`, `Field`, `FileDrop` (drag & drop), `FileLinks`, `Spinner`, `Empty`, `ErrorText`.
- `Layout.tsx` — тёмное боковое меню (десктоп) или шапка с нижней панелью вкладок (телефон), счётчик непрочитанных.
- `LessonCard.tsx` — карточка пары. Клик открывает подробности и кнопки «Задания по предмету» и «Написать преподавателю».

### pages

| Страница | Маршрут | Что внутри |
|---|---|---|
| `LoginPage` | (без входа) | форма + быстрый вход демо-аккаунтами |
| `DashboardPage` | `/` | пары сегодня, «следующая пара через N мин», дедлайны или работы на проверке, непрочитанные |
| `SchedulePage` | `/schedule` | неделя ← →, верхняя/нижняя неделя, фильтр по группе, преподавателю, аудитории |
| `AssignmentsPage` | `/assignments?subject=` | список с фильтрами; преподаватель создаёт задание в модальном окне |
| `AssignmentPage` | `/assignments/:id` | студент: сдача и история попыток; преподаватель: студенты, попытки, проверка |
| `ChatPage` | `/chat/:id?` | список диалогов, переписка, вложения, «печатает…», ✓✓, подгрузка истории, новый диалог |
| `ProfilePage` | `/profile` | данные пользователя, смена пароля |

### Дизайн

Цвета заданы токенами в `tailwind.config.js`: `primary #FF7A3D`, `ink`, `muted`, `bg`, `line`. Шрифт Inter. Классы `.input` (поле ввода) и `.caps` (подпись капсом) лежат в `index.css`. Логотип-заглушка — `client/public/logo.svg`, его можно заменить настоящим.

---

## Как расширять

- **Новое поле или таблица:** правка `schema.prisma` → `npm run seed`.
- **Поменять семестр или звонки:** `server/src/lib/week.ts`.
- **Новый раздел:** роутер в `server/src/routes/`, подключение в `index.ts`; страница в `client/src/pages/`, маршрут в `App.tsx`, пункт в `NAV` в `Layout.tsx`.
- **Переход на PostgreSQL:** `provider = "postgresql"` и `DATABASE_URL` в `.env`.

## Отличия от PLAN.md

- Папку `shared/` не стали выделять: типы клиента лежат в `client/src/lib/types.ts`, так проще.
- Формы сделаны без React Hook Form: полей мало, хватает `useState`.
- Неделя на телефоне показывается списком дней, отдельного переключателя «день / неделя» нет.
- Старые сообщения подгружаются кнопкой «Показать более ранние», а не автоматически при прокрутке.
