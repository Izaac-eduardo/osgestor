import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMaintenanceSummaryTotalRow, summarizeMaintenanceReport, summarizeMaintenanceRows } from '../src/services/manutencao-financeira-pdf.service.js';

test('mantém serviços terceirizados no subtotal da frota e no total efetivo', () => {
  const rows = [
    { categoria: 'SERVICOS_TERCEIRIZADOS', valor: '480.00' },
    { categoria: 'PECAS_EXTERNAS', valor: '20.00' },
    { categoria: 'MAO_DE_OBRA_INTERNA', valor: '90.00' },
  ];

  assert.deepEqual(summarizeMaintenanceRows(rows), {
    lancamentos: 3,
    pecas_externas: 20,
    servicos_terceirizados: 480,
    materiais_almoxarifado: 0,
    mao_obra_interna: 90,
    total_efetivo: 500,
  });
});

test('totaliza o resumo por frota de forma reconciliável com os blocos detalhados', () => {
  const ct22 = summarizeMaintenanceRows([
    { categoria: 'SERVICOS_TERCEIRIZADOS', valor: '480.00' },
    { categoria: 'MATERIAIS_ALMOXARIFADO', valor: '100.00' },
  ]);
  const ct08 = summarizeMaintenanceRows([
    { categoria: 'SERVICOS_TERCEIRIZADOS', valor: '1300.00' },
    { categoria: 'PECAS_EXTERNAS', valor: '250.00' },
  ]);
  const c08 = summarizeMaintenanceRows([
    { categoria: 'SERVICOS_TERCEIRIZADOS', valor: '1580.00' },
    { categoria: 'MAO_DE_OBRA_INTERNA', valor: '300.00' },
  ]);

  const final = summarizeMaintenanceReport([
    { lancamentos: ct22.lancamentos, pecas_externas: ct22.pecas_externas, servicos_terceirizados: ct22.servicos_terceirizados, materiais_almoxarifado: ct22.materiais_almoxarifado, mao_obra_interna: ct22.mao_obra_interna, total_efetivo: ct22.total_efetivo },
    { lancamentos: ct08.lancamentos, pecas_externas: ct08.pecas_externas, servicos_terceirizados: ct08.servicos_terceirizados, materiais_almoxarifado: ct08.materiais_almoxarifado, mao_obra_interna: ct08.mao_obra_interna, total_efetivo: ct08.total_efetivo },
    { lancamentos: c08.lancamentos, pecas_externas: c08.pecas_externas, servicos_terceirizados: c08.servicos_terceirizados, materiais_almoxarifado: c08.materiais_almoxarifado, mao_obra_interna: c08.mao_obra_interna, total_efetivo: c08.total_efetivo },
  ]);

  assert.equal(final.lancamentos, 6);
  assert.equal(final.servicos_terceirizados, 3360);
  assert.equal(final.pecas_externas, 250);
  assert.equal(final.materiais_almoxarifado, 100);
  assert.equal(final.mao_obra_interna, 300);
  assert.equal(final.total_efetivo, 3710);
  assert.equal(final.total_efetivo, final.pecas_externas + final.servicos_terceirizados + final.materiais_almoxarifado);
});

test('linha TOTAL do PDF expõe todas as colunas agregadas, inclusive serviços terceirizados', () => {
  const detalhes = [
    { categoria: 'PECAS_EXTERNAS', valor: '25411.77' },
    { categoria: 'SERVICOS_TERCEIRIZADOS', valor: '8456.00' },
    { categoria: 'MAO_DE_OBRA_INTERNA', valor: '1200.00' },
  ];
  const subtotal = summarizeMaintenanceRows(detalhes);
  const total = buildMaintenanceSummaryTotalRow([subtotal]);

  assert.equal(total.pecas_externas, 25411.77);
  assert.equal(total.servicos_terceirizados, 8456);
  assert.equal(total.servicos_terceiros, 8456);
  assert.equal(total.materiais_almoxarifado, 0);
  assert.equal(total.mao_obra_interna, 1200);
  assert.equal(Math.round(Number(total.total_efetivo) * 100) / 100, 33867.77);
  assert.equal(Math.round(Number(total.total_efetivo) * 100), Math.round((Number(total.pecas_externas) + Number(total.servicos_terceiros) + Number(total.materiais_almoxarifado)) * 100));
});
