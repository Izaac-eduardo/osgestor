import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { sessionCookieName } from '../config/auth.js';
import { authenticateToken } from '../services/auth.service.js';

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key === name) return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

export const requireAuthentication: RequestHandler = async (request: Request, response: Response, next: NextFunction) => {
  const token = readCookie(request, sessionCookieName);
  if (!token) {
    response.status(401).json({ message: 'Autenticação necessária.' });
    return;
  }
  try {
    const user = await authenticateToken(token);
    if (!user) {
      response.status(401).json({ message: 'Sessão inválida ou expirada.' });
      return;
    }
    request.authUser = user;
    next();
  } catch (error) {
    next(error);
  }
};
