import type { Pool, PoolClient, QueryResult } from 'pg';
import { pool } from '../config/database.js';
import type { AuthenticatedRequestUser } from '../types/auth.js';

export type AuditAction = 'CRIAR' | 'EDITAR' | 'EXCLUIR' | 'FINALIZAR' | 'CANCELAR' | 'ATIVAR' | 'DESATIVAR' | 'IMPORTAR' | 'ALTERAR_STATUS' | 'REDEFINIR_SENHA' | 'ALTERAR_ROLE' | 'LOGIN' | 'LOGOUT' | 'ALTERAR_SENHA' | 'CONFIRMAR_NATUREZA' | 'REVOGAR_CONFIRMACAO_NATUREZA' | 'INVALIDAR_CONFIRMACAO_NATUREZA';
export type AuditEvent = { actor?: AuthenticatedRequestUser | null; acao: AuditAction; modulo: string; entidade: string; entidadeId?: string | number | null; dadosAnteriores?: unknown; dadosPosteriores?: unknown; metadata?: Record<string, unknown> };
export type AuditExecutor = Pool | PoolClient;

const sensitiveKeys = new Set(['password', 'password_hash', 'currentpassword', 'newpassword', 'confirmpassword', 'token', 'token_hash', 'authorization', 'cookie', 'cookies', 'secret', 'senha']);
function safeSnapshot(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 100).map(safeSnapshot);
  if (typeof value === 'object') { const output: Record<string, unknown> = {}; for (const [key, item] of Object.entries(value)) if (!sensitiveKeys.has(key.toLowerCase())) output[key] = safeSnapshot(item); return output; }
  return undefined;
}
export function auditSnapshot(value: unknown): Record<string, unknown> | null { const result = safeSnapshot(value); return result && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : result == null ? null : { value: result }; }
export async function recordAudit(event: AuditEvent, executor: AuditExecutor = pool): Promise<void> {
  const actor = event.actor ?? null;
  await executor.query(`INSERT INTO auditoria(usuario_id, username, role, acao, modulo, entidade, entidade_id, dados_anteriores, dados_posteriores, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb)`, [actor?.id ?? null, actor?.username ?? null, actor?.role ?? null, event.acao, event.modulo, event.entidade, event.entidadeId == null ? null : String(event.entidadeId), JSON.stringify(auditSnapshot(event.dadosAnteriores)), JSON.stringify(auditSnapshot(event.dadosPosteriores)), JSON.stringify(auditSnapshot(event.metadata) ?? {})]);
}

export type AuditFilters = { from?: string; to?: string; username?: string; role?: string; modulo?: string; acao?: string; entidade?: string; entidadeId?: string; page?: number; pageSize?: number };
export async function listAudit(filters: AuditFilters = {}) {
  const values: unknown[] = []; const conditions: string[] = [];
  const add = (sql: string, value: unknown) => { values.push(value); conditions.push(sql.replace('?', `$${values.length}`)); };
  if (filters.from) add('created_at >= ?::timestamptz', filters.from);
  if (filters.to) add('created_at < (?::timestamptz + interval \'1 day\')', filters.to);
  if (filters.username) add('username ILIKE ?', `%${filters.username}%`);
  if (filters.role) add('role = ?', filters.role);
  if (filters.modulo) add('modulo = ?', filters.modulo);
  if (filters.acao) add('acao = ?', filters.acao);
  if (filters.entidade) add('entidade = ?', filters.entidade);
  if (filters.entidadeId) add('entidade_id = ?', filters.entidadeId);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const count = await pool.query<{ count: string }>(`SELECT COUNT(*)::text count FROM auditoria ${where}`, values);
  const pageSize = Math.min(Math.max(Number(filters.pageSize) || 20, 1), 100); const page = Math.max(Number(filters.page) || 1, 1); const offset = (page - 1) * pageSize;
  const result = await pool.query(`SELECT id, usuario_id, username, role, acao, modulo, entidade, entidade_id, dados_anteriores, dados_posteriores, metadata, created_at FROM auditoria ${where} ORDER BY created_at DESC, id DESC LIMIT ${pageSize} OFFSET ${offset}`, values);
  const total = Number(count.rows[0]?.count ?? 0); return { data: result.rows, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export type { QueryResult };
