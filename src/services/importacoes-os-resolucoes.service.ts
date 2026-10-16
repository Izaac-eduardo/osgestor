import type { PoolClient } from 'pg';
import { pool } from '../config/database.js';
import { normalizeFleetCode } from '../utils/frotas.js';
import { normalizeSearchText } from '../utils/text.js';
import type { AuthenticatedRequestUser } from '../types/auth.js';
import type { ManualResolution, ParsedOs } from '../imports/poli-os.js';
import type { PoliImport } from '../imports/poli-canonical.js';

type ResolutionField = ManualResolution['campo'];
type StoredResolution = {
  numero_os: number;
  campo: ResolutionField;
  identificador_original: string;
  identificador_normalizado: string;
  valor_selecionado: string;
  decidido_por: string | null;
  created_at: string;
};

export const normalizeResolutionIdentifier = (campo: ResolutionField, value: string | null | undefined): string =>
  campo === 'frotaId' ? normalizeFleetCode(value ?? '') : normalizeSearchText(String(value ?? '').trim());

async function validateTarget(campo: ResolutionField, id: string): Promise<boolean> {
  const table = campo === 'frotaId' ? 'frotas' : 'obras';
  const status = campo === 'frotaId' ? 'ATIVO' : 'ATIVA';
  return Boolean((await pool.query(`SELECT 1 FROM ${table} WHERE id=$1 AND status=$2`, [id, status])).rowCount);
}

export async function recoverManualResolutions(
  items: ParsedOs[],
  metadata: PoliImport,
  token: string,
): Promise<number> {
  const result = await pool.query<StoredResolution>(
    `SELECT numero_os, campo, identificador_original, identificador_normalizado, valor_selecionado,
            decidido_por, created_at
       FROM importacoes_os_resolucoes_manuais
      WHERE origem_sistema=$1 AND hash_arquivo=$2 AND decisao='APROVAR'`,
    [metadata.origemSistema, metadata.hashArquivo],
  );
  let recovered = 0;
  for (const item of items) {
    const candidates: Array<{ campo: ResolutionField; original: string | null | undefined }> = [
      { campo: 'frotaId', original: item.frotaOriginal },
      { campo: 'obraId', original: item.parecerOriginal },
    ];
    for (const candidate of candidates) {
      const normalized = normalizeResolutionIdentifier(candidate.campo, candidate.original);
      if (!normalized) continue;
      const stored = result.rows.find(row => row.campo === candidate.campo
        && row.identificador_normalizado === normalized
        && Number(row.numero_os) === item.numeroOs);
      if (!stored || !(await validateTarget(candidate.campo, stored.valor_selecionado))) continue;
      if (candidate.campo === 'frotaId') item.frotaId = stored.valor_selecionado;
      else item.obraId = stored.valor_selecionado;
      item.pendencias = item.pendencias.filter(value => candidate.campo === 'frotaId'
        ? !value.startsWith('FROTA_PENDENTE')
        : !value.startsWith('OBRA_PENDENTE') && !value.startsWith('OBRA_AMBIGUA'));
      const manual: ManualResolution = {
        campo: candidate.campo,
        valorOrigem: null,
        identificadorOriginal: candidate.original ?? null,
        valorSelecionado: stored.valor_selecionado,
        arquivoOrigem: metadata.arquivoNome,
        importacaoId: token,
        numeroOs: item.numeroOs,
        decisao: 'APROVAR',
        decididoEm: stored.created_at,
        decididoPor: stored.decidido_por,
      };
      item.manualResolucoes = [...(item.manualResolucoes ?? []).filter(value => value.campo !== candidate.campo), manual];
      recovered++;
    }
    if (item.manualResolucoes?.length && item.pendencias.length === 0) item.statusPreview = 'PRONTA';
  }
  return recovered;
}

export async function persistManualResolutions(
  client: PoolClient,
  metadata: PoliImport,
  item: ParsedOs,
  actor?: AuthenticatedRequestUser | null,
): Promise<void> {
  for (const resolution of item.manualResolucoes ?? []) {
    const original = resolution.identificadorOriginal;
    const normalized = normalizeResolutionIdentifier(resolution.campo, original);
    if (!normalized) continue;
    const existing = await client.query<{ valor_selecionado: string }>(
      `SELECT valor_selecionado FROM importacoes_os_resolucoes_manuais
        WHERE origem_sistema=$1 AND hash_arquivo=$2 AND numero_os=$3 AND campo=$4 AND identificador_normalizado=$5
        FOR UPDATE`,
      [metadata.origemSistema, metadata.hashArquivo, item.numeroOs, resolution.campo, normalized],
    );
    if (existing.rowCount && existing.rows[0]!.valor_selecionado !== resolution.valorSelecionado) {
      throw new Error(`Já existe uma resolução manual diferente para a O.S. ${item.numeroOs}.`);
    }
    if (!existing.rowCount) await client.query(
      `INSERT INTO importacoes_os_resolucoes_manuais
        (origem_sistema,hash_arquivo,arquivo_nome,numero_os,campo,identificador_original,identificador_normalizado,valor_selecionado,decisao,decidido_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'APROVAR',$9)`,
      [metadata.origemSistema, metadata.hashArquivo, metadata.arquivoNome, item.numeroOs, resolution.campo, original ?? '', normalized, resolution.valorSelecionado, actor?.id ?? resolution.decididoPor ?? null],
    );
  }
}
