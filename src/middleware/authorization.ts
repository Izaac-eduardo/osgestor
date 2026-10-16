import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AuthRole } from '../types/auth.js';

export function requireRole(...allowedRoles: AuthRole[]): RequestHandler {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.authUser) {
      response.status(401).json({ message: 'Autenticação necessária.' });
      return;
    }
    if (!allowedRoles.includes(request.authUser.role)) {
      response.status(403).json({ message: 'Você não tem permissão para esta operação.' });
      return;
    }
    next();
  };
}

export function requireMethodRole(options: { deleteRoles?: AuthRole[] } = {}): RequestHandler {
  const deleteRoles = options.deleteRoles ?? ['ADMIN'];
  return (request: Request, response: Response, next: NextFunction) => {
    const roles: AuthRole[] = request.method === 'GET' || request.method === 'HEAD'
      ? ['ADMIN', 'OPERADOR', 'GESTOR']
      : request.method === 'DELETE'
        ? deleteRoles
        : ['ADMIN', 'OPERADOR'];
    requireRole(...roles)(request, response, next);
  };
}

export const requirePasswordChangeComplete: RequestHandler = (request, response, next) => {
  if (request.authUser?.must_change_password) {
    response.status(403).json({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'Altere sua senha antes de acessar os módulos operacionais.' });
    return;
  }
  next();
};
