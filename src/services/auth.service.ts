import { createHash, randomBytes } from 'node:crypto';
import { pool } from '../config/database.js';
import { sessionAbsoluteSeconds, sessionIdleSeconds, sessionRefreshSeconds } from '../config/auth.js';
import type { AuthRole, AuthStatus, AuthenticatedRequestUser, PublicUser } from '../types/auth.js';
import { hashPassword, verifyPassword } from './password.service.js';
import { recordAudit } from './audit.service.js';

const genericCredentialsMessage = 'Usuário ou senha inválidos.';

export class AuthServiceError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'AuthServiceError';
  }
}

interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  role: AuthRole;
  status: AuthStatus;
  must_change_password: boolean;
}

interface SessionRow extends UserRow {
  session_id: string;
  token_hash: string;
}

export interface LoginResult {
  token: string;
  user: PublicUser;
}

function publicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    status: row.status,
    must_change_password: row.must_change_password,
  };
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function normalizeUsername(username: string): string {
  return username.trim().toLocaleLowerCase('en-US');
}

function sessionExpiry(now: Date): Date {
  return new Date(now.getTime() + sessionIdleSeconds * 1000);
}

async function auditRejectedLogin(reason: string, attemptedUsername?: string): Promise<void> {
  try {
    const usuarioHash = attemptedUsername ? createHash('sha256').update(normalizeUsername(attemptedUsername), 'utf8').digest('hex') : undefined;
    await recordAudit({ actor: null, acao: 'LOGIN', modulo: 'AUTENTICACAO', entidade: 'login', metadata: { resultado: 'REJEITADO', motivo: reason, ...(usuarioHash ? { usuario_hash: usuarioHash } : {}) } });
  } catch { /* preserve uniform auth failures */ }
}

export async function login(usernameInput: unknown, password: unknown): Promise<LoginResult> {
  if (typeof usernameInput !== 'string' || !usernameInput.trim() || typeof password !== 'string' || !password) {
    await auditRejectedLogin('ENTRADA_INVALIDA');
    throw new AuthServiceError(400, 'Informe usuário e senha.');
  }

  const username = normalizeUsername(usernameInput);
  const userResult = await pool.query<UserRow>(
    `SELECT id, username, email, password_hash, role, status, must_change_password
     FROM usuarios WHERE lower(btrim(username)) = $1 LIMIT 1`,
    [username],
  );
  const user = userResult.rows[0];
  if (!user || user.status !== 'ATIVO' || !(await verifyPassword(user?.password_hash ?? '$argon2id$v=19$m=65536,t=3,p=1$invalid$invalid', password))) {
    await auditRejectedLogin(user?.status === 'INATIVO' ? 'USUARIO_INATIVO' : 'CREDENCIAIS_INVALIDAS', username);
    throw new AuthServiceError(401, genericCredentialsMessage);
  }

  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const session = await client.query<{ id: string }>(
      `INSERT INTO sessoes(usuario_id, token_hash, created_at, expires_at)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [user.id, tokenHash(token), now, sessionExpiry(now)],
    );
    await client.query('UPDATE usuarios SET last_login_at = $1 WHERE id = $2', [now, user.id]);
    await recordAudit({ actor: { ...publicUser(user), sessionId: session.rows[0]!.id, tokenHash: tokenHash(token) }, acao: 'LOGIN', modulo: 'AUTENTICACAO', entidade: 'sessoes', metadata: { resultado: 'SUCESSO', sessao_criada: true } }, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return { token, user: publicUser(user) };
}

export async function authenticateToken(token: string): Promise<AuthenticatedRequestUser | null> {
  const hash = tokenHash(token);
  const result = await pool.query<SessionRow>(
    `SELECT s.id AS session_id, s.token_hash, u.id, u.username, u.email, u.password_hash,
            u.role, u.status, u.must_change_password
     FROM sessoes s
     JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
       AND s.created_at > NOW() - INTERVAL '24 hours'
       AND u.status = 'ATIVO'
     LIMIT 1`,
    [hash],
  );
  const row = result.rows[0];
  if (!row) return null;

  const publicIdentity: AuthenticatedRequestUser = {
    ...publicUser(row),
    sessionId: row.session_id,
    tokenHash: row.token_hash,
  };

  await pool.query(
    `UPDATE sessoes
     SET last_seen_at = NOW(),
         expires_at = LEAST(NOW() + ($1 * INTERVAL '1 second'), created_at + ($2 * INTERVAL '1 second'))
     WHERE id = $3
       AND (last_seen_at IS NULL OR last_seen_at < NOW() - ($4 * INTERVAL '1 second'))`,
    [sessionIdleSeconds, sessionAbsoluteSeconds, row.session_id, sessionRefreshSeconds],
  );
  return publicIdentity;
}

export async function revokeSession(user: AuthenticatedRequestUser, token: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('UPDATE sessoes SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL RETURNING id', [tokenHash(token)]);
    if (result.rowCount) await recordAudit({ actor: user, acao: 'LOGOUT', modulo: 'AUTENTICACAO', entidade: 'sessoes', metadata: { resultado: 'SUCESSO', sessoes_revogadas: result.rowCount, motivo: 'LOGOUT' } }, client);
    await client.query('COMMIT');
    return Boolean(result.rowCount);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function changePassword(user: AuthenticatedRequestUser, currentPassword: unknown, newPassword: unknown, confirmPassword: unknown): Promise<void> {
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || typeof confirmPassword !== 'string') {
    throw new AuthServiceError(400, 'Informe as senhas solicitadas.');
  }
  if (newPassword !== confirmPassword) throw new AuthServiceError(400, 'A confirmação da nova senha não confere.');
  const current = await pool.query<{ password_hash: string }>('SELECT password_hash FROM usuarios WHERE id = $1 AND status = \'ATIVO\'', [user.id]);
  if (!current.rows[0] || !(await verifyPassword(current.rows[0].password_hash, currentPassword))) {
    throw new AuthServiceError(401, genericCredentialsMessage);
  }
  let newHash: string;
  try {
    newHash = await hashPassword(newPassword);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('A senha deve')) throw new AuthServiceError(400, error.message);
    throw error;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE usuarios SET password_hash = $1, must_change_password = FALSE, updated_at = NOW() WHERE id = $2', [newHash, user.id]);
    const revoked = await client.query('UPDATE sessoes SET revoked_at = NOW() WHERE usuario_id = $1 AND id <> $2 AND revoked_at IS NULL', [user.id, user.sessionId]);
    await recordAudit({ actor: user, acao: 'ALTERAR_SENHA', modulo: 'AUTENTICACAO', entidade: 'usuarios', entidadeId: user.id, metadata: { resultado: 'SUCESSO', sessoes_revogadas: revoked.rowCount, must_change_password: false } }, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
