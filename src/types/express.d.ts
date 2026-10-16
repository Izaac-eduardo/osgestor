import type { AuthenticatedRequestUser } from './auth.js';

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedRequestUser;
    }
  }
}

export {};
