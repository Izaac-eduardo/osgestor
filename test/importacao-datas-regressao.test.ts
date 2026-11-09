import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOsUpdateDiff, orderUpdateSql, type ExistingOsSnapshot } from '../src/services/sincronizacao-os.service.js';
import type { ParsedOs } from '../src/imports/poli-os.js';

const current = (overrides: Partial<ExistingOsSnapshot> = {}): ExistingOsSnapshot => ({
  id: 'os-1', numeroOs: 1, obraId: 'obra-1', obra: 'Obra', frotaId: 'frota-1', frota: 'F01', natureza: 'INTERNA', categoria: null,
  status: 'ABERTA', problema: null, dataFechamento: null, servicos: [], produtos: [], execucoes: [], ...overrides,
});
const parsed = (overrides: Partial<ParsedOs> = {}): ParsedOs => ({
  numeroOs: 1, data: '2026-09-01', cliente: null, frotaOriginal: 'F01', parecerOriginal: null, funcionarioAbertura: null,
  problema: null, natureza: 'INTERNA', status: 'ABERTA', statusOriginal: 'ABERTA', statusOrigem: 'AUTOMATICO', itens: [], execucoes: [],
  statusPreview: 'NOVA', pendencias: [], origem: 'fixture.xls', ...overrides,
});

test('status FINALIZADA sem fechamento da fonte permanece sem data', () => {
  const diff = buildOsUpdateDiff(parsed({ status: 'FINALIZADA' }), current());
  assert.equal(diff.dataFechamento, undefined);
  assert.equal(diff.podeAtualizarAutomaticamente, true);
  assert.doesNotMatch(orderUpdateSql, /CURRENT_DATE/);
});

test('fechamento explícito é preservado e conflito não sobrescreve histórico', () => {
  const safe = buildOsUpdateDiff(parsed({ status: 'FINALIZADA', dataFechamento: '2026-09-14' }), current());
  assert.deepEqual(safe.dataFechamento, { atual: null, novo: '2026-09-14' });
  assert.equal(safe.podeAtualizarAutomaticamente, true);
  const conflict = buildOsUpdateDiff(parsed({ status: 'FINALIZADA', dataFechamento: '2026-09-15' }), current({ status: 'FINALIZADA', dataFechamento: '2026-09-14' }));
  assert.equal(conflict.estado, 'REQUER_REVISAO');
  assert.ok(conflict.divergencias.includes('DATA_FECHAMENTO_CONFLITANTE'));
});

test('SQL de sincronização recebe a data da fonte e nunca a data atual', () => {
  assert.match(orderUpdateSql, /data_fechamento=\$4::date/);
  assert.match(orderUpdateSql, /WHERE id=\$5::uuid/);
  assert.doesNotMatch(orderUpdateSql, /CURRENT_DATE/);
});
