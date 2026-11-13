import assert from 'node:assert/strict'
import test from 'node:test'
import { manualDecisionBlockReasons } from '../src/imports/contabilidade-decision.js'

const clear = { combustivel_status: null, duplicado_no_arquivo: false, duplicado_em_importacao_anterior: false, fora_periodo_autorizado: false, valor_total_invalido: false }
const cases = [
  ['ambiguous fuel', { combustivel_status: 'AMBIGUO' }, 'Combust\u00edvel com classifica\u00e7\u00e3o amb\u00edgua.'],
  ['duplicate in file', { duplicado_no_arquivo: true }, 'Poss\u00edvel duplicidade dentro do arquivo.'],
  ['duplicate in prior import', { duplicado_em_importacao_anterior: true }, 'Lan\u00e7amento j\u00e1 encontrado em importa\u00e7\u00e3o anterior.'],
  ['unauthorized period', { fora_periodo_autorizado: true }, 'Data ausente ou anterior ao in\u00edcio da compet\u00eancia autorizada (01/11/2026).'],
  ['invalid total', { valor_total_invalido: true }, 'Valor total ausente ou inv\u00e1lido.'],
] as const

for (const [name, flags, expected] of cases) {
  test(`backend returns a specific safe reason for ${name}`, () => {
    assert.deepEqual(manualDecisionBlockReasons({ ...clear, ...flags }), [expected])
  })
}

test('items without blocking inconsistencies remain eligible for manual decision', () => {
  assert.deepEqual(manualDecisionBlockReasons(clear), [])
})
