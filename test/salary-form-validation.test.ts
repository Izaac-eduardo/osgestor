import assert from 'node:assert/strict'
import test from 'node:test'
import { validateSalaryValue } from '../frontend/src/utils/salary-validation.ts'

test('formulário salarial aceita valor mensal brasileiro válido', () => {
  assert.equal(validateSalaryValue('1234,50'), null)
  assert.equal(validateSalaryValue('0'), null)
})

test('formulário salarial rejeita valores inválidos', () => {
  assert.ok(validateSalaryValue('-1,00'))
  assert.ok(validateSalaryValue('12,345'))
  assert.ok(validateSalaryValue('abc'))
})
