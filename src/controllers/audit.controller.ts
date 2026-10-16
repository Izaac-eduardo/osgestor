import type { Request, Response } from 'express';
import { listAudit } from '../services/audit.service.js';

export async function listAuditController(request: Request, response: Response): Promise<void> {
  try { response.json(await listAudit({ from: typeof request.query.from === 'string' ? request.query.from : undefined, to: typeof request.query.to === 'string' ? request.query.to : undefined, username: typeof request.query.username === 'string' ? request.query.username : undefined, role: typeof request.query.role === 'string' ? request.query.role : undefined, modulo: typeof request.query.modulo === 'string' ? request.query.modulo : undefined, acao: typeof request.query.acao === 'string' ? request.query.acao : undefined, entidade: typeof request.query.entidade === 'string' ? request.query.entidade : undefined, entidadeId: typeof request.query.entidade_id === 'string' ? request.query.entidade_id : undefined, page: Number(request.query.page), pageSize: Number(request.query.page_size) })); } catch { response.status(500).json({ message: 'Não foi possível consultar a auditoria.' }); }
}
