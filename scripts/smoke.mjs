/**
 * Сквозной smoke-тест API и чата. Запуск: сервер должен работать (npm run dev), затем `npm test`.
 * Тест меняет данные — после него выполните `npm run seed`.
 */
import { io } from 'socket.io-client';

const B = process.env.API ?? 'http://127.0.0.1:4000';
let passed = 0;
let failed = 0;

function check(name, ok, details = '') {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !details ? '' : `  →  ${details}`}`);
}

async function req(cookie, path, { method, json, form } = {}) {
  const res = await fetch(B + '/api' + path, {
    method: method ?? (json || form ? 'POST' : 'GET'),
    headers: { ...(cookie && { cookie }), ...(json && { 'Content-Type': 'application/json' }) },
    body: form ?? (json ? JSON.stringify(json) : undefined),
  });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
}

async function login(email, password = '123456') {
  const res = await fetch(B + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.headers.get('set-cookie')?.split(';')[0];
}

const fileForm = (name, fields = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  fd.append('files', new Blob(['demo']), name);
  return fd;
};

console.log('Авторизация');
check('неверный пароль → 401', (await req(null, '/auth/login', { json: { email: 'student@nngasu.ru', password: 'x' } })).status === 401);
check('без входа → 401', (await req(null, '/chats')).status === 401);
const S = await login('student@nngasu.ru');
const T = await login('teacher@nngasu.ru');
const P = await login('pgs@nngasu.ru');
check('вход студента и преподавателя', !!S && !!T && !!P);
check('/auth/me', (await req(S, '/auth/me')).body?.group?.name === 'АРХ-21');

console.log('Расписание');
const week = (await req(S, '/schedule?date=2026-09-01')).body;
check('первая неделя семестра — верхняя', week?.weekType === 'UPPER', week?.weekType);
check('следующая — нижняя', (await req(S, '/schedule?date=2026-09-08')).body?.weekType === 'LOWER');
check('6 дней, есть пары', week?.days.length === 6 && week.days.some((d) => d.lessons.length));
check('пары фильтруются по типу недели', week.days.flatMap((d) => d.lessons).every((l) => l.weekType !== 'LOWER'));
const tId = (await req(S, '/meta')).body.teachers[0].id;
const byTeacher = (await req(S, `/schedule?teacherId=${tId}`)).body.days.flatMap((d) => d.lessons);
check('фильтр по преподавателю', byTeacher.length > 0 && byTeacher.every((l) => l.teacher.id === tId));
check('кривая дата → 400', (await req(S, '/schedule?date=abc')).status === 400);

console.log('Задания');
const list = (await req(S, '/assignments')).body;
// Задание, которое не сдано и выдано преподавателем T (Петров)
const pending = list.find((a) => a.status === 'PENDING' && a.teacher.fullName.startsWith('Петров'));
check('список со статусами', Array.isArray(list) && !!pending);
check('нечисловой id → 404', (await req(S, '/assignments/abc')).status === 404);
check('чужая группа → 403', (await req(P, `/assignments/${pending.id}`)).status === 403);
check('студент не создаёт задания → 403', (await req(S, '/assignments', { form: fileForm('a.pdf', { title: 'xxx' }) })).status === 403);
check('сдача без файлов → 400', (await req(S, `/assignments/${pending.id}/submissions`, { form: new FormData() })).status === 400);
check('недопустимый тип .exe → 400', (await req(S, `/assignments/${pending.id}/submissions`, { form: fileForm('virus.exe') })).status === 400);
check('сдача с кириллицей в имени', (await req(S, `/assignments/${pending.id}/submissions`, { form: fileForm('Чертёж фасада.dwg', { comment: 'Готово' }) })).status === 201);
check('повторная сдача запрещена', (await req(S, `/assignments/${pending.id}/submissions`, { form: fileForm('b.pdf') })).status === 400);
const mine = (await req(S, `/assignments/${pending.id}`)).body;
check('статус «на проверке», имя файла сохранено', mine.status === 'SUBMITTED' && mine.mySubmissions.at(-1).files[0].originalName === 'Чертёж фасада.dwg');

const tDetail = (await req(T, `/assignments/${pending.id}`)).body;
const sub = tDetail.students?.find((s) => s.status === 'SUBMITTED' && s.student.fullName.startsWith('Иванов'))?.submissions.at(-1);
check('преподаватель видит сдачу', !!sub);
const fileId = sub.files[0].id;
check('преподаватель скачивает файл', (await fetch(`${B}/api/files/${fileId}`, { headers: { cookie: T } })).status === 200);
check('чужой студент не скачивает → 403', (await req(P, `/files/${fileId}`)).status === 403);
check('возврат на доработку', (await req(T, `/submissions/${sub.id}/review`, { method: 'PATCH', json: { status: 'RETURNED', teacherComment: 'Доработать' } })).status === 200);
check('пересдача после доработки', (await req(S, `/assignments/${pending.id}/submissions`, { form: fileForm('v2.pdf') })).status === 201);
check('старую попытку проверить нельзя', (await req(T, `/submissions/${sub.id}/review`, { method: 'PATCH', json: { status: 'ACCEPTED' } })).status === 400);
const last = (await req(S, `/assignments/${pending.id}`)).body.mySubmissions.at(-1);
check('проверка последней попытки', (await req(T, `/submissions/${last.id}/review`, { method: 'PATCH', json: { status: 'ACCEPTED', grade: '5' } })).status === 200);
check('студент видит оценку', (await req(S, '/assignments')).body.find((a) => a.id === pending.id).grade === '5');
const meta = (await req(T, '/meta')).body;
const pair = meta.teaching[0];
check('создание задания преподавателем', (await req(T, '/assignments', { form: fileForm('Методичка.pdf', { title: 'Тест', deadline: '2026-12-31T12:00:00Z', subjectId: pair.subject.id, groupId: pair.group.id }) })).status === 201);
check('чужой предмет → 400', (await req(T, '/assignments', { form: fileForm('a.pdf', { title: 'Тест', deadline: '2026-12-31', subjectId: 999, groupId: pair.group.id }) })).status === 400);
check('битый JSON → 400', (await fetch(`${B}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' })).status === 400);

console.log('Чат');
const chats = (await req(S, '/chats')).body;
const direct = chats.find((c) => c.type === 'DIRECT' && c.peer?.role === 'TEACHER');
check('список чатов с непрочитанными', !!direct && typeof direct.unread === 'number');
check('поиск по кириллице', (await req(S, `/users/search?q=${encodeURIComponent('смир')}`)).body.some((u) => u.fullName.startsWith('Смирнова')));
check('чужой чат → 403', (await req(P, `/chats/${direct.id}/messages`)).status === 403);

const sockS = io(B, { extraHeaders: { cookie: S }, transports: ['websocket'] });
const sockT = io(B, { extraHeaders: { cookie: T }, transports: ['websocket'] });
const once = (s, ev, pred = () => true) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('timeout ' + ev)), 3000);
  s.on(ev, (d) => pred(d) && (clearTimeout(t), res(d)));
});
await Promise.all([once(sockS, 'connect'), once(sockT, 'connect')]);
check('сокет без cookie отклонён', await new Promise((r) => io(B, { transports: ['websocket'] }).on('connect_error', () => r(true)).on('connect', () => r(false))));

const typing = once(sockT, 'typing');
sockS.emit('typing', { chatId: direct.id });
check('«печатает…» доходит', (await typing).chatId === direct.id);

const att = (await req(S, '/files', { form: fileForm('Схема.png') })).body;
const got = once(sockT, 'message:new', (m) => m.chatId === direct.id);
const ack = await sockS.emitWithAck('message:send', { chatId: direct.id, text: 'Привет из теста', fileIds: [att[0].id] });
const msg = await got;
check('сообщение доставлено в реальном времени', ack.ok && msg.text === 'Привет из теста');
check('вложение прикреплено', msg.files[0]?.originalName === 'Схема.png');
const read = once(sockS, 'read', (r) => r.userId !== msg.sender.id);
sockT.emit('read', { chatId: direct.id, messageId: msg.id });
check('отметка «прочитано»', (await read).messageId === msg.id);
check('писать в чужой чат нельзя', !!(await sockS.emitWithAck('message:send', { chatId: 999999, text: 'x' })).error);
check('пустое сообщение отклонено', !!(await sockS.emitWithAck('message:send', { chatId: direct.id, text: '  ' })).error);
sockS.emit('typing');
sockS.emit('read', null);
await new Promise((r) => setTimeout(r, 200));
check('мусорные события не роняют сервер', (await req(S, '/auth/me')).status === 200);
sockS.close();
sockT.close();

console.log(`\nИтого: ${passed} пройдено, ${failed} упало`);
console.log('Тест изменил данные — выполните `npm run seed`, чтобы вернуть демо-набор.');
process.exit(failed ? 1 : 0);
