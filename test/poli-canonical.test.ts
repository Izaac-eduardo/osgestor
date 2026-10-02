import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as XLSX from 'xlsx';
import { analyze, confirm } from '../src/controllers/importacoes-os.controller.js';
import { pool } from '../src/config/database.js';
import { buildPoliImport } from '../src/imports/poli-canonical.js';
import { parsePoliOs } from '../src/imports/poli-os.js';

const osNumero = 990001001;
const fakeRequest = (body: Record<string, unknown>, params: Record<string, string> = {}) => ({ body, params }) as never;
const captureResponse = () => {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { response.statusCode = code; return response; },
    json(value: unknown) { response.body = value; return response; },
  };
  return response;
};

function buildFixture(): Buffer {
  const rows: unknown[][] = Array.from({ length: 8 }, () => Array(40).fill(null));
  rows[0]![0] = 'O. S.';
  rows[0]![6] = 'Data O.S';
  rows[0]![12] = 'Cliente';
  rows[0]![30] = 'Placa';
  rows[1]![0] = osNumero;
  rows[1]![6] = '01/10/2026';
  rows[1]![16] = 'ITAIPU ENGENHARIA';
  rows[1]![30] = 'TST0101';
  rows[1]![34] = '516';
  rows[1]![36] = 'LUIS';
  rows[2]![8] = 'Aberta';
  rows[3]![0] = 'Produtos / Serviços';
  rows[3]![22] = 'Técnico/Operador';
  rows[3]![30] = 'Qtde';
  rows[3]![32] = 'Vlr. Unit. ($)';
  rows[3]![37] = 'Des($)';
  rows[3]![38] = 'Total Item ($)';
  rows[4]![3] = '9001';
  rows[4]![5] = 'FILTRO TESTE';
  rows[4]![30] = 2;
  rows[4]![32] = 10;
  rows[4]![37] = 0;
  rows[4]![38] = 20;
  rows[5]![0] = 'PARECER...: TEST-OBRA-001';
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'OS');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

test('modelo canônico calcula hash, contexto e persiste a nova importação sem duplicar', async () => {
  const buffer = buildFixture();
  const filename = 'l3-canonical-fixture.xlsx';
  const metadata = buildPoliImport(buffer, filename);
  assert.equal(metadata.hashArquivo, crypto.createHash('sha256').update(buffer).digest('hex'));
  const firstParsed = parsePoliOs(buffer, filename, metadata);
  const secondParsed = parsePoliOs(buffer, filename, metadata);
  assert.deepEqual(firstParsed[0]?.itens[0], secondParsed[0]?.itens[0]);
  assert.equal(firstParsed[0]?.itens[0]?.codigo_poli, '9001');
  assert.ok(firstParsed[0]?.itens[0]?.fingerprintContexto);
  assert.ok(firstParsed[0]?.itens[0]?.hashConteudo);

  let firstToken: string | undefined;
  let secondToken: string | undefined;
  try {
    const firstAnalyze = captureResponse();
    await analyze(fakeRequest({ filename, contentBase64: buffer.toString('base64') }), firstAnalyze as never);
    assert.equal(firstAnalyze.statusCode, 200);
    firstToken = (firstAnalyze.body as { token: string }).token;
    const firstConfirm = captureResponse();
    await confirm(fakeRequest({}, { token: firstToken }), firstConfirm as never);
    assert.equal(firstConfirm.statusCode, 200);
    assert.equal((firstConfirm.body as { importadas: number }).importadas, 1);

    const persisted = (await pool.query<{ hash_arquivo: string; tipo_importacao: string; origem_sistema: string; codigo_poli: string; importacao_id: string; origem_linha: number; sequencia_importacao: number; fingerprint_contexto: string; hash_conteudo: string }>(
      `SELECT i.hash_arquivo,i.tipo_importacao,i.origem_sistema,p.codigo_poli,p.importacao_id,p.origem_linha,p.sequencia_importacao,p.fingerprint_contexto,p.hash_conteudo
         FROM produtos_os p JOIN importacoes_os i ON i.id=p.importacao_id WHERE p.ordem_servico_id=(SELECT id FROM ordens_servico WHERE numero_os=$1)`, [osNumero],
    )).rows[0];
    assert.equal(persisted.hash_arquivo, metadata.hashArquivo);
    assert.equal(persisted.tipo_importacao, 'DIARIA');
    assert.equal(persisted.origem_sistema, 'POLI');
    assert.equal(persisted.codigo_poli, '9001');
    assert.equal(persisted.importacao_id, firstToken);
    assert.equal(persisted.origem_linha, 5);
    assert.equal(persisted.sequencia_importacao, 1);
    assert.equal(persisted.fingerprint_contexto, firstParsed[0]!.itens[0]!.fingerprintContexto);
    assert.equal(persisted.hash_conteudo, firstParsed[0]!.itens[0]!.hashConteudo);

    const before = Number((await pool.query('SELECT count(*)::int n FROM ordens_servico WHERE numero_os=$1', [osNumero])).rows[0]!.n);
    const firstProductCount = Number((await pool.query('SELECT count(*)::int n FROM produtos_os WHERE ordem_servico_id=(SELECT id FROM ordens_servico WHERE numero_os=$1)', [osNumero])).rows[0]!.n);

    const secondAnalyze = captureResponse();
    await analyze(fakeRequest({ filename, contentBase64: buffer.toString('base64') }), secondAnalyze as never);
    assert.equal(secondAnalyze.statusCode, 200);
    secondToken = (secondAnalyze.body as { token: string }).token;
    const secondConfirm = captureResponse();
    await confirm(fakeRequest({}, { token: secondToken }), secondConfirm as never);
    assert.equal(secondConfirm.statusCode, 200);
    const after = Number((await pool.query('SELECT count(*)::int n FROM ordens_servico WHERE numero_os=$1', [osNumero])).rows[0]!.n);
    const secondProductCount = Number((await pool.query('SELECT count(*)::int n FROM produtos_os WHERE ordem_servico_id=(SELECT id FROM ordens_servico WHERE numero_os=$1)', [osNumero])).rows[0]!.n);
    assert.equal(after, before);
    assert.equal(secondProductCount, firstProductCount);
  } finally {
    await pool.query('DELETE FROM ordens_servico WHERE numero_os=$1', [osNumero]);
    if (firstToken) await pool.query('DELETE FROM importacoes_os WHERE id=$1', [firstToken]);
    if (secondToken) await pool.query('DELETE FROM importacoes_os WHERE id=$1', [secondToken]);
  }
});

after(async () => { await pool.end(); });

test('registros manuais continuam aceitando proveniência nula', async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const order = (await client.query<{ id: string }>(
      `INSERT INTO ordens_servico(numero_os,obra_id,frota_id,natureza_os,data_abertura,status)
       SELECT 990001002, o.id, f.id, 'MATERIAL', CURRENT_DATE, 'ABERTA'
       FROM obras o CROSS JOIN frotas f WHERE o.codigo='TEST-OBRA-001' AND f.codigo='PA03'
       RETURNING id`,
    )).rows[0];
    assert.ok(order?.id);
    const product = (await client.query<{ importacao_id: string | null; codigo_poli: string | null }>(
      `INSERT INTO produtos_os(ordem_servico_id,descricao,quantidade,unidade,valor_unitario,valor_total_original)
       VALUES($1,'PRODUTO MANUAL',1,'UN',10,10) RETURNING importacao_id,codigo_poli`, [order.id],
    )).rows[0];
    assert.equal(product.importacao_id, null);
    assert.equal(product.codigo_poli, null);
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
});
