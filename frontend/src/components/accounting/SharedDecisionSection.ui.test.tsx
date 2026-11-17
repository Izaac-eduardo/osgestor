import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import userEvent from '@testing-library/user-event'
import test from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ManualDecisionBlock } from '../../types/accounting-decision'
import type { Fleet } from '../../types/fleets'
import { getImportDecisionErrorMessage } from '../../utils/import-decision-error'
import { SharedDecisionSection, type SharedDecisionItem } from './SharedDecisionSection'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/importar-contabilidade' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, Node: dom.window.Node, HTMLElement: dom.window.HTMLElement, HTMLSelectElement: dom.window.HTMLSelectElement, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true })
Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {} })
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })

const cases = [
  { codigo: 'AMBIGUOUS_FUEL_CLASSIFICATION', expected: 'Combust\u00edvel com classifica\u00e7\u00e3o amb\u00edgua.' },
  { codigo: 'DUPLICATE_IN_FILE', expected: 'Poss\u00edvel duplicidade dentro do arquivo.' },
  { codigo: 'DUPLICATE_IN_PREVIOUS_IMPORT', expected: 'Lan\u00e7amento j\u00e1 encontrado em importa\u00e7\u00e3o anterior.' },
  { codigo: 'INVALID_ACCOUNTING_PERIOD', expected: 'Data ausente ou anterior ao in\u00edcio da compet\u00eancia autorizada (01/11/2026).' },
  { codigo: 'INVALID_TOTAL_VALUE', expected: 'Valor total ausente ou inv\u00e1lido.' },
] as const

test('shows each blocking reason, labels the item blocked, and disables every decision action', async () => {
  const items = cases.map((entry, index) => {
    const reason: ManualDecisionBlock = { codigo: entry.codigo, mensagem: entry.expected }
    return { linha_original: index + 1, produto_original: `Linha ${index + 1}`, data_conta: '2026-11-03', valor_total: 140, frota_destino: null, despesa_compartilhada_status: 'AGUARDANDO_DECISAO', bloqueios_decisao: [reason], duplicado_no_arquivo: false, linhas_duplicadas: [], duplicidade_revisada: false, justificativa_duplicidade: null, revisada_por: null } satisfies SharedDecisionItem
  })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  let decisions = 0
  await act(async () => root.render(<SharedDecisionSection items={items} fleets={[] as Fleet[]} destinations={{}} busy={false} isAdmin onReviewDuplicate={() => undefined} onDestinationChange={() => undefined} onDecision={() => { decisions += 1 }} />))
  try {
    for (const entry of cases) {
      const row = container.querySelectorAll('tbody tr')[cases.indexOf(entry)]
      assert.ok(row?.textContent?.includes(entry.expected), entry.expected)
    }
    assert.equal(container.querySelectorAll('td').length, 30)
    assert.equal(Array.from(container.querySelectorAll('td:nth-child(5)')).every(cell => cell.textContent === 'BLOQUEADO'), true)
    const actions = Array.from(container.querySelectorAll('button'))
    assert.deepEqual(actions.map(button => button.textContent), ['Incluir', 'Desconsiderar', 'Manter pendente', 'Incluir', 'Desconsiderar', 'Manter pendente', 'Incluir', 'Desconsiderar', 'Manter pendente', 'Incluir', 'Desconsiderar', 'Manter pendente', 'Incluir', 'Desconsiderar', 'Manter pendente'])
    assert.ok(actions.every(button => button.disabled))
    assert.ok(Array.from(container.querySelectorAll('select')).every(select => select.disabled))
    assert.equal(decisions, 0)
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})

test('possible duplicate requires an ADMIN review and keeps inclusion disabled until review', async () => {
  const candidate: SharedDecisionItem = { linha_original: 3, produto_original: 'Palheta', data_conta: '2026-11-03', valor_total: 140, frota_destino: null, despesa_compartilhada_status: 'AGUARDANDO_DECISAO', bloqueios_decisao: [{ codigo: 'DUPLICATE_IN_FILE', mensagem: 'Possível duplicidade no arquivo.' }], duplicado_no_arquivo: true, linhas_duplicadas: [2, 3], duplicidade_revisada: false, justificativa_duplicidade: null, revisada_por: null }
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container); let review: string | null = null; let decisionCount = 0
  await act(async () => root.render(<SharedDecisionSection items={[candidate]} fleets={[] as Fleet[]} destinations={{}} busy={false} isAdmin onReviewDuplicate={(_item, justification) => { review = justification }} onDestinationChange={() => undefined} onDecision={() => { decisionCount += 1 }} />))
  try {
    assert.match(container.textContent || '', /POSSÍVEL DUPLICIDADE/)
    const textarea = container.querySelector('textarea')!
    const user = userEvent.setup({ document })
    await act(async () => user.type(textarea, 'Conferido em documentos distintos.'))
    assert.equal(container.querySelector('button')?.disabled, false)
    await act(async () => user.click(container.querySelector('button')!))
    assert.equal(review, 'Conferido em documentos distintos.')
    assert.equal(decisionCount, 0)
  } finally { await act(async () => root.unmount()); container.remove() }
})

test('non-admin sees the review restriction but no review control', async () => {
  const item: SharedDecisionItem = { linha_original: 3, produto_original: 'Para-brisa', data_conta: '2026-11-03', valor_total: 1000, frota_destino: null, despesa_compartilhada_status: 'AGUARDANDO_DECISAO', bloqueios_decisao: [{ codigo: 'DUPLICATE_IN_FILE', mensagem: 'Possível coincidência no arquivo.' }], duplicado_no_arquivo: true, linhas_duplicadas: [2, 3], duplicidade_revisada: false, justificativa_duplicidade: null, revisada_por: null }
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(<SharedDecisionSection items={[item]} fleets={[] as Fleet[]} destinations={{}} busy={false} isAdmin={false} onReviewDuplicate={() => assert.fail('Non-admin cannot review')} onDestinationChange={() => undefined} onDecision={() => assert.fail('Blocked item cannot be decided')} />))
  try {
    assert.match(container.textContent || '', /somente para ADMIN/i)
    assert.equal(container.querySelector('textarea'), null)
    assert.equal(container.querySelector('button'), null)
  } finally { await act(async () => root.unmount()); container.remove() }
})

test('displays the safe message returned by an HTTP 409 response', () => {
  const expected = 'Decis\u00e3o manual bloqueada: Poss\u00edvel duplicidade dentro do arquivo.'
  assert.equal(getImportDecisionErrorMessage({ response: { data: { code: 'DUPLICATE_IN_FILE', message: expected } } }, 'Fallback'), expected)
})
