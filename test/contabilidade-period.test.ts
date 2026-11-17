import assert from 'node:assert/strict'
import test from 'node:test'
import { accountingDateOutsidePeriod, accountingPeriodsOverlap, parseAccountingPeriod } from '../src/imports/contabilidade-period.js'

test('exige intervalo válido desde a competência contábil mínima', () => {
  assert.deepEqual(parseAccountingPeriod('2026-11-01', '2026-11-30'), { inicio: '2026-11-01', fim: '2026-11-30' })
  assert.throws(() => parseAccountingPeriod('2026-10-31', '2026-11-30'), /anterior/)
  assert.throws(() => parseAccountingPeriod('2026-11-30', '2026-11-01'), /anterior ou igual/)
  assert.throws(() => parseAccountingPeriod('2026-02-30', '2026-03-01'), /datas v/)
})

test('compara Data Conta nos limites inclusivos e rejeita datas fora do período', () => {
  const period = { inicio: '2026-11-01', fim: '2026-11-05' }
  assert.equal(accountingDateOutsidePeriod('2026-11-01', period), false)
  assert.equal(accountingDateOutsidePeriod('2026-11-05', period), false)
  assert.equal(accountingDateOutsidePeriod('2026-10-31', period), true)
  assert.equal(accountingDateOutsidePeriod('2026-11-06', period), true)
  assert.equal(accountingDateOutsidePeriod(null, period), true)
})

test('intervalos adjacentes não se sobrepõem; datas de fronteira compartilhadas se sobrepõem', () => {
  assert.equal(accountingPeriodsOverlap({ inicio: '2026-11-01', fim: '2026-11-15' }, { inicio: '2026-11-16', fim: '2026-11-30' }), false)
  assert.equal(accountingPeriodsOverlap({ inicio: '2026-11-01', fim: '2026-11-16' }, { inicio: '2026-11-16', fim: '2026-11-30' }), true)
})
