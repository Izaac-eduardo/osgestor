import assert from 'node:assert/strict'
import test from 'node:test'
import { countMaintenanceLaunches } from '../frontend/src/utils/maintenance-summary.ts'

test('conta lançamentos a partir do detalhamento sem produzir undefined ou NaN', () => {
  const details = [{ data: '2026-11-01', referencia: 'DOC-1', categoria: 'PECAS_EXTERNAS', descricao: 'Peça', quantidade: 1, unidade: null, valor: '10.00', origem: 'CONTABILIDADE', prestador: null, funcionario: null, frota_id: 'fleet-1' }]
  assert.equal(countMaintenanceLaunches(details), 1)
  assert.equal(countMaintenanceLaunches([]), 0)
  assert.equal(countMaintenanceLaunches(null), null)
  assert.notEqual(String(countMaintenanceLaunches(details)), 'undefined')
  assert.equal(Number.isNaN(countMaintenanceLaunches(details) as number), false)
})
