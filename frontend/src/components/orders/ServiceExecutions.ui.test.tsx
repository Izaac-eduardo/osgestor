import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import test from 'node:test'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import userEvent from '@testing-library/user-event'
import { api } from '../../services/api'
import { ServiceExecutions } from './ServiceExecutions'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/ordens-servico' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, Node: dom.window.Node, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, HTMLSelectElement: dom.window.HTMLSelectElement, HTMLButtonElement: dom.window.HTMLButtonElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent })
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
;(dom.window.HTMLElement.prototype as HTMLElement & { attachEvent?: () => void; detachEvent?: () => void }).attachEvent = () => undefined
;(dom.window.HTMLElement.prototype as HTMLElement & { attachEvent?: () => void; detachEvent?: () => void }).detachEvent = () => undefined

const service = { id: 'service-1', ordem_servico_id: 'order-1', descricao: 'Mão de obra', valor: 100, classificacao_servico: 'INTERNO', classificacao_origem: 'MANUAL', categoria_gerencial: null, subcategoria_gerencial: null, execucoes: [{ id: 'execution-1', servico_os_id: 'service-1', funcionario_id: 'employee-1', funcionario_nome: 'MARCELO', inicio: '2026-11-06T08:10', fim: '2026-11-06T09:30', duracao_minutos: 80, created_at: '', updated_at: '' }], created_at: '', updated_at: '' } as never
const employee = { id: 'employee-1', nome: 'MARCELO', matricula: null, cargo: null, status: 'ATIVO' } as never

async function render() {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  let refreshed = 0
  await act(async () => { root.render(<form onSubmit={event => event.preventDefault()}><ServiceExecutions orderId="order-1" service={service} employees={[employee]} onRefresh={async () => { refreshed += 1 }} /></form>) })
  return { container, root, get refreshed() { return refreshed } }
}

test('clique real em Salvar período inicia a requisição e mantém a O.S. na interface', async () => {
  const originalPut = api.put
  let payload: unknown
  ;(api as any).put = async (_url: string, value: unknown) => { payload = value; return { data: { id: 'execution-1' } } }
  const view = await render()
  try {
    const user = userEvent.setup({ document: dom.window.document })
    await act(async () => {
      await user.click(view.container.querySelector('button[aria-label="Editar período"]')!)
      await user.click(Array.from(view.container.querySelectorAll('button')).find(button => button.textContent?.includes('Salvar período'))!)
    })
    assert.deepEqual(payload, { funcionario_id: 'employee-1', inicio: '2026-11-06T08:10', fim: '2026-11-06T09:30' }, view.container.textContent)
    assert.equal(view.refreshed, 1)
    assert.equal(window.location.pathname, '/ordens-servico')
    assert.ok(view.container.querySelector('.service-executions'))
  } finally { ;(api as any).put = originalPut; await act(async () => rootUnmount(view.root)); view.container.remove() }
})

test('clique com período inválido mostra erro e não inicia requisição', async () => {
  const originalPost = api.post
  let requests = 0
  ;(api as any).post = async () => { requests += 1; return { data: {} } }
  const view = await render()
  try {
    const user = userEvent.setup({ document: dom.window.document })
    await act(async () => {
      await user.click(view.container.querySelector('.button-link')!)
      await user.click(Array.from(view.container.querySelectorAll('button')).find(button => button.textContent?.includes('Salvar período'))!)
    })
    assert.equal(requests, 0)
    assert.match(view.container.textContent || '', /Selecione o funcionário/)
  } finally { ;(api as any).post = originalPost; await act(async () => rootUnmount(view.root)); view.container.remove() }
})

async function rootUnmount(root: ReturnType<typeof createRoot>) { root.unmount() }
