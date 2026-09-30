import 'dotenv/config';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { test, after } from 'node:test';
import { Pool } from 'pg';
import { confirm } from '../src/controllers/importacoes-os.controller.js';
import { createOrdemServico, updateOrdemServico } from '../src/services/ordens-servico.service.js';
import type { ParsedOs } from '../src/imports/poli-os.js';

assert.equal(process.env.DB_NAME, 'oficina_test', 'estes testes exigem DB_NAME=oficina_test');

const pool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
});

const fixture = async () => {
  const result = await pool.query<{ obra_id: string; frota_id: string }>(
    `SELECT o.id AS obra_id, f.id AS frota_id
       FROM obras o CROSS JOIN frotas f
      WHERE o.codigo='TEST-OBRA-001' AND f.codigo='TST01'`,
  );
  assert.equal(result.rows.length, 1);
  return result.rows[0]!;
};

const parsed = (numeroOs: number, status: string, original: string | null, origem: 'AUTOMATICO' | 'MANUAL' | null): ParsedOs => ({
  numeroOs,
  data: '2026-09-30',
  cliente: null,
  frotaOriginal: 'TST01',
  frotaId: undefined,
  parecerOriginal: null,
  obraId: undefined,
  funcionarioAbertura: null,
  problema: 'Teste de rastreabilidade',
  natureza: 'MATERIAL',
  categoriaServico: undefined,
  status,
  statusOriginal: original,
  statusOrigem: origem,
  itens: [],
  execucoes: [],
  statusPreview: 'PRONTA',
  pendencias: [],
  origem: 'teste-status.xls',
});

const responseOf = () => {
  let statusCode = 200;
  let body: unknown;
  return {
    response: {
      status(code: number) { statusCode = code; return this; },
      json(value: unknown) { body = value; return this; },
    } as never,
    result: () => ({ statusCode, body }),
  };
};

async function savePreview(token: string, items: ParsedOs[]): Promise<void> {
  await pool.query('INSERT INTO importacoes_os(id,arquivo_nome,expires_at) VALUES ($1,$2,now()+interval \'1 hour\')', [token, 'status-test.xls']);
  for (const item of items) await pool.query(
    'INSERT INTO importacoes_os_itens(importacao_id,numero_os,payload_json,status_preview,pendencias_json) VALUES ($1,$2,$3,$4,$5)',
    [token, item.numeroOs, JSON.stringify(item), item.statusPreview, JSON.stringify(item.pendencias)],
  );
}

test('migration 020 cria rastreabilidade nullable sem default ou backfill', async () => {
  const columns = await pool.query<{ column_name: string; data_type: string; character_maximum_length: number | null; is_nullable: string; column_default: string | null }>(
    `SELECT column_name,data_type,character_maximum_length,is_nullable,column_default
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ordens_servico'
        AND column_name IN ('status_original','status_origem') ORDER BY column_name`,
  );
  assert.deepEqual(columns.rows, [
    { column_name: 'status_origem', data_type: 'character varying', character_maximum_length: 20, is_nullable: 'YES', column_default: null },
    { column_name: 'status_original', data_type: 'character varying', character_maximum_length: 255, is_nullable: 'YES', column_default: null },
  ]);
  const constraint = await pool.query<{ definition: string }>(
    `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conname='ordens_servico_status_origem_check'`,
  );
  assert.match(constraint.rows[0]?.definition ?? '', /status_origem IS NULL/);
  assert.match(constraint.rows[0]?.definition ?? '', /AUTOMATICO/);
  assert.match(constraint.rows[0]?.definition ?? '', /MANUAL/);
});

test('confirma status automatico e manual preservando status original bruto', async () => {
  const refs = await fixture();
  const automaticNumber = 980000000 + Math.floor(Math.random() * 1000000);
  const manualNumber = automaticNumber + 1;
  const token = randomUUID();
  const items = [parsed(automaticNumber, 'FINALIZADA', 'Encerrada por Venda', 'AUTOMATICO'), parsed(manualNumber, 'CANCELADA', 'NÃO FATURAR NESSE CADASTRO', 'MANUAL')];
  for (const item of items) { item.obraId = refs.obra_id; item.frotaId = refs.frota_id; }
  try {
    await savePreview(token, items);
    const out = responseOf();
    await confirm({ params: { token } } as never, out.response);
    assert.equal(out.result().statusCode, 200);
    const result = await pool.query<{ numero_os: string; status: string; status_original: string; status_origem: string }>(
      `SELECT numero_os,status,status_original,status_origem FROM ordens_servico WHERE numero_os = ANY($1::bigint[]) ORDER BY numero_os`,
      [[automaticNumber, manualNumber]],
    );
    assert.deepEqual(result.rows, [
      { numero_os: String(automaticNumber), status: 'FINALIZADA', status_original: 'Encerrada por Venda', status_origem: 'AUTOMATICO' },
      { numero_os: String(manualNumber), status: 'CANCELADA', status_original: 'NÃO FATURAR NESSE CADASTRO', status_origem: 'MANUAL' },
    ]);
  } finally {
    await pool.query('DELETE FROM ordens_servico WHERE numero_os = ANY($1::bigint[])', [[automaticNumber, manualNumber]]);
    await pool.query('DELETE FROM importacoes_os WHERE id=$1', [token]);
  }
});

test('criação normal ignora rastreabilidade forjada e atualização não a altera', async () => {
  const refs = await fixture();
  const numeroOs = 980000000 + Math.floor(Math.random() * 1000000);
  const created = await createOrdemServico({
    numero_os: numeroOs, obra_id: refs.obra_id, frota_id: refs.frota_id,
    natureza_os: 'MATERIAL', data_abertura: '2026-09-30', status: 'ABERTA',
    status_original: 'FORJADO', status_origem: 'AUTOMATICO', observacoes: 'teste',
  });
  try {
    assert.equal(created.status_original, null);
    assert.equal(created.status_origem, null);
    await updateOrdemServico(created.id, {
      numero_os: numeroOs, obra_id: refs.obra_id, frota_id: refs.frota_id,
      natureza_os: 'MATERIAL', data_abertura: '2026-09-30', status: 'FINALIZADA',
      status_original: 'ALTERADO', status_origem: 'MANUAL', observacoes: 'alterado',
    });
    const stored = await pool.query<{ status: string; status_original: string | null; status_origem: string | null }>(
      'SELECT status,status_original,status_origem FROM ordens_servico WHERE id=$1', [created.id],
    );
    assert.deepEqual(stored.rows[0], { status: 'FINALIZADA', status_original: null, status_origem: null });
  } finally {
    await pool.query('DELETE FROM ordens_servico WHERE id=$1', [created.id]);
  }
});

test('duplicada não sobrescreve rastreabilidade existente', async () => {
  const refs = await fixture();
  const numeroOs = 980000000 + Math.floor(Math.random() * 1000000);
  const token = randomUUID();
  await pool.query(
    `INSERT INTO ordens_servico(numero_os,obra_id,frota_id,natureza_os,data_abertura,status,status_original,status_origem)
     VALUES($1,$2,$3,'MATERIAL','2026-09-30','ABERTA','Original preservado','MANUAL')`,
    [numeroOs, refs.obra_id, refs.frota_id],
  );
  const item = parsed(numeroOs, 'FINALIZADA', 'Novo Vega', 'AUTOMATICO'); item.obraId = refs.obra_id; item.frotaId = refs.frota_id;
  try {
    await savePreview(token, [item]);
    const out = responseOf();
    await confirm({ params: { token } } as never, out.response);
    const stored = await pool.query<{ status: string; status_original: string; status_origem: string }>(
      'SELECT status,status_original,status_origem FROM ordens_servico WHERE numero_os=$1', [numeroOs],
    );
    assert.deepEqual(stored.rows[0], { status: 'ABERTA', status_original: 'Original preservado', status_origem: 'MANUAL' });
  } finally {
    await pool.query('DELETE FROM ordens_servico WHERE numero_os=$1', [numeroOs]);
    await pool.query('DELETE FROM importacoes_os WHERE id=$1', [token]);
  }
});

after(async () => { await pool.end(); });
