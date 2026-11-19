import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';
import { pool } from '../src/config/database.js';
import { getManutencaoDetalhes, getManutencaoPorFrota, getManutencaoTotais } from '../src/services/manutencao-financeira.service.js';

test('contabiliza materiais e mão de obra pela abertura, mesmo sem fechamento ou com fechamento em outro mês', async () => {
  const suffix = Math.floor(Math.random() * 900000) + 100000;
  const fleet = (await pool.query<{ id: string }>("SELECT id FROM frotas WHERE status='ATIVO' LIMIT 1")).rows[0]!;
  assert.ok(fleet);

  const noClose = (await pool.query<{ id: string }>(`INSERT INTO ordens_servico(numero_os,obra_id,frota_id,natureza_os,data_abertura,status,observacoes) VALUES($1,NULL,$2,'INTERNA','2025-09-15','FINALIZADA','periodo sem fechamento') RETURNING id`, [994000000 + suffix, fleet.id])).rows[0]!;
  const open = (await pool.query<{ id: string }>(`INSERT INTO ordens_servico(numero_os,obra_id,frota_id,natureza_os,data_abertura,status,observacoes) VALUES($1,NULL,$2,'INTERNA','2025-09-18','ABERTA','periodo aberta') RETURNING id`, [994500000 + suffix, fleet.id])).rows[0]!;
  const crossMonth = (await pool.query<{ id: string }>(`INSERT INTO ordens_servico(numero_os,obra_id,frota_id,natureza_os,data_abertura,data_fechamento,status,observacoes) VALUES($1,NULL,$2,'INTERNA','2025-09-30','2025-10-05','FINALIZADA','periodo entre meses') RETURNING id`, [995000000 + suffix, fleet.id])).rows[0]!;
  const cancelled = (await pool.query<{ id: string }>(`INSERT INTO ordens_servico(numero_os,obra_id,frota_id,natureza_os,data_abertura,data_fechamento,status,observacoes) VALUES($1,NULL,$2,'INTERNA','2025-09-20','2025-09-25','CANCELADA','nao contabilizar') RETURNING id`, [996000000 + suffix, fleet.id])).rows[0]!;
  const products = await pool.query<{ id: string }>(`INSERT INTO produtos_os(ordem_servico_id,descricao,quantidade,unidade,valor_unitario) VALUES($1,'Material abertura sem fechamento',1,'UN',10),($2,'Material O.S. aberta',1,'UN',40),($3,'Material abertura setembro',1,'UN',20),($4,'Material cancelado',1,'UN',999) RETURNING id`, [noClose.id, open.id, crossMonth.id, cancelled.id]);
  const services = await pool.query<{ id: string }>(`INSERT INTO servicos_os(ordem_servico_id,descricao,valor,classificacao_servico,classificacao_origem) VALUES($1,'Mao de obra sem fechamento',11,'INTERNO','MANUAL'),($2,'Mao de obra O.S. aberta',2,'INTERNO','MANUAL'),($3,'Mao de obra abertura setembro',1,'INTERNO','MANUAL'),($4,'Mao de obra cancelada',888,'INTERNO','MANUAL') RETURNING id`, [noClose.id, open.id, crossMonth.id, cancelled.id]);
  const orderIds = [noClose.id, open.id, crossMonth.id, cancelled.id];

  try {
    const filters = { data_inicio: '2025-09-01', data_fim: '2025-09-30', frota_id: fleet.id };
    const summary = (await getManutencaoPorFrota(filters)) as Array<Record<string, string>>;
    assert.equal(summary.length, 1);
    assert.equal(summary[0]!.materiais_almoxarifado, '70.00');
    assert.equal(summary[0]!.mao_obra_interna, '14.00');
    const totals = await getManutencaoTotais(filters);
    assert.equal(totals.materiais_almoxarifado, '70.00');
    assert.equal(totals.mao_obra_interna, '14.00');
    const details = await getManutencaoDetalhes(filters) as Array<Record<string, string>>;
    assert.equal(details.length, 6);
    assert.equal(details.every(item => item.data.startsWith('2025-09-')), true);
    assert.equal(details.some(item => item.descricao === 'Material abertura sem fechamento'), true);
    assert.equal(details.some(item => item.descricao === 'Material O.S. aberta'), true);
    assert.equal(details.some(item => item.descricao === 'Material abertura setembro'), true);
    assert.equal(details.some(item => item.descricao === 'Material cancelado'), false);
    const followingMonth = await getManutencaoTotais({ data_inicio: '2025-10-01', data_fim: '2025-10-31', frota_id: fleet.id });
    assert.equal(followingMonth.materiais_almoxarifado, '0');
    assert.equal(followingMonth.mao_obra_interna, '0');
  } finally {
    await pool.query('DELETE FROM produtos_os WHERE id=ANY($1::uuid[])', [products.rows.map(row => row.id)]);
    await pool.query('DELETE FROM servicos_os WHERE id=ANY($1::uuid[])', [services.rows.map(row => row.id)]);
    await pool.query('DELETE FROM ordens_servico WHERE id=ANY($1::uuid[])', [orderIds]);
    await pool.end();
  }
});
