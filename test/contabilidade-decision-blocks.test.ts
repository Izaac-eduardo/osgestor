import assert from 'node:assert/strict'
import test from 'node:test'
import { MANUAL_DECISION_BLOCK_CODES as backendBlockCodes, manualDecisionBlocks } from '../src/imports/contabilidade-decision.js'
import { serializeContabilidadeError } from '../src/imports/contabilidade-error-response.js'
import { MANUAL_DECISION_BLOCK_CODES as frontendBlockCodes } from '../frontend/src/types/accounting-decision.ts'

const clear = { combustivel_status: null, duplicado_no_arquivo: false, duplicado_em_importacao_anterior: false, fora_periodo_autorizado: false, valor_total_invalido: false }
const cases = [
  ['ambiguous fuel', { combustivel_status: 'AMBIGUO' }, 'AMBIGUOUS_FUEL_CLASSIFICATION', 'Combust\u00edvel com classifica\u00e7\u00e3o amb\u00edgua.'],
  ['duplicate in file', { duplicado_no_arquivo: true }, 'DUPLICATE_IN_FILE', 'Poss\u00edvel duplicidade dentro do arquivo.'],
  ['duplicate in prior import', { duplicado_em_importacao_anterior: true }, 'DUPLICATE_IN_PREVIOUS_IMPORT', 'Lan\u00e7amento j\u00e1 encontrado em importa\u00e7\u00e3o anterior.'],
  ['unauthorized period', { fora_periodo_autorizado: true }, 'INVALID_ACCOUNTING_PERIOD', 'Data Conta ausente ou fora do per\u00edodo informado (compet\u00eancia a partir de 01/11/2026).'],
  ['invalid total', { valor_total_invalido: true }, 'INVALID_TOTAL_VALUE', 'Valor total ausente ou inv\u00e1lido.'],
] as const

test('frontend and backend expose the same blocking reason codes', () => {
  assert.deepEqual(frontendBlockCodes, backendBlockCodes)
})

for (const [name, flags, codigo, mensagem] of cases) {
  test(`backend returns a specific safe reason for ${name}`, () => {
    assert.deepEqual(manualDecisionBlocks({ ...clear, ...flags }), [{ codigo, mensagem }])
  })
}

test('items without blocking inconsistencies remain eligible for manual decision', () => {
  assert.deepEqual(manualDecisionBlocks(clear), [])
})

test('409 serializer returns a stable code, specific message, and structured blocking reasons', () => {
  const blocks = manualDecisionBlocks({ ...clear, duplicado_no_arquivo: true })
  const response = serializeContabilidadeError({ statusCode: 409, code: blocks[0]!.codigo, message: `Decis\u00e3o manual bloqueada: ${blocks[0]!.mensagem}`, blocks })
  assert.equal(response.status, 409)
  assert.deepEqual(response.body, {
    code: 'DUPLICATE_IN_FILE',
    message: 'Decis\u00e3o manual bloqueada: Poss\u00edvel duplicidade dentro do arquivo.',
    bloqueios: blocks,
  })
})

test('multiple blockers retain each code and message in the 409 response', () => {
  const blocks = manualDecisionBlocks({ ...clear, duplicado_no_arquivo: true, valor_total_invalido: true })
  const response = serializeContabilidadeError({ statusCode: 409, code: 'MANUAL_DECISION_BLOCKED', message: `Decis\u00e3o manual bloqueada: ${blocks.map(block => block.mensagem).join(' ')}`, blocks })
  assert.equal(response.status, 409)
  assert.equal(response.body.code, 'MANUAL_DECISION_BLOCKED')
  assert.deepEqual(response.body.bloqueios?.map(block => block.codigo), ['DUPLICATE_IN_FILE', 'INVALID_TOTAL_VALUE'])
})

test('non-blocking error serialization does not include blocker details', () => {
  assert.deepEqual(serializeContabilidadeError({ statusCode: 400, code: 'CONTABILIDADE_ERROR', message: 'Erro de valida\u00e7\u00e3o.' }), {
    status: 400,
    body: { code: 'CONTABILIDADE_ERROR', message: 'Erro de valida\u00e7\u00e3o.' },
  })
})
