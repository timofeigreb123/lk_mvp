import bcrypt from 'bcryptjs';
import { Router, type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma, publicUser } from './lib/db.js';
import { forbidden, HttpError } from './lib/http.js';

export type Role = 'STUDENT' | 'TEACHER';
export type AuthUser = { id: number; role: Role; groupId: number | null };

declare global {
  namespace Express {
    interface Request {
      user: AuthUser;
    }
  }
}

const secret = () => process.env.JWT_SECRET ?? 'dev-secret';
const COOKIE = 'token';

export function verifyToken(token?: string): number | null {
  try {
    return (jwt.verify(token ?? '', secret()) as { id: number }).id;
  } catch {
    return null;
  }
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const id = verifyToken(req.cookies?.[COOKIE]);
  const user = id ? await prisma.user.findUnique({ where: { id } }) : null;
  if (!user) throw new HttpError(401, 'Требуется вход');
  req.user = { id: user.id, role: user.role as Role, groupId: user.groupId };
  next();
};

export const requireRole =
  (role: Role): RequestHandler =>
  (req, _res, next) => {
    if (req.user.role !== role) throw forbidden();
    next();
  };

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { email, password } = z.object({ email: z.string(), password: z.string() }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, 'Неверный email или пароль');
  }
  const token = jwt.sign({ id: user.id }, secret(), { expiresIn: '7d' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 864e5 });
  res.json(await prisma.user.findUnique({ where: { id: user.id }, select: publicUser }));
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json(await prisma.user.findUnique({ where: { id: req.user.id }, select: publicUser }));
});

authRouter.post('/password', requireAuth, async (req, res) => {
  const body = z
    .object({ current: z.string(), next: z.string().min(6, 'Новый пароль — минимум 6 символов') })
    .parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user.id } });
  if (!(await bcrypt.compare(body.current, user.passwordHash))) throw new HttpError(400, 'Текущий пароль неверен');
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(body.next, 10) } });
  res.json({ ok: true });
});
