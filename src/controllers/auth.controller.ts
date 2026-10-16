import type { Request, Response } from 'express';
import { secureCookies, sessionAbsoluteSeconds, sessionCookieName } from '../config/auth.js';
import { readCookie } from '../middleware/authentication.js';
import { clearLoginRateLimit } from '../middleware/auth-rate-limit.js';
import { AuthServiceError, changePassword, login, revokeSession } from '../services/auth.service.js';

function cookieOptions(maxAge: number): string {
  return `${sessionCookieName}=; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secureCookies ? '; Secure' : ''}`;
}

function setSessionCookie(response: Response, token: string): void {
  response.setHeader('Set-Cookie', `${sessionCookieName}=${encodeURIComponent(token)}; Max-Age=${sessionAbsoluteSeconds}; Path=/; HttpOnly; SameSite=Lax${secureCookies ? '; Secure' : ''}`);
}

function clearSessionCookie(response: Response): void {
  response.setHeader('Set-Cookie', cookieOptions(0));
}

function failure(response: Response, error: unknown): void {
  if (error instanceof AuthServiceError) {
    response.status(error.statusCode).json({ message: error.message });
    return;
  }
  console.error('Erro interno no módulo de autenticação.');
  response.status(500).json({ message: 'Não foi possível concluir a operação.' });
}

export async function loginController(request: Request, response: Response): Promise<void> {
  try {
    const result = await login(request.body?.username, request.body?.password);
    clearLoginRateLimit(request);
    setSessionCookie(response, result.token);
    response.status(200).json({ user: result.user });
  } catch (error) { failure(response, error); }
}

export async function logoutController(request: Request, response: Response): Promise<void> {
  try {
    const token = readCookie(request, sessionCookieName);
    if (token && request.authUser) await revokeSession(request.authUser, token);
    clearSessionCookie(response);
    response.status(204).send();
  } catch (error) { failure(response, error); }
}

export function meController(request: Request, response: Response): void {
  const { sessionId: _sessionId, tokenHash: _tokenHash, ...publicIdentity } = request.authUser!;
  response.json({ user: publicIdentity });
}

export async function changePasswordController(request: Request, response: Response): Promise<void> {
  try {
    if (!request.authUser) { response.status(401).json({ message: 'Autenticação necessária.' }); return; }
    await changePassword(request.authUser, request.body?.currentPassword, request.body?.newPassword, request.body?.confirmPassword);
    response.status(204).send();
  } catch (error) { failure(response, error); }
}
