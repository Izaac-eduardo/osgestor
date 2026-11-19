import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { pool } from '../src/config/database.js';
import { getDesempenhoOficina, getManutencaoDetalhes, getManutencaoPorFrota, getManutencaoTotais, saveSalarioBase } from '../src/services/manutencao-financeira.service.js';

test('consolidação por frota separa fontes, filtra finalizadas e sinaliza salário ausente', async () => {
  const suffix = Math.floor(Math.random() * 900000) + 100000;
  const fleet = (await pool.query<{ id: string; codigo: string }>('SELECT id,codigo FROM frotas WHERE status=\'ATIVO\' LIMIT 1')).rows[0]!;
  const admin = (await pool.query<{ id: string }>('SELECT id FROM usuarios WHERE role=\'ADMIN\' LIMIT 1')).rows[0]!;
  assert.ok(fleet && admin);
  const order = (await pool.query<{ id: string }>(`INSERT INTO ordens_servico(numero_os,obra_id,frota_id,natureza_os,data_abertura,data_fechamento,status,observacoes) VALUES($1,NULL,$2,'INTERNA','2026-10-01','2026-10-05','FINALIZADA','teste etapa 3') RETURNING id`, [991000000 + suffix, fleet.id])).rows[0]!;
  const openOrder = (await pool.query<{ id: string }>(`INSERT INTO ordens_servico(numero_os,obra_id,frota_id,natureza_os,data_abertura,status,observacoes) VALUES($1,NULL,$2,'INTERNA','2026-10-01','ABERTA','teste etapa 3 aberta') RETURNING id`, [992000000 + suffix, fleet.id])).rows[0]!;
  const cancelled = (await pool.query<{ id: string }>(`INSERT INTO ordens_servico(numero_os,obra_id,frota_id,natureza_os,data_abertura,data_fechamento,status,observacoes) VALUES($1,NULL,$2,'TERCEIRO','2026-10-01','2026-10-05','CANCELADA','histórico terceiro') RETURNING id`, [993000000 + suffix, fleet.id])).rows[0]!;
  const products = await pool.query<{ id: string }>(`INSERT INTO produtos_os(ordem_servico_id,descricao,quantidade,unidade,valor_unitario) VALUES($1,'Material teste',1,'UN',30.30),($2,'Material aberto',1,'UN',999),($3,'Terceiro histórico',1,'UN',888) RETURNING id`, [order.id, openOrder.id, cancelled.id]);
  const services = await pool.query<{ id: string }>(`INSERT INTO servicos_os(ordem_servico_id,descricao,valor,classificacao_servico,classificacao_origem) VALUES($1,'Mão de obra interna',40.40,'INTERNO','MANUAL'),($1,'Serviço indeterminado',70.70,'INDETERMINADO','LEGADO'),($2,'Aberto',900,'INTERNO','MANUAL'),($3,'Terceiro histórico',800,'TERCEIRO','IMPORTACAO') RETURNING id`, [order.id, openOrder.id, cancelled.id]);
  const importacao = (await pool.query<{ id: string }>(`INSERT INTO importacoes_contabeis(arquivo_nome,hash_arquivo,tamanho_bytes) VALUES($1,$2,1) RETURNING id`, [`etapa3-${suffix}.xlsx`, suffix.toString().padStart(64, '0')])).rows[0]!;
  await pool.query(`INSERT INTO lancamentos_contabeis(importacao_id,fingerprint,planilha_original,linha_original,dados_originais,data_conta,valor_total,subcentro_original,categoria_contabil,classificacao,frota_id,identificacao_frota) VALUES($1,$2,'Relatorio',2,'{}','2026-10-05',100.10,'TESTE','CUSTO PECAS / OFICINA','PECAS_EXTERNAS',$3,'MANUAL'),($1,$4,'Relatorio',3,'{}','2026-11-05',50.20,'TESTE','CUSTO SERVICOS','SERVICOS_TERCEIRIZADOS',$3,'MANUAL'),($1,$5,'Relatorio',4,'{}','2026-10-05',700,'TESTE','CUSTO USO E CONSUMO','PENDENTE',$3,'MANUAL')`, [importacao.id, randomUUID().replaceAll('-', ''), fleet.id, randomUUID().replaceAll('-', ''), randomUUID().replaceAll('-', '')]);
  const actor = { id: admin.id, role: 'ADMIN' } as never;
  const previousSalary = (await pool.query<{ ano: number; mes: number; valor_consolidado: string; observacoes: string | null; atualizado_por: string }>('SELECT ano,mes,valor_consolidado,observacoes,atualizado_por FROM salarios_base_oficina WHERE ano=2026 AND mes IN (10,11)')).rows;
  await assert.rejects(() => saveSalarioBase({ ano: 2026, mes: 12, valor_consolidado: '1.00' }, { id: admin.id, role: 'OPERADOR' } as never), /Somente administradores/);
  const salary = await saveSalarioBase({ ano: 2026, mes: 10, valor_consolidado: '10.10', observacoes: 'teste' }, actor);
  try {
    const summary = (await getManutencaoPorFrota({ data_inicio: '2026-10-01', data_fim: '2026-11-30', frota_id: fleet.id })) as Array<Record<string, string>>;
    assert.equal(summary.length, 1); assert.equal(summary[0]!.pecas_externas, '100.10'); assert.equal(summary[0]!.servicos_terceirizados, '50.20'); assert.equal(summary[0]!.materiais_almoxarifado, '1029.30'); assert.equal(summary[0]!.total_efetivo, '1179.60'); assert.equal(summary[0]!.mao_obra_interna, '940.40');
    const totals = await getManutencaoTotais({ data_inicio: '2026-10-01', data_fim: '2026-11-30', frota_id: fleet.id });
    assert.equal(totals.total_efetivo, '1179.60'); assert.equal(totals.mao_obra_interna, '940.40');
    const details = await getManutencaoDetalhes({ data_inicio: '2026-10-01', data_fim: '2026-11-30', frota_id: fleet.id });
    assert.equal(details.length, 6); assert.equal((details as Array<Record<string, unknown>>).some(item => item.categoria === 'MAO_DE_OBRA_INTERNA'), true);
    const performanceMissing = await getDesempenhoOficina({ data_inicio: '2026-10-01', data_fim: '2026-11-30', frota_id: fleet.id });
    assert.equal(performanceMissing.dados_incompletos, true); assert.equal(performanceMissing.diferenca_gerencial_estimada, null); assert.deepEqual(performanceMissing.competencias_sem_salario, ['2026-11']);
    await saveSalarioBase({ ano: 2026, mes: 11, valor_consolidado: '20.20' }, actor);
    const performance = await getDesempenhoOficina({ data_inicio: '2026-10-01', data_fim: '2026-11-30', frota_id: fleet.id });
    assert.equal(performance.valor_servicos_internos, '940.40'); assert.equal(performance.salario_base_cadastrado, '30.30'); assert.equal(performance.diferenca_gerencial_estimada, '910.10'); assert.equal(performance.dados_incompletos, false);
  } finally {
    await pool.query('DELETE FROM salarios_base_oficina WHERE ano=2026 AND mes IN (10,11)');
    for (const previous of previousSalary) await pool.query('INSERT INTO salarios_base_oficina(ano,mes,valor_consolidado,observacoes,atualizado_por) VALUES($1,$2,$3,$4,$5)', [previous.ano, previous.mes, previous.valor_consolidado, previous.observacoes, previous.atualizado_por]);
    await pool.query('DELETE FROM lancamentos_contabeis WHERE importacao_id=$1', [importacao.id]); await pool.query('DELETE FROM importacoes_contabeis WHERE id=$1', [importacao.id]);
    await pool.query('DELETE FROM produtos_os WHERE id=ANY($1::uuid[])', [products.rows.map(row => row.id)]); await pool.query('DELETE FROM servicos_os WHERE id=ANY($1::uuid[])', [services.rows.map(row => row.id)]); await pool.query('DELETE FROM ordens_servico WHERE id=ANY($1::uuid[])', [[order.id, openOrder.id, cancelled.id]]);
    await pool.end();
  }
});
