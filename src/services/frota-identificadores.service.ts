import { pool } from '../config/database.js';

export const POLIFROTA_ORIGIN = 'POLIFROTA';
export const VEGA_ORIGIN = 'VEGA';

export interface ExternalFleetIdentifier {
  frota_id: string;
  origem: string;
  identificador_normalizado: string;
}

/** Normalizes external asset identifiers without collapsing alphanumeric distinctions. */
export function normalizeExternalFleetIdentifier(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, ' ')
    .trim();
}

export function normalizeExternalFleetOrigin(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

export async function createExternalFleetIdentifier(frotaId: string, origem: string, identificador: string) {
  const normalizedOrigin = normalizeExternalFleetOrigin(origem);
  const normalizedIdentifier = normalizeExternalFleetIdentifier(identificador);
  if (!normalizedOrigin || !normalizedIdentifier) throw new Error('Origem e identificador externo são obrigatórios.');
  return (await pool.query<ExternalFleetIdentifier>(
    `INSERT INTO frota_identificadores_externos(frota_id,origem,identificador,identificador_normalizado)
     VALUES($1,$2,$3,$4)
     RETURNING frota_id,origem,identificador_normalizado`,
    [frotaId, normalizedOrigin, identificador.trim(), normalizedIdentifier],
  )).rows[0]!;
}

export async function listExternalFleetIdentifiers(origem = POLIFROTA_ORIGIN): Promise<ExternalFleetIdentifier[]> {
  return (await pool.query<ExternalFleetIdentifier>(
    `SELECT frota_id,origem,identificador_normalizado
       FROM frota_identificadores_externos
      WHERE origem=$1`,
    [normalizeExternalFleetOrigin(origem)],
  )).rows;
}
