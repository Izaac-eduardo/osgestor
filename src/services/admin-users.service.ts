import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../config/database.js';
import type { AuthRole, AuthStatus, AuthenticatedRequestUser, PublicUser } from '../types/auth.js';
import { hashPassword } from './password.service.js';
import { recordAudit } from './audit.service.js';

const roles: readonly AuthRole[] = ['ADMIN', 'OPERADOR', 'GESTOR'];
const statuses: readonly AuthStatus[] = ['ATIVO', 'INATIVO'];
const adminLockKey = 2_147_483_000;

export class AdminUsersError extends Error {
  constructor(public readonly statusCode: number, message: string) { super(message); this.name = 'AdminUsersError'; }
}

type UserInput = { username: unknown; email: unknown; password?: unknown; role: unknown; status: unknown };
type UserRow = PublicUser & { created_at: Date; updated_at: Date; last_login_at: Date | null };

function validateIdentity(username: unknown, email: unknown): { username: string; email: string } {
  if (typeof username !== 'string' || !username.trim() || username.trim().length > 80) throw new AdminUsersError(400, 'Username deve possuir entre 1 e 80 caracteres.');
  if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email.trim()) || email.trim().length > 320) throw new AdminUsersError(400, 'Informe um e-mail válido.');
  return { username: username.trim(), email: email.trim() };
}

function validateRoleStatus(role: unknown, status: unknown): { role: AuthRole; status: AuthStatus } {
  if (typeof role !== 'string' || !roles.includes(role as AuthRole)) throw new AdminUsersError(400, 'Role inválida.');
  if (typeof status !== 'string' || !statuses.includes(status as AuthStatus)) throw new AdminUsersError(400, 'Status inválido.');
  return { role: role as AuthRole, status: status as AuthStatus };
}

function publicRow(row: UserRow): UserRow { return row; }
function uuid(id: unknown): string { if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new AdminUsersError(400, 'Identificador de usuário inválido.'); return id; }

async function lockAdmins(client: PoolClient): Promise<void> { await client.query('SELECT pg_advisory_xact_lock($1)', [adminLockKey]); }
async function tryLockAdmins(client: PoolClient): Promise<void> { const result = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_xact_lock($1) AS locked', [adminLockKey]); if (!result.rows[0]?.locked) throw new AdminUsersError(409, 'Já existe uma recuperação administrativa em execução.'); }
async function assertNotLastAdmin(client: PoolClient, id: string, nextRole: AuthRole, nextStatus: AuthStatus): Promise<void> {
  if (nextRole === 'ADMIN' && nextStatus === 'ATIVO') return;
  const result = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM usuarios WHERE role = 'ADMIN' AND status = 'ATIVO' AND id <> $1`, [id]);
  if (Number(result.rows[0]?.count ?? 0) === 0) throw new AdminUsersError(409, 'A operação manteria o sistema sem ADMIN ativo.');
}
async function revokeSessions(client: PoolClient, id: string): Promise<number> { const result = await client.query('UPDATE sessoes SET revoked_at = NOW() WHERE usuario_id = $1 AND revoked_at IS NULL', [id]); return result.rowCount ?? 0; }
async function adminPasswordHash(password: unknown): Promise<string> { if (typeof password !== 'string') throw new AdminUsersError(400, 'Senha inicial obrigatória.'); try { return await hashPassword(password); } catch (error) { if (error instanceof Error && error.message.startsWith('A senha deve')) throw new AdminUsersError(400, error.message); throw error; } }

export async function recoverExistingAdminPassword(input: { username: string; password: string }, expectedDatabase: string): Promise<{ username: string; revokedSessions: number }> {
  if (input.username.trim().toLocaleLowerCase('en-US') !== 'izaac') throw new AdminUsersError(403, 'Recuperação permitida somente para o ADMIN izaac.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const db = await client.query<{ current_database: string }>('SELECT current_database()');
    if (!expectedDatabase.trim() || db.rows[0]?.current_database !== expectedDatabase.trim()) throw new AdminUsersError(409, `Recuperação recusada: banco conectado não corresponde ao destino esperado (${expectedDatabase || 'não informado'}).`);
    const requiredTables = await client.query<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`, [['usuarios', 'sessoes', 'auditoria']]);
    if (requiredTables.rowCount !== 3) throw new AdminUsersError(409, 'Recuperação recusada: migrations de autenticação e auditoria não estão completas.');
    await tryLockAdmins(client);
    const current = await client.query<{ id: string; username: string; role: AuthRole; status: AuthStatus }>(`SELECT id, username, role, status FROM usuarios WHERE lower(btrim(username)) = 'izaac' LIMIT 1 FOR UPDATE`);
    const user = current.rows[0];
    if (!user) throw new AdminUsersError(404, 'ADMIN izaac não encontrado.');
    if (user.role !== 'ADMIN' || user.status !== 'ATIVO') throw new AdminUsersError(409, 'A conta izaac não está elegível para recuperação.');
    const passwordHash = await adminPasswordHash(input.password);
    await client.query('UPDATE usuarios SET password_hash = $1, must_change_password = TRUE, updated_at = NOW() WHERE id = $2', [passwordHash, user.id]);
    const revokedSessions = await revokeSessions(client, user.id);
    await recordAudit({ actor: null, acao: 'REDEFINIR_SENHA', modulo: 'ADMIN_USUARIOS', entidade: 'usuarios', entidadeId: user.id, metadata: { operacao: 'RECUPERACAO_ADMIN_LOCAL', username: 'izaac', must_change_password: true, sessoes_revogadas: revokedSessions } }, client);
    await client.query('COMMIT');
    return { username: user.username, revokedSessions };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function bootstrapFirstAdmin(input: { username: string; email: string; password: string }, expectedDatabase: string): Promise<PublicUser> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const db = await client.query<{ current_database: string }>('SELECT current_database()');
    if (!expectedDatabase.trim() || db.rows[0]?.current_database !== expectedDatabase.trim()) throw new AdminUsersError(409, `Bootstrap recusado: banco conectado não corresponde ao destino esperado (${expectedDatabase || 'não informado'}).`);
    const requiredTables = await client.query<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`, [['usuarios', 'sessoes', 'auditoria']]);
    if (requiredTables.rowCount !== 3) throw new AdminUsersError(409, 'Bootstrap recusado: migrations de autenticação e auditoria não estão completas.');
    await lockAdmins(client);
    const existing = await client.query('SELECT 1 FROM usuarios WHERE role = \'ADMIN\' LIMIT 1');
    if (existing.rowCount) throw new AdminUsersError(409, 'Já existe um ADMIN; o bootstrap inicial foi encerrado.');
    const identity = validateIdentity(input.username, input.email);
    const duplicate = await client.query('SELECT 1 FROM usuarios WHERE lower(btrim(username)) = lower(btrim($1)) LIMIT 1', [identity.username]);
    if (duplicate.rowCount) throw new AdminUsersError(409, 'Username já cadastrado.');
    const passwordHash = await adminPasswordHash(input.password);
    const result = await client.query<UserRow>(`INSERT INTO usuarios(username, email, password_hash, role, status, must_change_password) VALUES ($1, $2, $3, 'ADMIN', 'ATIVO', TRUE) RETURNING id, username, email, role, status, created_at, updated_at, last_login_at, must_change_password`, [identity.username, identity.email, passwordHash]);
    await recordAudit({ actor: null, acao: 'CRIAR', modulo: 'ADMIN_USUARIOS', entidade: 'usuarios', entidadeId: result.rows[0]!.id, dadosPosteriores: { id: result.rows[0]!.id, username: result.rows[0]!.username, role: result.rows[0]!.role, status: result.rows[0]!.status, must_change_password: true }, metadata: { operacao: 'PROVISIONAMENTO_INICIAL', resultado: 'SUCESSO' } }, client);
    await client.query('COMMIT');
    return publicRow(result.rows[0]!);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function bootstrapAdmin(input: { username: string; email: string; password: string }): Promise<PublicUser> {
  return bootstrapFirstAdmin(input, 'oficina_test');
}

export async function listUsers(filters: { username?: string; role?: string; status?: string; limit?: number; offset?: number }): Promise<{ items: UserRow[]; total: number }> {
  const values: unknown[] = []; const where: string[] = [];
  if (filters.username?.trim()) { values.push(`%${filters.username.trim()}%`); where.push(`username ILIKE $${values.length}`); }
  if (filters.role) { if (!roles.includes(filters.role as AuthRole)) throw new AdminUsersError(400, 'Role inválida.'); values.push(filters.role); where.push(`role = $${values.length}`); }
  if (filters.status) { if (!statuses.includes(filters.status as AuthStatus)) throw new AdminUsersError(400, 'Status inválido.'); values.push(filters.status); where.push(`status = $${values.length}`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM usuarios ${clause}`, values);
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 100); const offset = Math.max(Number(filters.offset) || 0, 0);
  const result = await pool.query<UserRow>(`SELECT id, username, email, role, status, created_at, updated_at, last_login_at, must_change_password FROM usuarios ${clause} ORDER BY username LIMIT ${limit} OFFSET ${offset}`, values);
  return { items: result.rows.map(publicRow), total: Number(count.rows[0]?.count ?? 0) };
}

export async function getUser(idInput: unknown): Promise<UserRow> {
  const id = uuid(idInput); const result = await pool.query<UserRow>('SELECT id, username, email, role, status, created_at, updated_at, last_login_at, must_change_password FROM usuarios WHERE id = $1', [id]);
  if (!result.rows[0]) throw new AdminUsersError(404, 'Usuário não encontrado.'); return publicRow(result.rows[0]);
}

export async function createUser(input: UserInput, actor: AuthenticatedRequestUser): Promise<UserRow> {
  const identity = validateIdentity(input.username, input.email); const selected = validateRoleStatus(input.role, input.status);
  const passwordHash = await adminPasswordHash(input.password);
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await client.query<UserRow>(`INSERT INTO usuarios(username, email, password_hash, role, status, must_change_password) VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id, username, email, role, status, created_at, updated_at, last_login_at, must_change_password`, [identity.username, identity.email, passwordHash, selected.role, selected.status]); await recordAudit({ actor, acao: 'CRIAR', modulo: 'ADMIN_USUARIOS', entidade: 'usuarios', entidadeId: result.rows[0]!.id, dadosPosteriores: result.rows[0] }, client); await client.query('COMMIT'); return result.rows[0]!; }
  catch (error) { await client.query('ROLLBACK'); if ((error as { code?: string }).code === '23505') throw new AdminUsersError(409, 'Username ou e-mail já cadastrado.'); throw error; } finally { client.release(); }
}

export async function updateUser(idInput: unknown, input: { username?: unknown; email?: unknown; role?: unknown; status?: unknown }, actor: AuthenticatedRequestUser): Promise<UserRow> {
  const id = uuid(idInput); const client = await pool.connect();
  try {
    await client.query('BEGIN'); await lockAdmins(client);
    const current = await client.query<UserRow>('SELECT id, username, email, role, status, created_at, updated_at, last_login_at, must_change_password FROM usuarios WHERE id = $1 FOR UPDATE', [id]);
    const row = current.rows[0]; if (!row) throw new AdminUsersError(404, 'Usuário não encontrado.');
    const identity = validateIdentity(input.username ?? row.username, input.email ?? row.email); const selected = validateRoleStatus(input.role ?? row.role, input.status ?? row.status);
    await assertNotLastAdmin(client, id, selected.role, selected.status);
    const result = await client.query<UserRow>(`UPDATE usuarios SET username = $1, email = $2, role = $3, status = $4 WHERE id = $5 RETURNING id, username, email, role, status, created_at, updated_at, last_login_at, must_change_password`, [identity.username, identity.email, selected.role, selected.status, id]);
    const revokedSessions = row.role !== selected.role || row.status !== selected.status || row.username !== identity.username || row.email !== identity.email ? await revokeSessions(client, id) : 0;
    const changedBefore: Record<string, unknown> = {}; const changedAfter: Record<string, unknown> = {}; for (const key of ['username', 'email', 'role', 'status'] as const) { const before = row[key]; const after = result.rows[0]![key]; if (before !== after) { changedBefore[key] = before; changedAfter[key] = after; } }
    if (Object.keys(changedBefore).length) await recordAudit({ actor, acao: changedBefore.role ? 'ALTERAR_ROLE' : changedBefore.status ? 'ALTERAR_STATUS' : 'EDITAR', modulo: 'ADMIN_USUARIOS', entidade: 'usuarios', entidadeId: id, dadosAnteriores: changedBefore, dadosPosteriores: changedAfter, metadata: { sessoes_revogadas: revokedSessions } }, client);
    await client.query('COMMIT'); return result.rows[0]!;
  } catch (error) { await client.query('ROLLBACK'); if ((error as { code?: string }).code === '23505') throw new AdminUsersError(409, 'Username ou e-mail já cadastrado.'); throw error; } finally { client.release(); }
}

export async function setUserStatus(idInput: unknown, statusInput: unknown, actor: AuthenticatedRequestUser): Promise<UserRow> {
  return updateUser(idInput, { status: statusInput }, actor);
}

export async function resetUserPassword(idInput: unknown, password: unknown, actor: AuthenticatedRequestUser): Promise<void> {
  const id = uuid(idInput); const passwordHash = await adminPasswordHash(password); const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await client.query('UPDATE usuarios SET password_hash = $1, must_change_password = TRUE WHERE id = $2', [passwordHash, id]); if (!result.rowCount) throw new AdminUsersError(404, 'Usuário não encontrado.'); const revokedSessions = await revokeSessions(client, id); await recordAudit({ actor, acao: 'REDEFINIR_SENHA', modulo: 'ADMIN_USUARIOS', entidade: 'usuarios', entidadeId: id, metadata: { must_change_password: true, sessoes_revogadas: revokedSessions } }, client); await client.query('COMMIT'); } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export { roles as adminRoles, statuses as adminStatuses };
