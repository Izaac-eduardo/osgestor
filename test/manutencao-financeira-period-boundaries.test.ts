import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const serviceSource = readFileSync(new URL('../src/services/manutencao-financeira.service.ts', import.meta.url), 'utf8')
const frontendSource = readFileSync(new URL('../frontend/src/services/maintenance.ts', import.meta.url), 'utf8')
const reportSource = readFileSync(new URL('../frontend/src/pages/RelatoriosPage.tsx', import.meta.url), 'utf8')

test('preserva os limites 27/10/2026 e 05/11/2026 no contrato de filtros', () => {
  const filters = { data_inicio: '2026-10-27', data_fim: '2026-11-05' }
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value))
  assert.equal(params.data_inicio, '2026-10-27')
  assert.equal(params.data_fim, '2026-11-05')
  assert.match(frontendSource, /Object\.entries\(filters\)/)
})

test('consultas financeiras usam intervalo DATE inclusivo pela abertura da O.S.', () => {
  const dataContaConditions = (serviceSource.match(/l\.data_conta BETWEEN \$1::date AND \$2::date/g) ?? []).length
  const dataAberturaConditions = (serviceSource.match(/os\.data_abertura BETWEEN \$1::date AND \$2::date/g) ?? []).length
  assert.ok(dataContaConditions >= 3, 'contabilidade deve usar data_conta em totais, detalhes e consolidação')
  assert.ok(dataAberturaConditions >= 4, 'materiais e mão de obra devem usar data_abertura nas consultas financeiras')
  assert.doesNotMatch(serviceSource, /l\.data_conta\s*<\s*\$2/)
  assert.doesNotMatch(serviceSource, /os\.data_fechamento\s+BETWEEN\s+\$1::date\s+AND\s+\$2::date/)
  assert.doesNotMatch(serviceSource, /os\.status='FINALIZADA'\s+AND\s+(?:os\.)?data_abertura/)
  assert.match(serviceSource, /os\.status<>'CANCELADA'/)
})

test('filtro frota_codigo é encaminhado às consultas financeiras sem substituir frota_id', () => {
  assert.match(serviceSource, /frota_codigo\?\.trim\(\) \|\| null/)
  assert.match(serviceSource, /f\.codigo=\$6/)
  assert.match(reportSource, /frota_codigo/)
})
