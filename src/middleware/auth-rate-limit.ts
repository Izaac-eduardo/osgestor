import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { createHash } from 'node:crypto';
import { recordAudit } from '../services/audit.service.js';

const windowMs = 15 * 60 * 1000;
const maxAttempts = 5;
const attempts = new Map<string, { count: number; resetAt: number }>();

function keyFor(request: Request): string {
  const username = typeof request.body?.username === 'string' ? request.body.username.trim().toLocaleLowerCase('en-US') : '';
  return `${request.ip}|${username}`;
}

export const loginRateLimit: RequestHandler = async (request: Request, response: Response, next: NextFunction) => {
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.resetAt <= now) attempts.delete(key);
  const key = keyFor(request);
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    next();
    return;
  }
  if (entry.count >= maxAttempts) {
    const attemptedUsername = typeof request.body?.username === 'string' ? request.body.username.trim().toLocaleLowerCase('en-US') : '';
    const usuarioHash = attemptedUsername ? createHash('sha256').update(attemptedUsername, 'utf8').digest('hex') : undefined;
    await recordAudit({ actor: null, acao: 'LOGIN', modulo: 'AUTENTICACAO', entidade: 'login', metadata: { resultado: 'REJEITADO', motivo: 'RATE_LIMIT', ...(usuarioHash ? { usuario_hash: usuarioHash } : {}) } }).catch(() => undefined);
    response.status(429).json({ message: 'Muitas tentativas. Tente novamente mais tarde.' });
    return;
  }
  entry.count += 1;
  next();
};

export function clearLoginRateLimit(request: Request): void {
  const username = typeof request.body?.username === 'string' ? request.body.username.trim().toLocaleLowerCase('en-US') : '';
  attempts.delete(`${request.ip}|${username}`);
}
