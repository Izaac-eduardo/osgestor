import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pool } from '../src/config/database.js';
import { app } from '../src/app.js';

test('relatórios gerenciais agregam abastecimentos confirmados e respeitam filtros', async () => {
  const server = app.listen(0); const address = server.address(); assert.ok(address && typeof address === 'object'); const base = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(`${base}/abastecimento/relatorios`); assert.equal(response.status, 200);
    const report = await response.json() as { summary: { quantidade: number; litros: number; valor: number; destinatarios: number }; por_produto: Array<{ produto: string; quantidade: number }>; por_obra: Array<{ obra: string; quantidade: number; litros: number; valor: number }>; por_frota: Array<{ quantidade: number }>; por_terceiro: Array<{ quantidade: number; terceiro: string }>; especiais: Array<{ quantidade: number; destinacao: string }>; evolucao: Array<{ quantidade: number }> };
    assert.deepEqual(report.summary, { quantidade: 28, litros: 2846.6, valor: 17905.114, destinatarios: 26 });
    assert.deepEqual(report.por_produto, [{ produto: 'DIESEL_S500', quantidade: 28, litros: 2846.6, valor: 17905.114 }]);
    assert.deepEqual(report.por_obra, [{ obra: 'COAMO', quantidade: 28, litros: 2846.6, valor: 17905.114, percentual_litros: 100 }]);
    assert.equal(report.por_frota.reduce((sum, item) => sum + item.quantidade, 0), 24); assert.equal(report.por_terceiro.reduce((sum, item) => sum + item.quantidade, 0), 3); assert.deepEqual(report.especiais.map(item => [item.destinacao, item.quantidade]), [['PIRULITO', 1]]); assert.equal(report.evolucao.reduce((sum, item) => sum + item.quantidade, 0), 28);

    const obra = (await pool.query<{ id: string }>("SELECT id FROM obras WHERE nome='COAMO' LIMIT 1")).rows[0]; assert.ok(obra);
    const [filteredResponse, historyResponse] = await Promise.all([fetch(`${base}/abastecimento/relatorios?obra_id=${obra.id}`), fetch(`${base}/abastecimento/historico?obra_id=${obra.id}`)]);
    const filtered = await filteredResponse.json() as { summary: unknown }; const history = await historyResponse.json() as { summary: { quantidade: number; total_litros: number; total_valor: number } };
    assert.deepEqual(filtered.summary, { quantidade: history.summary.quantidade, litros: history.summary.total_litros, valor: history.summary.total_valor, destinatarios: 26 });
    const third = await (await fetch(`${base}/abastecimento/relatorios?busca=PIRULITO&tipo_destinatario=ESPECIAL`)).json() as { summary: { quantidade: number }; especiais: Array<{ destinacao: string }> }; assert.equal(third.summary.quantidade, 1); assert.deepEqual(third.especiais.map(item => item.destinacao), ['PIRULITO']);
    const empty = await (await fetch(`${base}/abastecimento/relatorios?data_inicio=2000-01-01&data_fim=2000-01-31`)).json() as { summary: { quantidade: number; litros: number; valor: number }; por_obra: unknown[] }; assert.deepEqual(empty.summary, { quantidade: 0, litros: 0, valor: 0, destinatarios: 0 }); assert.deepEqual(empty.por_obra, []);
    const injection = await (await fetch(`${base}/abastecimento/relatorios?busca=%25%27%20OR%201%3D1%20--`)).json() as { summary: { quantidade: number } }; assert.equal(injection.summary.quantidade, 0);
  } finally { server.closeAllConnections?.(); await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); }
});
