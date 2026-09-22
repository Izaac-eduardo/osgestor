import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pool } from '../src/config/database.js';
import { app } from '../src/app.js';

test('histórico consulta os 28 abastecimentos reais com summary independente da paginação', async () => {
  const server = app.listen(0); const address = server.address(); assert.ok(address && typeof address === 'object'); const base = `http://127.0.0.1:${address.port}`;
  try {
    const allResponse = await fetch(`${base}/abastecimento/historico?limit=25`); assert.equal(allResponse.status, 200);
    const all = await allResponse.json() as { items: Array<{ data_hora: string; km_hr: number | null; horimetro: number | null }>; summary: { quantidade: number; total_litros: number; total_valor: number }; pagination: { total: number; total_pages: number; limit: number } };
    assert.equal(all.items.length, 25); assert.deepEqual(all.summary, { quantidade: 28, total_litros: 2846.6, total_valor: 17905.114 }); assert.deepEqual(all.pagination, { page: 1, limit: 25, total: 28, total_pages: 2 });
    assert.ok(all.items.every((item, index) => index === 0 || new Date(all.items[index - 1]!.data_hora).getTime() >= new Date(item.data_hora).getTime()));
    assert.ok(all.items.every(item => Object.prototype.hasOwnProperty.call(item, 'horimetro')));

    const obra = (await pool.query<{ id: string }>("SELECT id FROM obras WHERE nome='COAMO' LIMIT 1")).rows[0]; assert.ok(obra);
    const obraResponse = await fetch(`${base}/abastecimento/historico?obra_id=${obra.id}`); const obraBody = await obraResponse.json() as { items: unknown[]; summary: { quantidade: number; total_litros: number; total_valor: number } };
    assert.equal(obraResponse.status, 200); assert.equal(obraBody.items.length, 28); assert.deepEqual(obraBody.summary, all.summary);

    const ce02c = await (await fetch(`${base}/abastecimento/historico?busca=CE02C`)).json() as { items: Array<{ destinatario: string; placa: string }> };
    assert.ok(ce02c.items.some(item => item.destinatario === 'CE02C' && item.placa === 'CE02C'));
    const pirulito = await (await fetch(`${base}/abastecimento/historico?busca=PIRULITO&tipo_destinatario=ESPECIAL`)).json() as { items: Array<{ destinatario: string; tipo_destinatario: string }> };
    assert.ok(pirulito.items.some(item => item.destinatario === 'PIRULITO' && item.tipo_destinatario === 'ESPECIAL'));
    const injection = await fetch(`${base}/abastecimento/historico?busca=%25%27%20OR%201%3D1%20--`); const injectionBody = await injection.json() as { summary: { quantidade: number } }; assert.equal(injection.status, 200); assert.equal(injectionBody.summary.quantidade, 0);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); }
});
