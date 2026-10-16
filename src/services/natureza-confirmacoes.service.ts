import { createHash } from 'node:crypto';
import { pool } from '../config/database.js';
import type { AuthenticatedRequestUser } from '../types/auth.js';
import type { ParsedOs } from '../imports/poli-os.js';
import { buildOsUpdateDiff, loadExistingOsUsing, type ExistingOsSnapshot } from './sincronizacao-os.service.js';
import { recordAudit } from './audit.service.js';

export const naturezaConfirmacaoVersao = 'natureza-poli-v1';

export class NaturezaConfirmacaoError extends Error {
  constructor(public readonly statusCode: number, message: string) { super(message); this.name = 'NaturezaConfirmacaoError'; }
}

type CanonicalItem = { tipo: string; codigo: string | null; descricao: string; unidade: string | null; quantidade: string | null; valor_unitario: string | null; total: string | null; classificacao: string | null; categoria: string | null; subcategoria: string | null };

export interface NaturezaConfirmationSignature {
  hashEstadoBanco: string;
  hashConteudoXls: string;
  versao: string;
}

export interface NaturezaConfirmationResult {
  id: string;
  estado: 'ATIVA' | 'INVALIDADA' | 'REVOGADA';
  confirmadoEm: string;
  reutilizada?: boolean;
}

const text = (value: unknown): string => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
const date = (value: unknown): string | null => value == null || value === '' ? null : String(value).slice(0, 10);
const decimal = (value: unknown, scale: number): string | null => value == null || value === '' ? null : Number(value).toFixed(scale);
const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');

function sortItems(items: CanonicalItem[]): CanonicalItem[] {
  return [...items].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
}

function bankItems(current: ExistingOsSnapshot): CanonicalItem[] {
  const products: CanonicalItem[] = current.produtos.map(item => ({ tipo: 'PRODUTO', codigo: null, descricao: text(item.descricao), unidade: text(item.unidade), quantidade: decimal(item.quantidade, 3), valor_unitario: decimal(item.valorUnitario, 2), total: decimal(item.quantidade * item.valorUnitario, 2), classificacao: null, categoria: null, subcategoria: null }));
  const services: CanonicalItem[] = current.servicos.map(item => ({ tipo: 'SERVICO', codigo: null, descricao: text(item.descricao), unidade: null, quantidade: null, valor_unitario: null, total: decimal(item.valor, 2), classificacao: null, categoria: null, subcategoria: null }));
  return sortItems([...products, ...services]);
}

function xlsItems(parsed: ParsedOs): CanonicalItem[] {
  return sortItems(parsed.itens.map(item => ({ tipo: item.tipo, codigo: item.codigo_poli ?? item.codigo ?? null, descricao: text(item.descricao), unidade: item.unidade ? text(item.unidade) : null, quantidade: decimal(item.quantidade, 3), valor_unitario: decimal(item.valorUnitario, 2), total: decimal(item.total, 2), classificacao: item.classificacao_servico ?? null, categoria: item.categoria_gerencial ?? null, subcategoria: item.subcategoria_gerencial ?? null })));
}

export function buildNaturezaConfirmationSignature(parsed: ParsedOs, current: ExistingOsSnapshot): NaturezaConfirmationSignature {
  const banco = {
    id: current.id,
    numero_os: current.numeroOs,
    natureza: current.natureza,
    frota_id: current.frotaId,
    frota_override_id: current.frotaOverrideId ?? null,
    frota: text(current.frota),
    obra_id: current.obraId,
    status: current.status,
    data_abertura: date(current.dataAbertura),
    data_fechamento: date(current.dataFechamento),
    problema: text(current.problema),
    itens: bankItems(current),
  };
  const xls = {
    id: current.id,
    numero_os: parsed.numeroOs,
    origem: 'POLI',
    natureza: parsed.natureza ?? null,
    frota_id: parsed.frotaId ?? null,
    frota_original: text(parsed.frotaOriginal),
    obra_id: parsed.obraId ?? null,
    status: parsed.status ?? null,
    data: date(parsed.data),
    problema: text(parsed.problema),
    itens: xlsItems(parsed),
  };
  return { hashEstadoBanco: digest(banco), hashConteudoXls: digest(xls), versao: naturezaConfirmacaoVersao };
}

function isMissingTable(error: unknown): boolean { return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '42P01'); }

export async function findValidNaturezaConfirmation(parsed: ParsedOs, current: ExistingOsSnapshot, origemSistema = 'POLI'): Promise<NaturezaConfirmationResult | null> {
  const signature = buildNaturezaConfirmationSignature(parsed, current);
  try {
    const result = await pool.query<{ id: string; estado: 'ATIVA' | 'INVALIDADA' | 'REVOGADA'; confirmado_em: Date }>(
      `SELECT id, estado, confirmado_em FROM ordens_servico_natureza_confirmacoes
       WHERE ordem_servico_id=$1 AND origem_sistema=$2 AND natureza_banco=$3 AND natureza_confirmada=$3
         AND natureza_xls=$4 AND estado='ATIVA' AND assinatura_versao=$5
         AND hash_estado_banco=$6 AND hash_conteudo_xls=$7
       ORDER BY confirmado_em DESC LIMIT 1`,
      [current.id, origemSistema, current.natureza, parsed.natureza, signature.versao, signature.hashEstadoBanco, signature.hashConteudoXls],
    );
    const row = result.rows[0];
    return row ? { id: row.id, estado: row.estado, confirmadoEm: row.confirmado_em.toISOString(), reutilizada: true } : null;
  } catch (error) { if (isMissingTable(error)) return null; throw error; }
}

export async function registerNaturezaConfirmation(parsed: ParsedOs, actor: AuthenticatedRequestUser, motivo?: string): Promise<NaturezaConfirmationResult> {
  if (actor.role !== 'ADMIN') throw new NaturezaConfirmacaoError(403, 'Somente ADMIN pode confirmar a natureza da O.S.');
  if (parsed.natureza !== 'INTERNA') throw new NaturezaConfirmacaoError(409, 'A confirmação esperada para este fluxo é a divergência MATERIAL versus INTERNA.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await loadExistingOsUsing(client, parsed.numeroOs);
    if (!current) throw new NaturezaConfirmacaoError(404, 'O.S. não encontrada.');
    if (current.natureza !== 'MATERIAL') throw new NaturezaConfirmacaoError(409, 'A natureza atual da O.S. mudou; reanalise a prévia.');
    const diff = buildOsUpdateDiff(parsed, current);
    if (!diff.divergencias.includes('NATUREZA_SEM_EVIDENCIA_FORTE')) throw new NaturezaConfirmacaoError(409, 'A divergência de natureza não está mais presente.');
    const signature = buildNaturezaConfirmationSignature(parsed, current);
    const importResult = parsed.importacaoId ? await client.query<{ arquivo_nome: string; origem_sistema: string }>('SELECT arquivo_nome, origem_sistema FROM importacoes_os WHERE id=$1', [parsed.importacaoId]) : { rows: [] } as { rows: Array<{ arquivo_nome: string; origem_sistema: string }> };
    const origemSistema = importResult.rows[0]?.origem_sistema ?? 'POLI';
    const existing = await client.query<{ id: string; estado: 'ATIVA' | 'INVALIDADA' | 'REVOGADA'; confirmado_em: Date; hash_estado_banco: string; hash_conteudo_xls: string }>(
      `SELECT id, estado, confirmado_em, hash_estado_banco, hash_conteudo_xls FROM ordens_servico_natureza_confirmacoes WHERE ordem_servico_id=$1 AND origem_sistema=$2 AND natureza_xls=$3 AND estado='ATIVA' FOR UPDATE`,
      [current.id, origemSistema, parsed.natureza],
    );
    const active = existing.rows[0];
    if (active) {
      if (active.hash_estado_banco === signature.hashEstadoBanco && active.hash_conteudo_xls === signature.hashConteudoXls) {
        await client.query('COMMIT');
        return { id: active.id, estado: active.estado, confirmadoEm: active.confirmado_em.toISOString(), reutilizada: true };
      }
      throw new NaturezaConfirmacaoError(409, 'Já existe uma confirmação ativa, mas a O.S. ou o conteúdo do XLS mudou.');
    }
    const inserted = await client.query<{ id: string; estado: 'ATIVA'; confirmado_em: Date }>(
      `INSERT INTO ordens_servico_natureza_confirmacoes
       (ordem_servico_id,natureza_banco,natureza_confirmada,natureza_xls,origem_sistema,importacao_id,arquivo_nome,hash_estado_banco,hash_conteudo_xls,assinatura_versao,estado,motivo,confirmado_por,confirmado_username)
       VALUES ($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,'ATIVA',$10,$11,$12)
       RETURNING id, estado, confirmado_em`,
      [current.id, current.natureza, parsed.natureza, origemSistema, parsed.importacaoId ?? null, importResult.rows[0]?.arquivo_nome ?? null, signature.hashEstadoBanco, signature.hashConteudoXls, signature.versao, motivo?.trim() || null, actor.id, actor.username],
    );
    await recordAudit({ actor, acao: 'CONFIRMAR_NATUREZA', modulo: 'IMPORTACOES_OS', entidade: 'ordens_servico_natureza_confirmacoes', entidadeId: inserted.rows[0]!.id, dadosPosteriores: { ordem_servico_id: current.id, numero_os: current.numeroOs, natureza_confirmada: current.natureza, natureza_xls: parsed.natureza, origem_sistema: origemSistema, assinatura_versao: signature.versao }, metadata: { operacao: 'CONFIRMACAO_NATUREZA', resultado: 'SUCESSO' } }, client);
    await client.query('COMMIT');
    return { id: inserted.rows[0]!.id, estado: inserted.rows[0]!.estado, confirmadoEm: inserted.rows[0]!.confirmado_em.toISOString() };
  } catch (error) { await client.query('ROLLBACK'); if (error instanceof NaturezaConfirmacaoError) throw error; if (isMissingTable(error)) throw new NaturezaConfirmacaoError(503, 'A estrutura de confirmações ainda não está disponível neste banco.'); throw error; }
  finally { client.release(); }
}

export async function revokeNaturezaConfirmation(id: string, actor: AuthenticatedRequestUser, motivo?: string): Promise<void> {
  if (actor.role !== 'ADMIN') throw new NaturezaConfirmacaoError(403, 'Somente ADMIN pode revogar uma confirmação.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ ordem_servico_id: string; estado: string }>('SELECT ordem_servico_id, estado FROM ordens_servico_natureza_confirmacoes WHERE id=$1 FOR UPDATE', [id]);
    const row = result.rows[0];
    if (!row) throw new NaturezaConfirmacaoError(404, 'Confirmação não encontrada.');
    if (row.estado !== 'ATIVA') throw new NaturezaConfirmacaoError(409, 'A confirmação não está ativa.');
    await client.query(`UPDATE ordens_servico_natureza_confirmacoes SET estado='REVOGADA', invalidada_em=NOW(), invalidada_por=$1 WHERE id=$2`, [actor.id, id]);
    await recordAudit({ actor, acao: 'REVOGAR_CONFIRMACAO_NATUREZA', modulo: 'IMPORTACOES_OS', entidade: 'ordens_servico_natureza_confirmacoes', entidadeId: id, dadosAnteriores: { ordem_servico_id: row.ordem_servico_id, estado: row.estado }, dadosPosteriores: { estado: 'REVOGADA' }, metadata: { operacao: 'REVOGACAO_NATUREZA', motivo: motivo?.trim() || null } }, client);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); if (error instanceof NaturezaConfirmacaoError) throw error; throw error; }
  finally { client.release(); }
}
