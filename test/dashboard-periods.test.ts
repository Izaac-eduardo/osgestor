import test from 'node:test';
import assert from 'node:assert/strict';
import { activeDashboardPreset, dashboardPeriod } from '../frontend/src/utils/dashboard-periods.ts';

const today = new Date(2026, 9, 6);

test('dashboard usa a semana corrente de segunda-feira até hoje', () => {
  assert.deepEqual(dashboardPeriod('week', today), { data_inicio: '2026-10-05', data_fim: '2026-10-06' });
  assert.equal(activeDashboardPreset(dashboardPeriod('week', today), today), 'week');
});

test('dashboard calcula janela móvel de 15 dias e mês corrente', () => {
  assert.deepEqual(dashboardPeriod('15days', today), { data_inicio: '2026-09-22', data_fim: '2026-10-06' });
  assert.deepEqual(dashboardPeriod('month', today), { data_inicio: '2026-10-01', data_fim: '2026-10-06' });
  assert.equal(activeDashboardPreset({ data_inicio: '2026-10-02', data_fim: '2026-10-06' }, today), null);
});
