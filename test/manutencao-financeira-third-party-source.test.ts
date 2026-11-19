import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { pool } from '../src/config/database.js';
import { getManutencaoDetalhes, getManutencaoPorFrota, getManutencaoTotais } from '../src/services/manutencao-financeira.service.js';

test('alterna serviços terceirizados entre O.S. e contabilidade sem somar as fontes', async () => {
  const suffix = Math.floor(Math.random() * 900000) + 100000;
  const prefixCode = `TP${suffix}`;
  const prefix = (await pool.query<{ id: string }>(`INSERT INTO prefixos_frota(codigo,descricao,status) VALUES($1,'Teste fonte terceiros','ATIVO') RETURNING id`, [prefixCode])).rows[0]!;
  const fleet = (await pool.query<{ id: string }>(`INSERT INTO frotas(prefixo_frota_id,numero,codigo,descricao,status) VALUES($1,'1',$2,'Teste fonte terceiros','ATIVO') RETURNING id`, [prefix.id, `${prefixCode}1`])).rows[0]!;
  const orders: string[] = [];
  const services: string[] = [];
  const insertOrder = async (date: string, status: string, closingDate?: string) => {
    const row = (await pool.query<{ id: string }>(`INSERT INTO ordens_servico(numero_os,obra_id,frota_id,natureza_os,data_abertura,data_fechamento,status,observacoes) VALUES($1,NULL,$2,'INTERNA',$3,$4,$5,'fonte terceiros teste') RETURNING id`, [997000000 + suffix + orders.length, fleet.id, date, closingDate ?? null, status])).rows[0]!;
    orders.push(row.id);
    return row.id;
  };
  const insertService = async (orderId: string, description: string, value: number, classification: string) => {
    const row = (await pool.query<{ id: string }>(`INSERT INTO servicos_os(ordem_servico_id,descricao,valor,classificacao_servico,classificacao_origem) VALUES($1,$2,$3,$4,'MANUAL') RETURNING id`, [orderId, description, value, classification])).rows[0]!;
    services.push(row.id);
  };
  const september = await insertOrder('2026-09-15', 'FINALIZADA');
  const october = await insertOrder('2026-10-15', 'FINALIZADA', '2026-11-02');
  const november = await insertOrder('2026-11-15', 'ABERTA');
  const cancelled = await insertOrder('2026-09-20', 'CANCELADA');
  await insertService(september, 'Terceiro O.S. setembro', 100, 'TERCEIRO');
  await insertService(september, 'Indeterminado não automático', 50, 'INDETERMINADO');
  await insertService(october, 'Terceiro O.S. outubro', 200, 'TERCEIRO');
  await insertService(november, 'Terceiro O.S. novembro não usado', 400, 'TERCEIRO');
  await insertService(cancelled, 'Terceiro cancelado', 900, 'TERCEIRO');
  const importacao = (await pool.query<{ id: string }>(`INSERT INTO importacoes_contabeis(arquivo_nome,hash_arquivo,tamanho_bytes) VALUES($1,$2,1) RETURNING id`, [`fonte-terceiros-${suffix}.xlsx`, randomUUID().replaceAll('-', '').padEnd(64, '0')])).rows[0]!;
  await pool.query(`INSERT INTO lancamentos_contabeis(importacao_id,fingerprint,planilha_original,linha_original,dados_originais,data_conta,valor_total,subcentro_original,categoria_contabil,classificacao,frota_id,identificacao_frota) VALUES($1,$2,'Fonte terceiros',2,'{}','2026-10-20',700,'TESTE','CUSTO SERVICOS','SERVICOS_TERCEIRIZADOS',$3,'MANUAL'),($1,$4,'Fonte terceiros',3,'{}','2026-11-20',300,'TESTE','CUSTO SERVICOS','SERVICOS_TERCEIRIZADOS',$3,'MANUAL')`, [importacao.id, randomUUID().replaceAll('-', '').padEnd(64, '0'), fleet.id, randomUUID().replaceAll('-', '').padEnd(64, '0')]);

  try {
    const septemberTotals = await getManutencaoTotais({ data_inicio: '2026-09-01', data_fim: '2026-09-30', frota_id: fleet.id });
    const octoberTotals = await getManutencaoTotais({ data_inicio: '2026-10-01', data_fim: '2026-10-31', frota_id: fleet.id });
    const novemberTotals = await getManutencaoTotais({ data_inicio: '2026-11-01', data_fim: '2026-11-30', frota_id: fleet.id });
    const mixedTotals = await getManutencaoTotais({ data_inicio: '2026-09-01', data_fim: '2026-11-30', frota_id: fleet.id });
    assert.equal(septemberTotals.servicos_terceirizados, '100.00');
    assert.equal(octoberTotals.servicos_terceirizados, '200.00');
    assert.equal(novemberTotals.servicos_terceirizados, '300.00');
    assert.equal(mixedTotals.servicos_terceirizados, '600.00');

    const summary = (await getManutencaoPorFrota({ data_inicio: '2026-09-01', data_fim: '2026-11-30', frota_id: fleet.id })) as Array<Record<string, string>>;
    assert.equal(summary[0]!.servicos_terceirizados, '600.00');
    const details = await getManutencaoDetalhes({ data_inicio: '2026-09-01', data_fim: '2026-11-30', frota_id: fleet.id }) as Array<Record<string, string>>;
    const thirdPartyDetails = details.filter(row => row.categoria === 'SERVICOS_TERCEIRIZADOS');
    assert.equal(thirdPartyDetails.length, 3);
    assert.equal(thirdPartyDetails.filter(row => row.origem === 'OS').length, 2);
    assert.equal(thirdPartyDetails.filter(row => row.origem === 'CONTABILIDADE').length, 1);
    assert.equal(thirdPartyDetails.some(row => row.descricao === 'Indeterminado não automático'), false);
    assert.equal(thirdPartyDetails.some(row => row.descricao === 'Terceiro cancelado'), false);
    assert.equal(thirdPartyDetails.some(row => row.descricao === 'Terceiro O.S. outubro' && row.data === '2026-10-15'), true);
    assert.equal(thirdPartyDetails.some(row => row.descricao === 'Terceiro O.S. novembro não usado'), false);
  } finally {
    await pool.query('DELETE FROM lancamentos_contabeis WHERE importacao_id=$1', [importacao.id]);
    await pool.query('DELETE FROM importacoes_contabeis WHERE id=$1', [importacao.id]);
    await pool.query('DELETE FROM servicos_os WHERE id=ANY($1::uuid[])', [services]);
    await pool.query('DELETE FROM ordens_servico WHERE id=ANY($1::uuid[])', [orders]);
    await pool.query('DELETE FROM frotas WHERE id=$1', [fleet.id]);
    await pool.query('DELETE FROM prefixos_frota WHERE id=$1', [prefix.id]);
    await pool.end();
  }
});
