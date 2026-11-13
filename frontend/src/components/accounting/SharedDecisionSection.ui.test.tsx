import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import test from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { manualDecisionBlockReasons } from '../../../../src/imports/contabilidade-decision.js'
import type { Fleet } from '../../types/fleets'
import { SharedDecisionSection, type SharedDecisionItem } from './SharedDecisionSection'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/importar-contabilidade' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, Node: dom.window.Node, HTMLElement: dom.window.HTMLElement, HTMLSelectElement: dom.window.HTMLSelectElement, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true })
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })

const clear = { combustivel_status: null, duplicado_no_arquivo: false, duplicado_em_importacao_anterior: false, fora_periodo_autorizado: false, valor_total_invalido: false }
const cases = [
  { flags: { combustivel_status: 'AMBIGUO' }, expected: 'Combust\u00edvel com classifica\u00e7\u00e3o amb\u00edgua.' },
  { flags: { duplicado_no_arquivo: true }, expected: 'Poss\u00edvel duplicidade dentro do arquivo.' },
  { flags: { duplicado_em_importacao_anterior: true }, expected: 'Lan\u00e7amento j\u00e1 encontrado em importa\u00e7\u00e3o anterior.' },
  { flags: { fora_periodo_autorizado: true }, expected: 'Data ausente ou anterior ao in\u00edcio da compet\u00eancia autorizada (01/11/2026).' },
  { flags: { valor_total_invalido: true }, expected: 'Valor total ausente ou inv\u00e1lido.' },
] as const

test('shows each blocking reason, labels the item blocked, and disables every decision action', async () => {
  const items = cases.map((entry, index) => {
    const flags = { ...clear, ...entry.flags }
    return { linha_original: index + 1, produto_original: `Linha ${index + 1}`, data_conta: '2026-11-03', valor_total: 140, frota_destino: null, despesa_compartilhada_status: 'AGUARDANDO_DECISAO', bloqueios_decisao: manualDecisionBlockReasons(flags) } satisfies SharedDecisionItem
  })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  let decisions = 0
  await act(async () => root.render(<SharedDecisionSection items={items} fleets={[] as Fleet[]} destinations={{}} busy={false} onDestinationChange={() => undefined} onDecision={() => { decisions += 1 }} />))
  try {
    for (const entry of cases) assert.ok(container.textContent?.includes(entry.expected), entry.expected)
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
