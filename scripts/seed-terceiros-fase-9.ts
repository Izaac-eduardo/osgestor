import 'dotenv/config';
import fs from 'node:fs';
import { pool } from '../src/config/database.js';
import { normalizeTerceiroIdentificacao, normalizeTerceiroNome, parseTerceiros, TerceiroIdentificacaoLinha } from '../src/imports/terceiros.js';

const file = '\\\\192.168.50.164\\Oficina\\IZAAC\\TERCEIROS.xlsx';
const maçaricos = ['CE01C', 'CE02C', 'CE03C', 'CE04C', 'CE05C'];

function canonicalName(row: TerceiroIdentificacaoLinha): string | null {
  if (!row.nomeOriginal) return null;
  const normalized = row.nomeNormalizado;
  if (normalized === 'PLANURB GERAL') return 'PLANURB';
  if (normalized === '2T ESCAVADEIRA' || normalized === '2T TERRAPLANAGEM' || normalized === '2T TERRAPLANAGEM GERAL') return '2T';
  return row.nomeOriginal.trim();
}

function identificationType(value: string, row: TerceiroIdentificacaoLinha, source: 'PLACA' | 'FROTA_EXTERNA'): 'PLACA' | 'FROTA_EXTERNA' | 'GERAL' | 'CODIGO' {
  const normalized = normalizeTerceiroIdentificacao(value);
  if (normalized === 'PLANURB' || normalized === 'RT01' || normalized === '2T') return 'GERAL';
  if (normalized === '2T01') return 'CODIGO';
  return source === 'PLACA' ? 'PLACA' : 'FROTA_EXTERNA';
}

async function main(): Promise<void> {
  if (!fs.existsSync(file)) throw new Error(`Arquivo não encontrado: ${file}`);
  const rows = parseTerceiros(fs.readFileSync(file), 'TERCEIROS.xlsx');
  const client = await pool.connect();
  const report = { terceirosCriados: 0, terceirosExistentes: 0, identificacoesCriadas: 0, identificacoesExistentes: 0, maçaricosCriados: [] as string[], maçaricosExistentes: [] as string[], linhasIgnoradas: [] as Array<{ linha: number; motivo: string }> };
  try {
    await client.query('BEGIN');
    const thirdIds = new Map<string, string>();
    const existingThirdParties = await client.query<{ id: string; nome: string }>('SELECT id,nome FROM abastecimento_terceiros FOR UPDATE');
    for (const existing of existingThirdParties.rows) thirdIds.set(normalizeTerceiroNome(existing.nome)!, existing.id);
    for (const row of rows) {
      const nome = canonicalName(row);
      if (!nome || !row.identificacoes.length) {
        if (!row.completa) report.linhasIgnoradas.push({ linha: row.linhaOriginal, motivo: 'LINHA_INCOMPLETA' });
        continue;
      }
      const nameKey = normalizeTerceiroNome(nome)!;
      if (thirdIds.has(nameKey)) continue;
      const existingId = thirdIds.get(nameKey);
      if (existingId) { report.terceirosExistentes += 1; continue; }
      const inserted = await client.query<{ id: string }>('INSERT INTO abastecimento_terceiros(codigo,nome,status) VALUES(NULL,$1,\'ATIVO\') RETURNING id', [nome]);
      thirdIds.set(nameKey, inserted.rows[0]!.id); report.terceirosCriados += 1;
    }
    // A identificação geral 2T foi confirmada operacionalmente, embora não exista como linha literal na planilha.
    const twoTKey = normalizeTerceiroNome('2T')!;
    if (!thirdIds.has(twoTKey)) {
      const inserted = await client.query<{ id: string }>('INSERT INTO abastecimento_terceiros(codigo,nome,status) VALUES(NULL,$1,\'ATIVO\') RETURNING id', ['2T']); thirdIds.set(twoTKey, inserted.rows[0]!.id); report.terceirosCriados += 1;
    }
    const desired = new Map<string, { terceiroId: string; original: string; tipo: string; observacoes: string | null }>();
    const priority: Record<string, number> = { FROTA_EXTERNA: 1, PLACA: 2, CODIGO: 3, GERAL: 4 };
    const add = (row: TerceiroIdentificacaoLinha, original: string, source: 'PLACA' | 'FROTA_EXTERNA') => {
      const nome = canonicalName(row); if (!nome) return;
      const id = thirdIds.get(normalizeTerceiroNome(nome)!); const normalized = normalizeTerceiroIdentificacao(original); if (!id || !normalized) return;
      const tipo = identificationType(original, row, source); const key = `${id}|${normalized}`; const current = desired.get(key);
      if (!current || (priority[tipo] ?? 0) > (priority[current.tipo] ?? 0)) desired.set(key, { terceiroId: id, original: original.trim(), tipo, observacoes: null });
    };
    for (const row of rows) {
      if (!row.completa) continue;
      if (row.placaOriginal) add(row, row.placaOriginal, 'PLACA');
      if (row.frotaOriginal) add(row, row.frotaOriginal, 'FROTA_EXTERNA');
    }
    const twoTId = thirdIds.get(twoTKey)!;
    desired.set(`${twoTId}|2T`, { terceiroId: twoTId, original: '2T', tipo: 'GERAL', observacoes: 'Identificação geral operacional confirmada.' });
    for (const item of desired.values()) {
      const existing = await client.query('SELECT id FROM abastecimento_terceiro_identificacoes WHERE identificacao_normalizada=$1', [normalizeTerceiroIdentificacao(item.original)]);
      if (existing.rows[0]) { report.identificacoesExistentes += 1; continue; }
      await client.query('INSERT INTO abastecimento_terceiro_identificacoes(terceiro_id,identificacao,identificacao_normalizada,tipo,observacoes) VALUES($1,$2,$3,$4,$5)', [item.terceiroId, item.original, normalizeTerceiroIdentificacao(item.original), item.tipo, item.observacoes]);
      report.identificacoesCriadas += 1;
    }
    for (const codigo of maçaricos) {
      const found = await client.query('SELECT id FROM frotas WHERE codigo=$1', [codigo]);
      if (found.rows[0]) { report.maçaricosExistentes.push(codigo); continue; }
      await client.query('INSERT INTO frotas(prefixo_frota_id,numero,codigo,descricao,placa,modelo,ano,status) VALUES(NULL,NULL,$1::varchar,$2::text,$1::text,NULL,NULL,\'ATIVO\')', [codigo, `Maçarico do espargidor ${codigo.slice(0, -1)}`]);
      report.maçaricosCriados.push(codigo);
    }
    await client.query('COMMIT');
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await pool.end(); });
