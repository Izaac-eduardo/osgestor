import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDesempenhoOficina } from '../src/services/manutencao-financeira.service.js';

test('desempenho gerencial usa valor por abertura e não mascara competência salarial incompleta', () => {
  const result = normalizeDesempenhoOficina({ valor_servicos_internos: '17490.79', salario_base_informado: '70000.00', meses_no_periodo: 3, meses_com_salario: 1, meses_sem_salario: 2, competencias_sem_salario: ['2026-09', '2026-11'], diferenca_gerencial_estimada: null, periodo_salarial_completo: false });
  assert.equal(result.valor_servicos_internos, '17490.79');
  assert.equal(result.salario_base_cadastrado, null);
  assert.equal(result.diferenca_gerencial_estimada, null);
  assert.equal(result.dados_incompletos, true);
  assert.equal(result.periodo_salarial_completo, false);
});

test('salário zero informado continua sendo um valor válido', () => {
  const result = normalizeDesempenhoOficina({ valor_servicos_internos: '0.00', salario_base_informado: '0.00', meses_no_periodo: 1, meses_com_salario: 1, meses_sem_salario: 0, competencias_sem_salario: [], diferenca_gerencial_estimada: '0.00', periodo_salarial_completo: true });
  assert.equal(result.salario_base_cadastrado, '0.00');
  assert.equal(result.dados_incompletos, false);
});

test('soma dos indicadores usa o alias do agregado e não zera quando há detalhamento', () => {
  const result = normalizeDesempenhoOficina({ valor_servicos_internos: '369.87', salario_base_informado: null, meses_no_periodo: 1, meses_com_salario: 0, meses_sem_salario: 1, competencias_sem_salario: ['2026-09'], diferenca_gerencial_estimada: null, periodo_salarial_completo: true });
  assert.equal(result.valor_servicos_internos, '369.87');
  assert.notEqual(Number(result.valor_servicos_internos), 0);
});
