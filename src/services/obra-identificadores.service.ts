import { pool } from '../config/database.js';
import { normalizeSearchText } from '../utils/text.js';

/** O importador Poli/Vega atual usa o vocabulário Vega para a origem externa. */
export const VEGA_OBRA_ORIGIN = 'VEGA';

export interface ExternalObraIdentifier {
  id?: string;
  obra_id: string;
  origem: string;
  identificador: string;
  identificador_normalizado: string;
}

export function normalizeExternalObraIdentifier(value: unknown): string {
  return normalizeSearchText(String(value ?? ''));
}

export function normalizeExternalObraOrigin(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

export async function listExternalObraIdentifiers(origem = VEGA_OBRA_ORIGIN): Promise<ExternalObraIdentifier[]> {
  return (await pool.query<ExternalObraIdentifier>(
    `SELECT id,obra_id,origem,identificador,identificador_normalizado
       FROM obra_identificadores_externos
      WHERE origem=$1`,
    [normalizeExternalObraOrigin(origem)],
  )).rows;
}

export async function resolveExternalObraIdentifier(
  identificador: string | null,
  obras: Array<{ id: string; codigo: string; nome: string }>,
  aliases: ExternalObraIdentifier[],
  origem = VEGA_OBRA_ORIGIN,
): Promise<string | undefined> {
  const key = normalizeExternalObraIdentifier(identificador);
  if (!key) return undefined;

  const direct = obras.filter(obra => normalizeExternalObraIdentifier(obra.codigo) === key
    || normalizeExternalObraIdentifier(obra.nome) === key);
  if (direct.length === 1) return direct[0]!.id;
  if (direct.length > 1) return undefined;

  const matches = aliases.filter(alias => alias.origem === normalizeExternalObraOrigin(origem)
    && alias.identificador_normalizado === key);
  return matches.length === 1 ? matches[0]!.obra_id : undefined;
}

export async function createExternalObraIdentifier(
  obraId: string,
  origem: string,
  identificador: string,
): Promise<ExternalObraIdentifier> {
  const normalizedOrigin = normalizeExternalObraOrigin(origem);
  const normalizedIdentifier = normalizeExternalObraIdentifier(identificador);
  if (!normalizedOrigin || !normalizedIdentifier) throw new Error('Origem e identificador externo da obra são obrigatórios.');
  const inserted = await pool.query<ExternalObraIdentifier>(
    `INSERT INTO obra_identificadores_externos(obra_id,origem,identificador,identificador_normalizado)
     VALUES($1,$2,$3,$4)
     ON CONFLICT (origem,identificador_normalizado) DO NOTHING
     RETURNING id,obra_id,origem,identificador,identificador_normalizado`,
    [obraId, normalizedOrigin, identificador.trim(), normalizedIdentifier],
  );
  if (inserted.rows[0]) return inserted.rows[0];
  const existing = (await pool.query<ExternalObraIdentifier>(
    `SELECT id,obra_id,origem,identificador,identificador_normalizado
       FROM obra_identificadores_externos
      WHERE origem=$1 AND identificador_normalizado=$2`,
    [normalizedOrigin, normalizedIdentifier],
  )).rows[0];
  if (!existing) throw new Error('Não foi possível confirmar o alias de obra.');
  if (existing.obra_id !== obraId) throw new Error('O identificador externo já está associado a outra obra.');
  return existing;
}
