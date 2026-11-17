import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import * as XLSX from 'xlsx';
import { pool } from '../src/config/database.js';
import { analyze, confirm } from '../src/controllers/contabilidade-import.controller.js';
import { analisarContabilidade, confirmarContabilidade, ContabilidadeImportError, revisarDuplicidadeContabil, decidirDespesaCompartilhada } from '../src/services/contabilidade-import.service.js';
import type { AuthenticatedRequestUser } from '../src/types/auth.js';
import { parseContabilidade } from '../src/imports/contabilidade.js';

const expectedDatabase = process.env.CONTABILIDADE_TEST_DATABASE;
if (!expectedDatabase) throw new Error('Defina CONTABILIDADE_TEST_DATABASE para executar somente no banco descartável.');

const requestFor = (buffer: Buffer, name: string) => ({ file: { buffer, originalname: name }, body: { periodo_inicio: '2026-11-01', periodo_fim: '2026-11-30' } }) as never;
function responseCapture() { let body: any; let statusCode = 200; return { response: { status(code: number) { statusCode = code; return this; }, json(value: unknown) { body = value; return this; } } as never, get: () => ({ statusCode, body }) }; }
function workbook(subcentro = 'TMP01', values = ['10,00', '20,00'], dates = ['05/11/2026 00:00', '06/11/2026 00:00']): Buffer { const sheet = XLSX.utils.aoa_to_sheet([['Controle', 'Data Conta', 'Total', 'SubCentro', 'Tipo de Movimentacao', 'Plano de Contas'], ['T1', dates[0], values[0], subcentro, 'Saida', 'CUSTO PECAS / OFICINA'], ['T2', dates[1], values[1], subcentro, 'Saida', 'CUSTO SERVICOS']]); const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Relatorio'); return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer; }
function reorderedWorkbook(): Buffer { const sheet = XLSX.utils.aoa_to_sheet([['Controle', 'Data Conta', 'Total', 'SubCentro', 'Tipo de Movimentacao', 'Plano de Contas'], ['T2', '06/11/2026 00:00', '20,00', 'TMP01', 'Saida', 'CUSTO SERVICOS'], ['T1', '05/11/2026 00:00', '10,00', 'TMP01', 'Saida', 'CUSTO PECAS / OFICINA']]); const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Relatorio'); return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer; }
function duplicateWorkbook(date = '05/05/2027'): Buffer { const sheet = XLSX.utils.aoa_to_sheet([['Data Conta', 'Nro Nota', 'Cod Produto', 'Produto', 'Quantidade', 'Valor Unitario', 'Total', 'SubCentro', 'Plano de Contas', 'Tipo Movimentacao'], [date, 'D1', 'P1', 'PALHETA LIMPADOR PARABRISA PVC2662 - AXOR', '1', '140,00', '140,00', 'FROTAS DIVERSAS', 'CUSTO PECAS / OFICINA', 'Saida'], [date, 'D1', 'P1', 'PALHETA LIMPADOR PARABRISA PVC2662 - AXOR', '1', '140,00', '140,00', 'FROTAS DIVERSAS', 'CUSTO PECAS / OFICINA', 'Saida']]); const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Relatorio'); return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer; }
function duplicateWithInvalidValueWorkbook(): Buffer { const sheet = XLSX.utils.aoa_to_sheet([['Data Conta', 'Nro Nota', 'Cod Produto', 'Produto', 'Quantidade', 'Valor Unitario', 'Total', 'SubCentro', 'Plano de Contas', 'Tipo Movimentacao'], ['05/06/2027', 'D2', 'P2', 'PALHETA REPETIDA', '1', '140,00', 'valor ruim', 'FROTAS DIVERSAS', 'CUSTO PECAS / OFICINA', 'Saida'], ['05/06/2027', 'D2', 'P2', 'PALHETA REPETIDA', '1', '140,00', 'valor ruim', 'FROTAS DIVERSAS', 'CUSTO PECAS / OFICINA', 'Saida']]); const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Relatorio'); return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer; }

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
before(async () => { const db = (await pool.query<{ current_database: string }>('SELECT current_database()')).rows[0]?.current_database; assert.equal(db, expectedDatabase); await pool.query('DROP TRIGGER IF EXISTS fail_contabil_insert_trigger ON lancamentos_contabeis'); await pool.query('DROP FUNCTION IF EXISTS fail_contabil_insert()'); await pool.query('DELETE FROM lancamentos_contabeis WHERE importacao_id IN (SELECT id FROM importacoes_contabeis WHERE arquivo_nome LIKE \'transacional-%\')'); await pool.query('DELETE FROM importacoes_contabeis WHERE arquivo_nome LIKE \'transacional-%\''); await pool.query('DELETE FROM frotas WHERE prefixo_frota_id IN (SELECT id FROM prefixos_frota WHERE codigo=\'TMP\')'); await pool.query("DELETE FROM prefixos_frota WHERE codigo='TMP'"); fleetId = (await pool.query<{ id: string }>(`INSERT INTO prefixos_frota(codigo,descricao) VALUES('TMP','Temporário') RETURNING id`)).rows[0]!.id; fleetId = (await pool.query<{ id: string }>(`INSERT INTO frotas(prefixo_frota_id,numero,codigo,descricao) VALUES($1,'01','TMP01','Temporária') RETURNING id`, [fleetId])).rows[0]!.id; });

before(async () => { await pool.query(`INSERT INTO frota_identificadores_externos(frota_id,origem,identificador,identificador_normalizado) SELECT id,'CONTABILIDADE','TMP01','TMP01' FROM frotas WHERE codigo='TMP01' ON CONFLICT DO NOTHING`); });

test('A análise pelo controller não grava e a confirmação grava somente após ação explícita', async () => {
  const name = 'transacional-a.xlsx'; const buffer = workbook(); const beforeImports = (await pool.query('SELECT count(*)::int total FROM importacoes_contabeis')).rows[0].total; const beforeItems = (await pool.query('SELECT count(*)::int total FROM lancamentos_contabeis')).rows[0].total;
  const captured = responseCapture(); await analyze(requestFor(buffer, name), captured.response); const preview = captured.get(); assert.equal(preview.statusCode, 200, JSON.stringify(preview.body)); assert.equal(preview.body.somente_leitura, true); assert.equal((await pool.query('SELECT count(*)::int total FROM importacoes_contabeis')).rows[0].total, beforeImports); assert.equal((await pool.query('SELECT count(*)::int total FROM lancamentos_contabeis')).rows[0].total, beforeItems);
  const confirmed = responseCapture(); await confirm({ params: { id: preview.body.token }, authUser: undefined } as never, confirmed.response); assert.equal(confirmed.get().statusCode, 201, JSON.stringify(confirmed.get().body)); assert.equal(confirmed.get().body.total, 2); const persisted = (await pool.query<{ valor_total: string; classificacao: string; frota_id: string | null }>('SELECT valor_total::text, classificacao, frota_id FROM lancamentos_contabeis WHERE importacao_id=$1 ORDER BY linha_original', [confirmed.get().body.id])).rows; assert.deepEqual(persisted.map(row => row.valor_total), ['10.00', '20.00']); assert.deepEqual(persisted.map(row => row.classificacao), ['PECAS_EXTERNAS', 'SERVICOS_TERCEIRIZADOS']); assert.ok(persisted.every(row => row.frota_id)); assert.equal((await pool.query('SELECT coalesce(sum(valor_total),0)::text total FROM lancamentos_contabeis WHERE importacao_id=$1', [confirmed.get().body.id])).rows[0].total, '30.00'); assert.equal((await pool.query('SELECT count(*)::int total FROM lancamentos_contabeis')).rows[0].total, beforeItems + 2);
});

test('confirmação repetida e concorrente são idempotentes', async () => {
  const source = workbook('TMP01', ['30,00', '40,00'], ['01/12/2026', '02/12/2026']); const preview = await analisarContabilidade(source, 'transacional-b.xlsx', { inicio: '2026-12-01', fim: '2026-12-31' }); const results = await Promise.all([confirmarContabilidade(preview.token), confirmarContabilidade(preview.token)]); assert.ok(results.every(result => result.total === 2)); assert.equal(results[0]!.reimportada, false); const count = (await pool.query('SELECT count(*)::int total FROM lancamentos_contabeis WHERE importacao_id=$1', [results[0]!.id])).rows[0].total; assert.equal(count, 2); const repeated = await confirmarContabilidade(preview.token); assert.equal(repeated.reimportada, false); const resendPreview = await analisarContabilidade(source, 'transacional-b-reenvio.xlsx', { inicio: '2026-12-01', fim: '2026-12-31' }); assert.equal(resendPreview.arquivo_ja_importado, true); assert.equal(resendPreview.confirmacao_bloqueada, true); await assert.rejects(() => confirmarContabilidade(resendPreview.token), (error: unknown) => error instanceof ContabilidadeImportError && error.statusCode === 409); assert.equal((await pool.query('SELECT count(*)::int total FROM lancamentos_contabeis WHERE fingerprint IN (SELECT fingerprint FROM lancamentos_contabeis WHERE importacao_id=$1)', [results[0]!.id])).rows[0].total, 2);
});

test('falha após o cabeçalho reverte a transação inteira', async () => {
  const fileName = 'transacional-rollback-header.xlsx'; const source = workbook('TMP01', ['50,00', '60,00'], ['01/01/2027', '02/01/2027']); const preview = await analisarContabilidade(source, fileName, { inicio: '2027-01-01', fim: '2027-01-31' });
  await pool.query('DROP TRIGGER IF EXISTS fail_contabil_header_trigger ON importacoes_contabeis'); await pool.query('DROP FUNCTION IF EXISTS fail_contabil_header()'); await pool.query(`CREATE FUNCTION fail_contabil_header() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'falha controlada no cabeçalho'; END$$`); await pool.query('CREATE TRIGGER fail_contabil_header_trigger BEFORE INSERT ON importacoes_contabeis FOR EACH ROW EXECUTE FUNCTION fail_contabil_header()');
  await assert.rejects(() => confirmarContabilidade(preview.token)); await pool.query('DROP TRIGGER fail_contabil_header_trigger ON importacoes_contabeis'); await pool.query('DROP FUNCTION fail_contabil_header()'); await assertNoPartialImport(fileName, parseContabilidade(source).map(row => row.fingerprint));
});

test('falha durante os lançamentos reverte cabeçalho e itens', async () => {
  const fileName = 'transacional-rollback-items.xlsx'; const source = workbook('TMP01', ['70,00', '80,00'], ['01/02/2027', '02/02/2027']); const preview = await analisarContabilidade(source, fileName, { inicio: '2027-02-01', fim: '2027-02-28' });
  await pool.query('DROP TRIGGER IF EXISTS fail_contabil_item_trigger ON lancamentos_contabeis'); await pool.query('DROP FUNCTION IF EXISTS fail_contabil_item()'); await pool.query(`CREATE FUNCTION fail_contabil_item() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'falha controlada no lançamento'; END$$`); await pool.query('CREATE TRIGGER fail_contabil_item_trigger BEFORE INSERT ON lancamentos_contabeis FOR EACH ROW EXECUTE FUNCTION fail_contabil_item()');
  await assert.rejects(() => confirmarContabilidade(preview.token)); await pool.query('DROP TRIGGER fail_contabil_item_trigger ON lancamentos_contabeis'); await pool.query('DROP FUNCTION fail_contabil_item()'); await assertNoPartialImport(fileName, parseContabilidade(source).map(row => row.fingerprint));
});

test('falha na auditoria reverte dados e permite nova tentativa válida', async () => {
  const fileName = 'transacional-rollback-audit.xlsx'; const source = workbook('TMP01', ['90,00', '100,00'], ['01/03/2027', '02/03/2027']); const preview = await analisarContabilidade(source, fileName, { inicio: '2027-03-01', fim: '2027-03-31' });
  await pool.query('DROP TRIGGER IF EXISTS fail_contabil_audit_trigger ON auditoria'); await pool.query('DROP FUNCTION IF EXISTS fail_contabil_audit()'); await pool.query(`CREATE FUNCTION fail_contabil_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'falha controlada na auditoria'; END$$`); await pool.query("CREATE TRIGGER fail_contabil_audit_trigger BEFORE INSERT ON auditoria FOR EACH ROW WHEN (NEW.modulo='IMPORTACOES_CONTABEIS') EXECUTE FUNCTION fail_contabil_audit()");
  await assert.rejects(() => confirmarContabilidade(preview.token)); await pool.query('DROP TRIGGER fail_contabil_audit_trigger ON auditoria'); await pool.query('DROP FUNCTION fail_contabil_audit()'); await assertNoPartialImport(fileName, parseContabilidade(source).map(row => row.fingerprint));
  const retry = await confirmarContabilidade(preview.token); assert.equal(retry.total, 2); assert.equal((await pool.query('SELECT count(*)::int total FROM lancamentos_contabeis WHERE importacao_id=$1', [retry.id])).rows[0]!.total, 2);
});

test('despesas compartilhadas pendentes persistem sem elegibilidade financeira', async () => {
  const fileName = 'transacional-shared-pendente.xlsx'; const source = workbook('FROTAS DIVERSAS', ['110,00', '120,00'], ['01/04/2027', '02/04/2027']); const preview = await analisarContabilidade(source, fileName, { inicio: '2027-04-01', fim: '2027-04-30' });
  assert.equal(preview.confirmacao_bloqueada, false); assert.equal(preview.compartilhadas_aguardando, 2); assert.equal(preview.total_elegivel, '0.00');
  const result = await confirmarContabilidade(preview.token); const rows = (await pool.query<{ despesa_compartilhada_status: string; valor_total: string }>('SELECT despesa_compartilhada_status,valor_total::text FROM lancamentos_contabeis WHERE importacao_id=$1 ORDER BY linha_original', [result.id])).rows;
  assert.equal(rows.length, 2); assert.ok(rows.every(row => row.despesa_compartilhada_status === 'AGUARDANDO_DECISAO')); assert.deepEqual(rows.map(row => row.valor_total), ['110.00', '120.00']);
});

test('historico sem periodo continua NULL e bloqueia nova confirmacao ate reconciliacao', async () => {
  const legacyName = 'transacional-legacy-unknown-period.xlsx';
  const newName = 'transacional-blocked-by-legacy.xlsx';
  const legacy = (await pool.query<{ id: string }>("INSERT INTO importacoes_contabeis(arquivo_nome,hash_arquivo,tamanho_bytes) VALUES($1,$2,0) RETURNING id", [legacyName, 'f'.repeat(64)])).rows[0]!;
  try {
    const source = workbook('TMP01', ['25,00', '26,00'], ['01/07/2027', '02/07/2027']);
    const preview = await analisarContabilidade(source, newName, { inicio: '2027-07-01', fim: '2027-07-31' });
    assert.equal(preview.historico_sem_periodo, 1);
    assert.equal(preview.confirmacao_bloqueada, true);
    await assert.rejects(() => confirmarContabilidade(preview.token), (error: unknown) => error instanceof ContabilidadeImportError && error.code === 'LEGACY_PERIODS_UNRECONCILED');
    assert.deepEqual(await countForFile(newName), { imports: 0, items: 0, audits: 0 });
    const preserved = await pool.query('SELECT periodo_inicio,periodo_fim FROM importacoes_contabeis WHERE id=$1', [legacy.id]);
    assert.deepEqual(preserved.rows[0], { periodo_inicio: null, periodo_fim: null });
  } finally {
    await pool.query('DELETE FROM importacoes_contabeis WHERE id=$1', [legacy.id]);
  }
});

test('relat?rio reordenado sem fingerprints iguais continua bloqueado pelo per?odo', async () => {
  const source = reorderedWorkbook();
  const preview = await analisarContabilidade(source, 'transacional-reordered.xlsx', { inicio: '2026-11-01', fim: '2026-11-30' });
  assert.equal(preview.itens.some(item => item.duplicado_em_importacao_anterior), false);
  assert.equal(preview.periodo_sobreposto, true);
  assert.equal(preview.confirmacao_bloqueada, true);
});

test('Data Conta fora do intervalo declarado bloqueia sem persistir', async () => {
  const source = workbook('TMP01', ['15,00', '16,00'], ['05/11/2026', '06/11/2026']);
  const preview = await analisarContabilidade(source, 'transacional-date-outside.xlsx', { inicio: '2026-11-05', fim: '2026-11-05' });
  assert.equal(preview.fora_periodo, 1);
  assert.equal(preview.confirmacao_bloqueada, true);
  await assert.rejects(() => confirmarContabilidade(preview.token), (error: unknown) => error instanceof ContabilidadeImportError && error.code === 'INVALID_ACCOUNTING_PERIOD');
  assert.equal((await countForFile('transacional-date-outside.xlsx')).imports, 0);
});

test('Data Conta anterior ao inicio do intervalo declarado bloqueia sem persistir', async () => {
  const source = workbook('TMP01', ['17,00', '18,00'], ['04/11/2026', '05/11/2026']);
  const preview = await analisarContabilidade(source, 'transacional-date-before.xlsx', { inicio: '2026-11-05', fim: '2026-11-05' });
  assert.equal(preview.fora_periodo, 1);
  assert.equal(preview.confirmacao_bloqueada, true);
  await assert.rejects(() => confirmarContabilidade(preview.token), (error: unknown) => error instanceof ContabilidadeImportError && error.code === 'INVALID_ACCOUNTING_PERIOD');
  assert.equal((await countForFile('transacional-date-before.xlsx')).imports, 0);
});

test('per?odo sobreposto bloqueia arquivo diferente antes de qualquer persist?ncia', async () => {
  const source = workbook('TMP01', ['33,00', '44,00']);
  const preview = await analisarContabilidade(source, 'transacional-overlap.xlsx', { inicio: '2026-11-01', fim: '2026-11-30' });
  assert.equal(preview.periodo_sobreposto, true);
  assert.equal(preview.confirmacao_bloqueada, true);
  await assert.rejects(() => confirmarContabilidade(preview.token), (error: unknown) => error instanceof ContabilidadeImportError && error.code === 'ACCOUNTING_PERIOD_OVERLAP');
  assert.equal((await countForFile('transacional-overlap.xlsx')).imports, 0);
});

test('intervalo parcialmente sobreposto tambem bloqueia antes de persistir', async () => {
  const source = workbook('TMP01', ['45,00', '46,00'], ['15/12/2026', '02/01/2027']);
  const preview = await analisarContabilidade(source, 'transacional-overlap-partial.xlsx', { inicio: '2026-12-15', fim: '2027-01-15' });
  assert.equal(preview.periodo_sobreposto, true);
  assert.equal(preview.confirmacao_bloqueada, true);
  await assert.rejects(() => confirmarContabilidade(preview.token), (error: unknown) => error instanceof ContabilidadeImportError && error.code === 'ACCOUNTING_PERIOD_OVERLAP');
  assert.equal((await countForFile('transacional-overlap-partial.xlsx')).imports, 0);
});

test('importa??es concorrentes com per?odos sobrepostos confirmam apenas um relat?rio', async () => {
  const first = await analisarContabilidade(workbook('TMP01', ['81,00', '82,00'], ['01/05/2028', '02/05/2028']), 'transacional-race-a.xlsx', { inicio: '2028-05-01', fim: '2028-05-31' });
  const second = await analisarContabilidade(workbook('TMP01', ['91,00', '92,00'], ['01/05/2028', '02/05/2028']), 'transacional-race-b.xlsx', { inicio: '2028-05-01', fim: '2028-05-31' });
  const outcomes = await Promise.allSettled([confirmarContabilidade(first.token), confirmarContabilidade(second.token)]);
  assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
  const rejected = outcomes.find(outcome => outcome.status === 'rejected');
  assert.ok(rejected && rejected.status === 'rejected' && rejected.reason instanceof ContabilidadeImportError && rejected.reason.code === 'ACCOUNTING_PERIOD_OVERLAP');
  assert.equal((await pool.query("SELECT count(*)::int count FROM importacoes_contabeis WHERE arquivo_nome IN ('transacional-race-a.xlsx','transacional-race-b.xlsx')")).rows[0]?.count, 1);
});

test('duplicidade leg?tima exige revis?o ADMIN auditada e decis?o manual separada', async () => {
  const source = duplicateWorkbook();
  const fileName = 'transacional-duplicate-review.xlsx';
  const preview = await analisarContabilidade(source, fileName, { inicio: '2027-05-01', fim: '2027-05-31' });
  assert.equal(preview.confirmacao_bloqueada, true);
  assert.deepEqual(preview.itens.find(item => item.linha_original === 3)?.linhas_duplicadas, [2, 3]);
  const result = await pool.query<{ id: string; username: string; email: string; role: 'ADMIN'; status: 'ATIVO'; must_change_password: boolean }>("SELECT id,username,email,role,status,must_change_password FROM usuarios WHERE role='ADMIN' AND status='ATIVO' LIMIT 1");
  assert.ok(result.rows[0], 'O banco descart?vel precisa de um ADMIN de teste.');
  const admin = { ...result.rows[0], sessionId: 'test-session', tokenHash: 'test-token' } as AuthenticatedRequestUser;
  const operator = { ...admin, role: 'OPERADOR' } as AuthenticatedRequestUser;
  await assert.rejects(() => revisarDuplicidadeContabil(preview.token, 3, 'APROVAR', null, operator), (error: unknown) => error instanceof ContabilidadeImportError && error.statusCode === 403);
  await assert.rejects(() => revisarDuplicidadeContabil(preview.token, 3, 'AGUARDAR', null, admin), (error: unknown) => error instanceof ContabilidadeImportError && error.statusCode === 400);
  const reviewed = await revisarDuplicidadeContabil(preview.token, 3, 'APROVAR', null, admin);
  assert.equal(reviewed.itens.find(item => item.linha_original === 3)?.duplicidade_revisada, true);
  assert.equal(reviewed.itens.find(item => item.linha_original === 3)?.despesa_compartilhada_status, 'APROVADA');
  assert.equal(reviewed.total_elegivel, '140.00');
  assert.equal(reviewed.confirmacao_bloqueada, true, 'the other matching occurrence still needs its own ADMIN decision');
  await assert.rejects(() => revisarDuplicidadeContabil(preview.token, 3, 'APROVAR', null, admin), (error: unknown) => error instanceof ContabilidadeImportError && error.code === 'DUPLICATE_REVIEW_ALREADY_DECIDED');
  const reviewedPair = await revisarDuplicidadeContabil(preview.token, 2, 'APROVAR', null, admin);
  assert.equal(reviewedPair.confirmacao_bloqueada, false);
  assert.equal(reviewedPair.total_elegivel, '280.00');
  const auditPair = await pool.query<{ dados_posteriores: Record<string, unknown> }>("SELECT dados_posteriores FROM auditoria WHERE entidade='revisao_duplicidade_previa' AND entidade_id=ANY($1::text[])", [[preview.token + ':2', preview.token + ':3']]);
  assert.equal(auditPair.rows.length, 2);
  assert.deepEqual(auditPair.rows.map(row => row.dados_posteriores.linha_original).sort(), [2, 3]);
  assert.ok(auditPair.rows.every(row => row.dados_posteriores.arquivo_nome === fileName && row.dados_posteriores.hash_arquivo === preview.hash_arquivo && row.dados_posteriores.decisao === 'APROVAR'));
  const audit = await pool.query<{ username: string; role: string; created_at: Date; dados_posteriores: Record<string, unknown> }>("SELECT username,role,created_at,dados_posteriores FROM auditoria WHERE entidade='revisao_duplicidade_previa' AND entidade_id=$1", [preview.token + ':3']);
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0]?.username, admin.username);
  assert.equal(audit.rows[0]?.role, 'ADMIN');
  assert.ok(audit.rows[0]?.created_at instanceof Date);
  assert.equal(audit.rows[0]?.dados_posteriores.decisao, 'APROVAR');
  assert.equal(audit.rows[0]?.dados_posteriores.arquivo_nome, fileName);
  assert.equal(audit.rows[0]?.dados_posteriores.hash_arquivo, preview.hash_arquivo);
  assert.equal(audit.rows[0]?.dados_posteriores.linha_original, 3);
  assert.deepEqual(audit.rows[0]?.dados_posteriores.linhas_envolvidas, [2, 3]);
  await assert.rejects(() => decidirDespesaCompartilhada(preview.token, 3, 'DESCONSIDERAR', null, admin), (error: unknown) => error instanceof ContabilidadeImportError && error.code === 'MANUAL_DECISION_ALREADY_SET');
  const imported = await confirmarContabilidade(preview.token, admin);
  const persisted = await pool.query<{ count: number; total: string }>('SELECT count(*)::int count,coalesce(sum(valor_total),0)::numeric(18,2)::text total FROM lancamentos_contabeis WHERE importacao_id=$1', [imported.id]);
  assert.deepEqual(persisted.rows[0], { count: 2, total: '280.00' });
});

test('revisao ADMIN permite desconsiderar somente a ocorrencia selecionada e audita a decisao', async () => {
  const fileName = 'transacional-duplicate-disregard.xlsx';
  const preview = await analisarContabilidade(duplicateWorkbook('05/07/2027'), fileName, { inicio: '2027-07-01', fim: '2027-07-31' });
  const adminResult = await pool.query<{ id: string; username: string; email: string; role: 'ADMIN'; status: 'ATIVO'; must_change_password: boolean }>("SELECT id,username,email,role,status,must_change_password FROM usuarios WHERE role='ADMIN' AND status='ATIVO' LIMIT 1");
  assert.ok(adminResult.rows[0]);
  const admin = { ...adminResult.rows[0], sessionId: 'test-session', tokenHash: 'test-token' } as AuthenticatedRequestUser;
  const reviewed = await revisarDuplicidadeContabil(preview.token, 3, 'DESCONSIDERAR', null, admin);
  assert.equal(reviewed.itens.find(item => item.linha_original === 3)?.despesa_compartilhada_status, 'DESCONSIDERADA');
  assert.equal(reviewed.itens.find(item => item.linha_original === 2)?.despesa_compartilhada_status, 'AGUARDANDO_DECISAO');
  assert.equal(reviewed.total_elegivel, '0.00');
  const audit = await pool.query<{ dados_posteriores: Record<string, unknown> }>("SELECT dados_posteriores FROM auditoria WHERE entidade='revisao_duplicidade_previa' AND entidade_id=$1", [preview.token + ':3']);
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0]?.dados_posteriores.decisao, 'DESCONSIDERAR');
  assert.equal(audit.rows[0]?.dados_posteriores.arquivo_nome, fileName);
  assert.equal(audit.rows[0]?.dados_posteriores.linha_original, 3);
});

test('revisao ADMIN nao remove bloqueio de valor invalido', async () => {
  const preview = await analisarContabilidade(duplicateWithInvalidValueWorkbook(), 'transacional-duplicate-invalid.xlsx', { inicio: '2027-06-01', fim: '2027-06-30' });
  const adminResult = await pool.query<{ id: string; username: string; email: string; role: 'ADMIN'; status: 'ATIVO'; must_change_password: boolean }>("SELECT id,username,email,role,status,must_change_password FROM usuarios WHERE role='ADMIN' AND status='ATIVO' LIMIT 1");
  assert.ok(adminResult.rows[0]);
  const admin = { ...adminResult.rows[0], sessionId: 'test-session', tokenHash: 'test-token' } as AuthenticatedRequestUser;
  await assert.rejects(() => revisarDuplicidadeContabil(preview.token, 3, 'APROVAR', null, admin), (error: unknown) => error instanceof ContabilidadeImportError && error.statusCode === 409 && error.code === 'INVALID_TOTAL_VALUE');
  assert.equal(preview.itens.find(item => item.linha_original === 3)?.duplicidade_revisada, false);
  assert.equal((await pool.query("SELECT count(*)::int count FROM auditoria WHERE entidade='revisao_duplicidade_previa' AND entidade_id=$1", [preview.token + ':3'])).rows[0]?.count, 0);
});

test('token inválido não confirma', async () => { const captured = responseCapture(); await confirm({ params: { id: 'x' }, authUser: undefined } as never, captured.response); assert.equal(captured.get().statusCode, 400); });

after(async () => { await pool.query('DROP TRIGGER IF EXISTS fail_contabil_header_trigger ON importacoes_contabeis'); await pool.query('DROP TRIGGER IF EXISTS fail_contabil_item_trigger ON lancamentos_contabeis'); await pool.query('DROP TRIGGER IF EXISTS fail_contabil_audit_trigger ON auditoria'); await pool.query('DROP FUNCTION IF EXISTS fail_contabil_header()'); await pool.query('DROP FUNCTION IF EXISTS fail_contabil_item()'); await pool.query('DROP FUNCTION IF EXISTS fail_contabil_audit()'); await pool.query("DELETE FROM auditoria WHERE modulo='IMPORTACOES_CONTABEIS' AND (entidade_id LIKE 'transacional-%' OR dados_posteriores->>'arquivo_nome' LIKE 'transacional-%')"); await pool.query('DELETE FROM lancamentos_contabeis WHERE importacao_id IN (SELECT id FROM importacoes_contabeis WHERE arquivo_nome LIKE \'transacional-%\')'); await pool.query('DELETE FROM importacoes_contabeis WHERE arquivo_nome LIKE \'transacional-%\''); await pool.query('DELETE FROM frotas WHERE id=$1', [fleetId]); await pool.query("DELETE FROM prefixos_frota WHERE codigo='TMP'"); await pool.end(); });
