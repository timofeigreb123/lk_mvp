import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import { authRouter, requireAuth } from './auth.js';
import { errorHandler } from './lib/http.js';
import { assignmentsRouter } from './routes/assignments.js';
import { chatRouter } from './routes/chat.js';
import { filesRouter } from './routes/files.js';
import { scheduleRouter } from './routes/schedule.js';
import { initSocket } from './socket.js';

const app = express();
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRouter);
app.use('/api', requireAuth, scheduleRouter, assignmentsRouter, chatRouter, filesRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Не найдено' }));
app.use(errorHandler);

// Режим `npm start`: отдаём собранный фронтенд (client/dist) с того же порта
const dist = fileURLToPath(new URL('../../client/dist', import.meta.url));
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(dist, 'index.html')) : next()));
}

const server = http.createServer(app);
initSocket(server);

const port = Number(process.env.PORT ?? 4000);
server.listen(port, () => console.log(`API: http://localhost:${port}`));
