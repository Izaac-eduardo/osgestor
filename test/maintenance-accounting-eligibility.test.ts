import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAccountingMaintenanceExclusionSql, getAccountingMaintenanceExclusionReason, isMaintenanceTollExpense, matchesDiverseMaintenanceFilters, type SharedAccountingMaintenanceRow } from '../src/services/maintenance-accounting-eligibility.js';

const filters = { data_inicio: '2026-11-01', data_fim: '2026-11-05' };
const row = (produto_original: string, valor_total: number, classificacao: string, extra: Partial<SharedAccountingMaintenanceRow> = {}) => ({
  produto_original, valor_total, classificacao, subcentro_original: 'FROTAS DIVERSAS',
  despesa_compartilhada_status: 'APROVADA', frota_id: null, data_conta: '2026-11-03', ...extra,
});

test('reconcilia os lançamentos elegíveis de Frotas Diversas e exclui R$ 100.807,56 de pedágios', () => {
  const entries = [
    row('Serviço de torno', 3750, 'SERVICOS_TERCEIRIZADOS'),
    row('Serviço de borracharia', 2320, 'SERVICOS_TERCEIRIZADOS'),
    row('Palheta limpador para-brisa', 140, 'PECAS_EXTERNAS'),
    row('Palheta limpador para-brisa', 140, 'PECAS_EXTERNAS'),
    row('Para-brisa', 1000, 'PECAS_EXTERNAS'),
    row('Para-brisa', 1000, 'PECAS_EXTERNAS'),
    row('PASSAGEM PEDÁGIO', 80807.56, 'SERVICOS_TERCEIRIZADOS'),
    row('MENSALIDADE PEDAGIO', 20000, 'SERVICOS_TERCEIRIZADOS'),
  ];
  const eligible = entries.filter(item => matchesDiverseMaintenanceFilters(item, filters));
  const parts = eligible.filter(item => item.classificacao === 'PECAS_EXTERNAS').reduce((sum, item) => sum + item.valor_total, 0);
  const services = eligible.filter(item => item.classificacao === 'SERVICOS_TERCEIRIZADOS').reduce((sum, item) => sum + item.valor_total, 0);
  const excludedTolls = entries.filter(item => isMaintenanceTollExpense(item.produto_original)).reduce((sum, item) => sum + item.valor_total, 0);

  assert.equal(eligible.length, 6);
  assert.equal(parts, 2280);
  assert.equal(services, 6070);
  assert.equal(parts + services, 8350);
  assert.equal(excludedTolls, 100807.56);
});

test('Frotas Diversas respeita período e natureza e não entra ao filtrar frota específica ou origem O.S.', () => {
  const entry = row('Serviço de torno', 3750, 'SERVICOS_TERCEIRIZADOS');
  assert.equal(matchesDiverseMaintenanceFilters(entry, filters), true);
  assert.equal(matchesDiverseMaintenanceFilters(entry, { ...filters, data_inicio: '2026-11-04' }), false);
  assert.equal(matchesDiverseMaintenanceFilters(entry, { ...filters, natureza: 'PECAS_EXTERNAS' }), false);
  assert.equal(matchesDiverseMaintenanceFilters(entry, { ...filters, natureza: 'MAO_DE_OBRA_INTERNA' }), false);
  assert.equal(matchesDiverseMaintenanceFilters(entry, { ...filters, frota_id: 'fleet-1' }), false);
  assert.equal(matchesDiverseMaintenanceFilters(entry, { ...filters, frota_codigo: 'CT01' }), false);
  assert.equal(matchesDiverseMaintenanceFilters(entry, { ...filters, origem: 'OS' }), false);
});

test('exclui itens não aprovados, fora das classificações de manutenção ou alocados a uma frota', () => {
  const valid = row('Peça manutenção', 50, 'PECAS_EXTERNAS');
  assert.equal(matchesDiverseMaintenanceFilters({ ...valid, despesa_compartilhada_status: 'AGUARDANDO_DECISAO' }, filters), false);
  assert.equal(matchesDiverseMaintenanceFilters({ ...valid, despesa_compartilhada_status: 'DESCONSIDERADA' }, filters), false);
  assert.equal(matchesDiverseMaintenanceFilters({ ...valid, classificacao: 'PENDENTE' }, filters), false);
  assert.equal(matchesDiverseMaintenanceFilters({ ...valid, frota_id: 'fleet-1' }, filters), false);
  assert.equal(matchesDiverseMaintenanceFilters({ ...valid, subcentro_original: 'CT01' }, filters), false);
});

test('reconhece pedágios com variações de caixa, espaços e acentuação', () => {
  assert.equal(isMaintenanceTollExpense('  passagem   pedágio eletrônico '), true);
  assert.equal(isMaintenanceTollExpense('Mensalidade Pedagio'), true);
  assert.equal(isMaintenanceTollExpense('Mensalidade de pedágio'), true);
  assert.equal(isMaintenanceTollExpense('Serviço de borracharia'), false);
});

test('exclui descrições contábeis específicas de frete, rastreamento e ARLA 32', () => {
  assert.equal(getAccountingMaintenanceExclusionReason('FRETE DE PEÇAS'), 'FRETE');
  assert.equal(getAccountingMaintenanceExclusionReason('Serviço de Frete — oficina'), 'FRETE');
  assert.equal(getAccountingMaintenanceExclusionReason('CUSTO DE FRETE'), 'FRETE');
  assert.equal(getAccountingMaintenanceExclusionReason('Rastreamento de frota - mensalidade'), 'RASTREAMENTO');
  assert.equal(getAccountingMaintenanceExclusionReason('SERVIÇOS DE MONITORAMENTO VEICULAR'), 'RASTREAMENTO');
  assert.equal(getAccountingMaintenanceExclusionReason('Mensalidade serviço de rastreamento'), 'RASTREAMENTO');
  assert.equal(getAccountingMaintenanceExclusionReason('ARLA-32 20 L'), 'ARLA_32');
  assert.equal(getAccountingMaintenanceExclusionReason('Aditivo Arla 32 granel'), 'ARLA_32');
  assert.equal(getAccountingMaintenanceExclusionReason('BIOAR ARLA 32 GRANEL'), 'ARLA_32');
  assert.equal(getAccountingMaintenanceExclusionReason('Marca Exemplo — ARLA-32 a granel'), 'ARLA_32');
});

test('preserva descrições ambíguas que podem identificar peças ou serviços legítimos', () => {
  assert.equal(getAccountingMaintenanceExclusionReason('FILTRO ARLA 32'), null);
  assert.equal(getAccountingMaintenanceExclusionReason('BOMBA ARLA 32'), null);
  assert.equal(getAccountingMaintenanceExclusionReason('SENSOR ARLA 32'), null);
  assert.equal(getAccountingMaintenanceExclusionReason('REPARO SISTEMA ARLA 32'), null);
  assert.equal(getAccountingMaintenanceExclusionReason('REPARAÇÃO DO SISTEMA DE ARLA-32'), null);
  assert.equal(getAccountingMaintenanceExclusionReason('Peça de reposição com frete incluso'), null);
  assert.equal(getAccountingMaintenanceExclusionReason('Monitoramento de temperatura do motor'), null);
  assert.equal(getAccountingMaintenanceExclusionReason('RASTREADOR VEICULAR para reposição'), null);
  assert.equal(getAccountingMaintenanceExclusionReason('Serviço de manutenção de veículo'), null);
});

test('gera a mesma regra SQL centralizada e rejeita alias não seguro', () => {
  const predicate = buildAccountingMaintenanceExclusionSql('l');
  assert.match(predicate, /l\.produto_original/);
  assert.match(predicate, /PASSAGEM PEDAGIO/);
  assert.match(predicate, /FRETE/);
  assert.match(predicate, /RASTREAMENTO DE FROTA/);
  assert.match(predicate, /ARLA 32/);
  assert.match(predicate, /LIKE '% ARLA 32 %'/);
  assert.match(predicate, /BOMBA/);
  assert.match(predicate, /SENSOR/);
  assert.match(predicate, /REPARO/);
  assert.throws(() => buildAccountingMaintenanceExclusionSql('l; DROP TABLE lancamentos_contabeis'));
});
