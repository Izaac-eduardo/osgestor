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
  { codigo: 'AMBIGUOUS_FUEL_CLASSIFICATION', expected: 'Combustível com classificação ambígua.' },
  { codigo: 'DUPLICATE_IN_FILE', expected: 'Possível duplicidade dentro do arquivo.' },
  { codigo: 'DUPLICATE_IN_PREVIOUS_IMPORT', expected: 'Lançamento já encontrado em importação anterior.' },
  { codigo: 'INVALID_ACCOUNTING_PERIOD', expected: 'Data Conta ausente ou fora do período informado.' },
  { codigo: 'INVALID_TOTAL_VALUE', expected: 'Valor total ausente ou inválido.' },
] as const

const baseItem = (overrides: Partial<SharedDecisionItem> = {}): SharedDecisionItem => ({
  linha_original: 3, produto_original: 'Palheta limpador para-brisa', data_conta: '2026-11-03', valor_total: 140,
  frota_destino: null, despesa_compartilhada_status: 'AGUARDANDO_DECISAO', bloqueios_decisao: [],
  duplicado_no_arquivo: false, linhas_duplicadas: [], duplicidade_revisada: false, revisada_por: null, ...overrides,
})

async function mount(node: React.ReactNode) {
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(node))
  return { container, unmount: async () => { await act(async () => root.unmount()); container.remove() } }
}

test('exibe cada bloqueio, situação amigável e desabilita decisões incompatíveis', async () => {
  const items = cases.map((entry, index) => baseItem({ linha_original: index + 1, produto_original: `Linha ${index + 1}`, bloqueios_decisao: [{ codigo: entry.codigo, mensagem: entry.expected } as ManualDecisionBlock] }))
  const view = await mount(<SharedDecisionSection items={items} fleets={[] as Fleet[]} destinations={{}} busy={false} isAdmin onReviewDuplicate={() => undefined} onDestinationChange={() => undefined} onDecision={() => assert.fail('Item bloqueado não pode ser decidido')} />)
  try {
    for (const [index, entry] of cases.entries()) assert.ok(view.container.querySelectorAll('tbody tr')[index]?.textContent?.includes(entry.expected))
    assert.equal(Array.from(view.container.querySelectorAll('.shared-decisions__status')).every(status => status.textContent === 'Bloqueado'), true)
    assert.ok(Array.from(view.container.querySelectorAll('button')).every(button => button.disabled))
    assert.ok(Array.from(view.container.querySelectorAll('select')).every(select => select.disabled))
  } finally { await view.unmount() }
})

test('ADMIN pode decidir uma possível repetição sem justificativa e vê data e valor formatados', async () => {
  const item = baseItem({ duplicado_no_arquivo: true, linhas_duplicadas: [2, 3], bloqueios_decisao: [{ codigo: 'DUPLICATE_IN_FILE', mensagem: 'Possível duplicidade dentro do arquivo.' }] })
  const decisions: string[] = []
  const view = await mount(<SharedDecisionSection items={[item]} fleets={[] as Fleet[]} destinations={{}} busy={false} isAdmin onReviewDuplicate={(_item, decision) => decisions.push(decision)} onDestinationChange={() => undefined} onDecision={() => assert.fail('Duplicidade deve passar pela decisão revisada')} />)
  try {
    assert.match(view.container.textContent || '', /Possível repetição/)
    assert.match(view.container.textContent || '', /03\/11\/2026/)
    assert.match(view.container.textContent || '', /R\$\s?140,00/)
    assert.equal(view.container.querySelector('textarea'), null)
    const user = userEvent.setup({ document })
    const buttons = Array.from(view.container.querySelectorAll('button'))
    assert.deepEqual(buttons.map(button => button.textContent), ['Aprovar como compartilhada', 'Desconsiderar'])
    await act(async () => user.click(buttons[0]!))
    await act(async () => user.click(buttons[1]!))
    assert.deepEqual(decisions, ['APROVAR', 'DESCONSIDERAR'])
  } finally { await view.unmount() }
})

test('non-admin sees the restriction but no duplicate decision actions', async () => {
  const item = baseItem({ produto_original: 'Para-brisa', valor_total: 1000, duplicado_no_arquivo: true, linhas_duplicadas: [2, 3], bloqueios_decisao: [{ codigo: 'DUPLICATE_IN_FILE', mensagem: 'Possível coincidência no arquivo.' }] })
  const view = await mount(<SharedDecisionSection items={[item]} fleets={[]} destinations={{}} busy={false} isAdmin={false} onReviewDuplicate={() => assert.fail('Non-admin cannot review')} onDestinationChange={() => undefined} onDecision={() => assert.fail('Non-admin cannot decide')} />)
  try {
    assert.match(view.container.textContent || '', /Somente ADMIN pode decidir/)
    assert.deepEqual(Array.from(view.container.querySelectorAll('button')).map(button => button.disabled), [true, true])
    assert.ok(Array.from(view.container.querySelectorAll('button')).every(button => button.disabled))
  } finally { await view.unmount() }
})

test('displays the safe message returned by an HTTP 409 response', () => {
  const expected = 'Decisão manual bloqueada: Possível duplicidade dentro do arquivo.'
  assert.equal(getImportDecisionErrorMessage({ response: { data: { code: 'DUPLICATE_IN_FILE', message: expected } } }, 'Fallback'), expected)
})
