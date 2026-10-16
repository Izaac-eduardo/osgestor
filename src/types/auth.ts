export const authRoles = ['ADMIN', 'OPERADOR', 'GESTOR'] as const;
export type AuthRole = typeof authRoles[number];

export const authStatuses = ['ATIVO', 'INATIVO'] as const;
export type AuthStatus = typeof authStatuses[number];

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  role: AuthRole;
  status: AuthStatus;
  must_change_password: boolean;
}

export interface AuthenticatedRequestUser extends PublicUser {
  sessionId: string;
  tokenHash: string;
}
