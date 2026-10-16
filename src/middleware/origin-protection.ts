import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { isAllowedOrigin } from '../config/auth.js';

export const requireAllowedOrigin: RequestHandler = (request: Request, response: Response, next: NextFunction) => {
  const origin = request.get('origin');
  if (origin && !isAllowedOrigin(origin)) {
    response.status(403).json({ message: 'Origem não autorizada.' });
    return;
  }
  next();
};

export const requireMutationOrigin: RequestHandler = (request: Request, response: Response, next: NextFunction) => {
  const origin = request.get('origin');
  if (!origin || !isAllowedOrigin(origin)) {
    response.status(403).json({ message: 'Origem não autorizada.' });
    return;
  }
  next();
};
