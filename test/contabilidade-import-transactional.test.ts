import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import * as XLSX from 'xlsx';
import { pool } from '../src/config/database.js';
import { analyze, confirm } from '../src/controllers/contabilidade-import.controller.js';
import { analisarContabilidade, confirmarContabilidade, ContabilidadeImportError } from '../src/services/contabilidade-import.service.js';
import { parseContabilidade } from '../src/imports/contabilidade.js';

const expectedDatabase = process.env.CONTABILIDADE_TEST_DATABASE;
if (!expectedDatabase) throw new Error('Defina CONTABILIDADE_TEST_DATABASE para executar somente no banco descartável.');

const requestFor = (buffer: Buffer, name: string) => ({ file: { buffer, originalname: name }, body: {} }) as never;
function responseCapture() { let body: any; let statusCode = 200; return { response: { status(code: number) { statusCode = code; return this; }, json(value: unknown) { body = value; return this; } } as never, get: () => ({ statusCode, body }) }; }
function workbook(subcentro = 'TMP1', values = ['10,00', '20,00']): Buffer { const sheet = XLSX.utils.aoa_to_sheet([['Controle', 'Data Conta', 'Total', 'SubCentro', 'Tipo de Movimentação', 'Plano de Contas'], ['T1', '05/11/2026 00:00', values[0], subcentro, 'Saída', 'CUSTO PECAS / OFICINA'], ['T2', '06/11/2026 00:00', values[1], subcentro, 'Saída', 'CUSTO SERVICOS']]); const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Relatorio'); return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer; }

let fleetId = '';
const countForFile = async (fileName: string) => {
  const result = await pool.query<{ imports: number; items: number; audits: number }>(`SELECT
    (SELECT count(*)::int FROM importacoes_contabeis WHERE arquivo_nome=$1) AS imports,
    (SELECT count(*)::int FROM lancamentos_contabeis WHERE importacao_id IN (SELECT id FROM importacoes_contabeis WHERE arquivo_nome=$1)) AS items,
    (SELECT count(*)::int FROM auditoria WHERE modulo='IMPORTACOES_CONTABEIS' AND entidade='importacoes_contabeis' AND dados_posteriores->>'arquivo_nome'=$1) AS audits`, [fileName]);
  return result.rows[0]!;
};

const assertNoPartialImport = async (fileName: string, fingerprints: string[]) => {
  assert.deepEqual(await countForFile(fileName), { imports: 0, items: 0, audits: 0 });
  assert.equal((await pool.query('SELECT count(*)::int AS total FROM lancamentos_contabeis WHERE fingerprint = ANY($1::char(64)[])', [fingerprints])).rows[0]!.total, 0);
};
before(async () => { const db = (await pool.query<{ current_database: string }>('SELECT current_database()')).rows[0]?.current_database; assert.equal(db, expectedDatabase); await pool.query('DROP TRIGGER IF EXISTS fail_contabil_insert_trigger ON lancamentos_contabeis'); await pool.query('DROP FUNCTION IF EXISTS fail_contabil_insert()'); await pool.query('DELETE FROM lancamentos_contabeis WHERE importacao_id IN (SELECT id FROM importacoes_contabeis WHERE arquivo_nome LIKE \'transacional-%\')'); await pool.query('DELETE FROM importacoes_contabeis WHERE arquivo_nome LIKE \'transacional-%\''); await pool.query('DELETE FROM frotas WHERE prefixo_frota_id IN (SELECT id FROM prefixos_frota WHERE codigo=\'TMP\')'); await pool.query("DELETE FROM prefixos_frota WHERE codigo='TMP'"); fleetId = (await pool.query<{ id: string }>(`INSERT INTO prefixos_frota(codigo,descricao) VALUES('TMP','Temporário') RETURNING id`)).rows[0]!.id; fleetId = (await pool.query<{ id: string }>(`INSERT INTO frotas(prefixo_frota_id,numero,codigo,descricao) VALUES($1,1,'TMP01','Temporária') RETURNING id`, [fleetId])).rows[0]!.id; });

before(async () => { await pool.query(`INSERT INTO frota_identificadores_externos(frota_id,origem,identificador,identificador_normalizado) SELECT id,'CONTABILIDADE','TMP01','TMP01' FROM frotas WHERE codigo='TMP1' ON CONFLICT DO NOTHING`); });

test('A análise pelo controller não grava e a confirmação grava somente após ação explícita', async () => {
  const name = 'transacional-a.xlsx'; const buffer = workbook(); const beforeImports = (await pool.query('SELECT count(*)::int total FROM importacoes_contabeis')).rows[0].total; const beforeItems = (await pool.query('SELECT count(*)::int total FROM lancamentos_contabeis')).rows[0].total;
  const captured = responseCapture(); await analyze(requestFor(buffer, name), captured.response); const preview = captured.get(); assert.equal(preview.statusCode, 200, JSON.stringify(preview.body)); assert.equal(preview.body.somente_leitura, true); assert.equal((await pool.query('SELECT count(*)::int total FROM importacoes_contabeis')).rows[0].total, beforeImports); assert.equal((await pool.query('SELECT count(*)::int total FROM lancamentos_contabeis')).rows[0].total, beforeItems);
  const confirmed = responseCapture(); await confirm({ params: { id: preview.body.token }, authUser: undefined } as never, confirmed.response); assert.equal(confirmed.get().statusCode, 201, JSON.stringify(confirmed.get().body)); assert.equal(confirmed.get().body.total, 2); const persisted = (await pool.query<{ valor_total: string; classificacao: string; frota_id: string | null }>('SELECT valor_total::text, classificacao, frota_id FROM lancamentos_contabeis WHERE importacao_id=$1 ORDER BY linha_original', [confirmed.get().body.id])).rows; assert.deepEqual(persisted.map(row => row.valor_total), ['10.00', '20.00']); assert.deepEqual(persisted.map(row => row.classificacao), ['PECAS_EXTERNAS', 'SERVICOS_TERCEIRIZADOS']); assert.ok(persisted.every(row => row.frota_id)); assert.equal((await pool.query('SELECT coalesce(sum(valor_total),0)::text total FROM lancamentos_contabeis WHERE importacao_id=$1', [confirmed.get().body.id])).rows[0].total, '30.00'); assert.equal((await pool.query('SELECT count(*)::int total FROM lancamentos_contabeis')).rows[0].total, beforeItems + 2);
});

test('confirmação repetida e concorrente são idempotentes', async () => {
  const source = workbook('TMP01', ['30,00', '40,00']); const preview = await analisarContabilidade(source, 'transacional-b.xlsx'); const results = await Promise.all([confirmarContabilidade(preview.token), confirmarContabilidade(preview.token)]); assert.ok(results.every(result => result.total === 2)); assert.equal(results[0]!.reimportada, false); const count = (await pool.query('SELECT count(*)::int total FROM lancamentos_contabeis WHERE importacao_id=$1', [results[0]!.id])).rows[0].total; assert.equal(count, 2); const repeated = await confirmarContabilidade(preview.token); assert.equal(repeated.reimportada, false); const resendPreview = await analisarContabilidade(source, 'transacional-b-reenvio.xlsx'); assert.equal(resendPreview.arquivo_ja_importado, true); assert.equal(resendPreview.confirmacao_bloqueada, true); await assert.rejects(() => confirmarContabilidade(resendPreview.token), (error: unknown) => error instanceof ContabilidadeImportError && error.statusCode === 409); assert.equal((await pool.query('SELECT count(*)::int total FROM lancamentos_contabeis WHERE fingerprint IN (SELECT fingerprint FROM lancamentos_contabeis WHERE importacao_id=$1)', [results[0]!.id])).rows[0].total, 2);
});

test('falha após o cabeçalho reverte a transação inteira', async () => {
  const fileName = 'transacional-rollback-header.xlsx'; const source = workbook('TMP01', ['50,00', '60,00']); const preview = await analisarContabilidade(source, fileName);
  await pool.query('DROP TRIGGER IF EXISTS fail_contabil_header_trigger ON importacoes_contabeis'); await pool.query('DROP FUNCTION IF EXISTS fail_contabil_header()'); await pool.query(`CREATE FUNCTION fail_contabil_header() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'falha controlada no cabeçalho'; END$$`); await pool.query('CREATE TRIGGER fail_contabil_header_trigger BEFORE INSERT ON importacoes_contabeis FOR EACH ROW EXECUTE FUNCTION fail_contabil_header()');
  await assert.rejects(() => confirmarContabilidade(preview.token)); await pool.query('DROP TRIGGER fail_contabil_header_trigger ON importacoes_contabeis'); await pool.query('DROP FUNCTION fail_contabil_header()'); await assertNoPartialImport(fileName, parseContabilidade(source).map(row => row.fingerprint));
});

test('falha durante os lançamentos reverte cabeçalho e itens', async () => {
  const fileName = 'transacional-rollback-items.xlsx'; const source = workbook('TMP01', ['70,00', '80,00']); const preview = await analisarContabilidade(source, fileName);
  await pool.query('DROP TRIGGER IF EXISTS fail_contabil_item_trigger ON lancamentos_contabeis'); await pool.query('DROP FUNCTION IF EXISTS fail_contabil_item()'); await pool.query(`CREATE FUNCTION fail_contabil_item() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'falha controlada no lançamento'; END$$`); await pool.query('CREATE TRIGGER fail_contabil_item_trigger BEFORE INSERT ON lancamentos_contabeis FOR EACH ROW EXECUTE FUNCTION fail_contabil_item()');
  await assert.rejects(() => confirmarContabilidade(preview.token)); await pool.query('DROP TRIGGER fail_contabil_item_trigger ON lancamentos_contabeis'); await pool.query('DROP FUNCTION fail_contabil_item()'); await assertNoPartialImport(fileName, parseContabilidade(source).map(row => row.fingerprint));
});

test('falha na auditoria reverte dados e permite nova tentativa válida', async () => {
  const fileName = 'transacional-rollback-audit.xlsx'; const source = workbook('TMP01', ['90,00', '100,00']); const preview = await analisarContabilidade(source, fileName);
  await pool.query('DROP TRIGGER IF EXISTS fail_contabil_audit_trigger ON auditoria'); await pool.query('DROP FUNCTION IF EXISTS fail_contabil_audit()'); await pool.query(`CREATE FUNCTION fail_contabil_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'falha controlada na auditoria'; END$$`); await pool.query("CREATE TRIGGER fail_contabil_audit_trigger BEFORE INSERT ON auditoria FOR EACH ROW WHEN (NEW.modulo='IMPORTACOES_CONTABEIS') EXECUTE FUNCTION fail_contabil_audit()");
  await assert.rejects(() => confirmarContabilidade(preview.token)); await pool.query('DROP TRIGGER fail_contabil_audit_trigger ON auditoria'); await pool.query('DROP FUNCTION fail_contabil_audit()'); await assertNoPartialImport(fileName, parseContabilidade(source).map(row => row.fingerprint));
  const retry = await confirmarContabilidade(preview.token); assert.equal(retry.total, 2); assert.equal((await pool.query('SELECT count(*)::int total FROM lancamentos_contabeis WHERE importacao_id=$1', [retry.id])).rows[0]!.total, 2);
});

test('despesas compartilhadas pendentes persistem sem elegibilidade financeira', async () => {
  const fileName = 'transacional-shared-pendente.xlsx'; const source = workbook('FROTAS DIVERSAS', ['110,00', '120,00']); const preview = await analisarContabilidade(source, fileName);
  assert.equal(preview.confirmacao_bloqueada, false); assert.equal(preview.compartilhadas_aguardando, 2); assert.equal(preview.total_elegivel, '0.00');
  const result = await confirmarContabilidade(preview.token); const rows = (await pool.query<{ despesa_compartilhada_status: string; valor_total: string }>('SELECT despesa_compartilhada_status,valor_total::text FROM lancamentos_contabeis WHERE importacao_id=$1 ORDER BY linha_original', [result.id])).rows;
  assert.equal(rows.length, 2); assert.ok(rows.every(row => row.despesa_compartilhada_status === 'AGUARDANDO_DECISAO')); assert.deepEqual(rows.map(row => row.valor_total), ['110.00', '120.00']);
});

test('token inválido não confirma', async () => { const captured = responseCapture(); await confirm({ params: { id: 'x' }, authUser: undefined } as never, captured.response); assert.equal(captured.get().statusCode, 400); });

after(async () => { await pool.query('DROP TRIGGER IF EXISTS fail_contabil_header_trigger ON importacoes_contabeis'); await pool.query('DROP TRIGGER IF EXISTS fail_contabil_item_trigger ON lancamentos_contabeis'); await pool.query('DROP TRIGGER IF EXISTS fail_contabil_audit_trigger ON auditoria'); await pool.query('DROP FUNCTION IF EXISTS fail_contabil_header()'); await pool.query('DROP FUNCTION IF EXISTS fail_contabil_item()'); await pool.query('DROP FUNCTION IF EXISTS fail_contabil_audit()'); await pool.query('DELETE FROM auditoria WHERE modulo=\'IMPORTACOES_CONTABEIS\' AND entidade=\'importacoes_contabeis\' AND entidade_id IN (SELECT id::text FROM importacoes_contabeis WHERE arquivo_nome LIKE \'transacional-%\')'); await pool.query('DELETE FROM lancamentos_contabeis WHERE importacao_id IN (SELECT id FROM importacoes_contabeis WHERE arquivo_nome LIKE \'transacional-%\')'); await pool.query('DELETE FROM importacoes_contabeis WHERE arquivo_nome LIKE \'transacional-%\''); await pool.query('DELETE FROM frotas WHERE id=$1', [fleetId]); await pool.query("DELETE FROM prefixos_frota WHERE codigo='TMP'"); await pool.end(); });
