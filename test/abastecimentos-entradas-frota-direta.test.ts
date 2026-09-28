import 'dotenv/config';
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { pool } from '../src/config/database.js';
import { app } from '../src/app.js';
import { exportEntradasExcel, exportEntradasPdf } from '../src/services/abastecimentos-export.service.js';
import ExcelJS from 'exceljs';

const ids: string[] = [];
const json = async (response: Response) => response.json() as Promise<any>;

test('homologa PONTO, FROTA_DIRETA, legado, edição, relatório, exportações e total', async () => {
  assert.equal(process.env.DB_NAME, 'oficina_test');
  const product = (await pool.query<{ id: string }>("SELECT id FROM abastecimento_produtos WHERE codigo='DIESEL_S500' LIMIT 1")).rows[0];
  const point = (await pool.query<{ id: string }>("SELECT id FROM abastecimento_pontos WHERE codigo='POSTO' LIMIT 1")).rows[0];
  const fleet = (await pool.query<{ id: string; codigo: string }>("SELECT id,codigo FROM frotas WHERE status='ATIVO' ORDER BY codigo LIMIT 1")).rows[0];
  assert.ok(product && point && fleet);
  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const create = async (numero_nf: string, destinos: unknown[]) => {
    const response = await fetch(`${base}/abastecimento/entradas`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data_entrada: '2026-09-26', numero_nf, produto_id: product.id, litros_nf: destinos.reduce((sum: number, item: any) => sum + Number(item.litros), 0), valor_total_nf: 100, destinos }) });
    assert.equal(response.status, 201);
    const result = await json(response); ids.push(result.id); return result;
  };
  try {
    const pointOnly = await create('FD-TEST-POINT', [{ tipo_destino: 'PONTO', ponto_id: point.id, frota_id: null, litros: 20 }]);
    assert.equal(pointOnly.destinos[0].tipo_destino, 'PONTO');
    const directOnly = await create('FD-TEST-DIRECT', [{ tipo_destino: 'FROTA_DIRETA', ponto_id: null, frota_id: fleet.id, litros: 30 }]);
    assert.equal(directOnly.destinos[0].frota_id, fleet.id);
    const mixed = await create('FD-TEST-MIXED', [{ tipo_destino: 'PONTO', ponto_id: point.id, frota_id: null, litros: 1501 }, { tipo_destino: 'FROTA_DIRETA', ponto_id: null, frota_id: fleet.id, litros: 94 }]);
    assert.equal(mixed.total_distribuido, 1595);
    assert.deepEqual(mixed.destinos.map((item: any) => [item.tipo_destino, item.litros]).sort(), [['FROTA_DIRETA', 94], ['PONTO', 1501]]);

    const invalid = async (destination: unknown) => { const response = await fetch(`${base}/abastecimento/entradas`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data_entrada: '2026-09-26', numero_nf: `FD-INVALID-${Math.random()}`, produto_id: product.id, litros_nf: 1, valor_total_nf: 1, destinos: [destination] }) }); assert.equal(response.status, 400); };
    await invalid({ tipo_destino: 'PONTO', ponto_id: null, frota_id: null, litros: 1 });
    await invalid({ tipo_destino: 'FROTA_DIRETA', ponto_id: null, frota_id: null, litros: 1 });
    await invalid({ tipo_destino: 'PONTO', ponto_id: point.id, frota_id: fleet.id, litros: 1 });

    const pointToDirect = await fetch(`${base}/abastecimento/entradas/${pointOnly.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data_entrada: '2026-09-26', numero_nf: 'FD-TEST-POINT', produto_id: product.id, litros_nf: 25, valor_total_nf: 100, destinos: [{ tipo_destino: 'FROTA_DIRETA', ponto_id: null, frota_id: fleet.id, litros: 25 }] }) });
    assert.equal(pointToDirect.status, 200);
    assert.equal((await json(pointToDirect)).destinos[0].tipo_destino, 'FROTA_DIRETA');
    const directToPoint = await fetch(`${base}/abastecimento/entradas/${directOnly.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data_entrada: '2026-09-26', numero_nf: 'FD-TEST-DIRECT', produto_id: product.id, litros_nf: 35, valor_total_nf: 100, destinos: [{ tipo_destino: 'PONTO', ponto_id: point.id, frota_id: null, litros: 35 }] }) });
    assert.equal(directToPoint.status, 200);
    assert.equal((await json(directToPoint)).destinos[0].tipo_destino, 'PONTO');

    const legacy = (await pool.query<{ id: string }>('INSERT INTO abastecimento_entradas(data_entrada,numero_nf,produto_id,litros_nf,valor_total_nf) VALUES($1,$2,$3,$4,$5) RETURNING id', ['2026-09-26', 'FD-TEST-LEGACY', product.id, 11, 1])).rows[0]!;
    ids.push(legacy.id);
    await pool.query('INSERT INTO abastecimento_entrada_destinos(entrada_id,ponto_id,litros) VALUES($1,$2,$3)', [legacy.id, point.id, 11]);
    const legacyResponse = await (await fetch(`${base}/abastecimento/entradas/${legacy.id}`)).json() as any;
    assert.equal(legacyResponse.destinos[0].tipo_destino, 'PONTO');

    const report = await json(await fetch(`${base}/abastecimento/relatorios/entradas?numero_nf=FD-TEST-MIXED&limit=25`));
    assert.deepEqual(report.por_ponto.map((item: any) => [item.codigo, item.litros]), [['POSTO', 1501]]);
    assert.deepEqual(report.por_frota_direta.map((item: any) => [item.frota_id, item.litros]), [[fleet.id, 94]]);
    assert.equal(report.items[0].total_distribuido, 1595);
    assert.equal(report.total_frota_direta, 94);

    const filters = { numero_nf: 'FD-TEST-MIXED', limit: 25, page: 1 };
    const excel = await exportEntradasExcel(filters);
    const pdf = await exportEntradasPdf(filters);
    assert.ok(excel.length > 1000);
    assert.ok(pdf.length > 1000);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excel);
    const destinationSheet = workbook.getWorksheet('Destinos');
    assert.ok(destinationSheet);
    const exportedDirect = destinationSheet!.getRows(1, destinationSheet!.rowCount).some(row => String(row.getCell(5).value).includes('Frota direta') && Number(row.getCell(6).value) === 94);
    assert.equal(exportedDirect, true);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM abastecimentos WHERE identificador_externo LIKE 'FD-TEST-%'")).rows[0].count, 0);
  } finally { server.close(); }
});

test('constraint de destino rejeita combinações inválidas no PostgreSQL', async () => {
  assert.equal(process.env.DB_NAME, 'oficina_test');
  const entry = ids[0];
  const point = (await pool.query<{ id: string }>("SELECT id FROM abastecimento_pontos WHERE codigo='POSTO' LIMIT 1")).rows[0]!;
  const fleet = (await pool.query<{ id: string }>("SELECT id FROM frotas WHERE status='ATIVO' ORDER BY codigo LIMIT 1")).rows[0]!;
  const rejected = async (type: string, pointId: string | null, fleetId: string | null) => {
    const client = await pool.connect();
    try { await client.query('BEGIN'); await client.query('SAVEPOINT invalid_destination'); await assert.rejects(client.query('INSERT INTO abastecimento_entrada_destinos(entrada_id,tipo_destino,ponto_id,frota_id,litros) VALUES($1,$2,$3,$4,1)', [entry, type, pointId, fleetId])); await client.query('ROLLBACK TO SAVEPOINT invalid_destination'); await client.query('COMMIT'); } finally { client.release(); }
  };
  await rejected('PONTO', null, null);
  await rejected('PONTO', point.id, fleet.id);
  await rejected('FROTA_DIRETA', null, null);
  await rejected('FROTA_DIRETA', point.id, fleet.id);
});

after(async () => {
  if (process.env.DB_NAME !== 'oficina_test' || !ids.length) return;
  await pool.query('DELETE FROM abastecimento_entrada_destinos WHERE entrada_id=ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM abastecimento_entradas WHERE id=ANY($1::uuid[])', [ids]);
  await pool.end();
});
