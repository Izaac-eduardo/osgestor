import assert from 'node:assert/strict'
import test from 'node:test'
import { duplicateOccurrenceLines, duplicateReviewInputError } from '../src/imports/contabilidade-duplicates.js'

const item = (line: number, product: string, date: string, document: string, productCode: string, value: number) => ({
  linhaOriginal: line, dataConta: date, notaOriginal: document, codigoProdutoOriginal: productCode,
  produtoOriginal: product, quantidade: 1, valorUnitario: value, valorTotal: value,
  subcentroOriginal: 'FROTAS DIVERSAS', planoContasOriginal: 'CUSTO PECAS / OFICINA',
})

test('os pares legítimos de palheta e para-brisa viram candidatos linha a linha', () => {
  const rows = [
    item(2, 'PALHETA LIMPADOR PARABRISA PVC2662 - AXOR', '2026-11-03', 'N-1', 'P-1', 140),
    item(3, 'PALHETA LIMPADOR PARABRISA PVC2662 - AXOR', '2026-11-03', 'N-1', 'P-1', 140),
    item(4, 'PARABRISA 9736710910 - MB AXOR', '2026-11-04', 'N-2', 'P-2', 1000),
    item(5, 'PARABRISA 9736710910 - MB AXOR', '2026-11-04', 'N-2', 'P-2', 1000),
  ]
  const candidates = duplicateOccurrenceLines(rows)
  assert.deepEqual([...candidates.keys()], [3, 5])
  assert.deepEqual(candidates.get(3), [2, 3])
  assert.deepEqual(candidates.get(5), [4, 5])
})

test('revisão exige ADMIN, linha pertencente ao grupo e justificativa razoável', () => {
  assert.equal(duplicateReviewInputError('OPERADOR', 3, [2, 3], 'Ocorrência legítima conferida.'), 'DUPLICATE_REVIEW_FORBIDDEN')
  assert.equal(duplicateReviewInputError('ADMIN', 3, [2], 'Ocorrência legítima conferida.'), 'DUPLICATE_REVIEW_NOT_CANDIDATE')
  assert.equal(duplicateReviewInputError('ADMIN', 3, [2, 3], 'ok'), 'INVALID_DUPLICATE_REVIEW_JUSTIFICATION')
  assert.equal(duplicateReviewInputError('ADMIN', 3, [2, 3], 'Conferido no documento fiscal; são ocorrências distintas.'), null)
})
