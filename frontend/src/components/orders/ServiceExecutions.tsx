import { useMemo, useState } from 'react'
import axios from 'axios'
import { Clock3, Pencil, Plus, Trash2, X } from 'lucide-react'
import { ConfirmDialog } from '../ConfirmDialog'
import {
  createServiceExecution, removeServiceExecution, updateServiceExecution,
} from '../../services/orders'
import type {
  OrderEmployee, OrderService, ServiceExecution, ServiceExecutionPayload,
} from '../../types/orders'
import { formatDate, formatWorkDuration } from '../../utils/formatters'

type Props = {
  orderId: string
  service: OrderService
  employees: OrderEmployee[]
  onRefresh: (financial: boolean, message: string) => Promise<void>
}

export function ServiceExecutions({ orderId, service, employees, onRefresh }: Props) {
  const [editing, setEditing] = useState<ServiceExecution | null | undefined>(undefined)
  const [removing, setRemoving] = useState<ServiceExecution | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const total = useMemo(
    () => service.execucoes.reduce((sum, execution) => sum + execution.duracao_minutos, 0),
    [service.execucoes],
  )
  const message = (caught: unknown) => axios.isAxiosError<{ message?: string }>(caught)
    ? caught.response?.data?.message || 'Não foi possível salvar o período de trabalho.'
    : 'Não foi possível salvar o período de trabalho.'

  const save = async (payload: ServiceExecutionPayload) => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      if (editing) await updateServiceExecution(orderId, service.id, editing.id, payload)
      else await createServiceExecution(orderId, service.id, payload)
      setEditing(undefined)
      await onRefresh(false, editing ? 'Período atualizado com sucesso.' : 'Período adicionado com sucesso.')
    } catch (caught) { setError(message(caught)) }
    finally { setBusy(false) }
  }
  const remove = async () => {
    if (!removing || busy) return
    setBusy(true); setError(null)
    try {
      await removeServiceExecution(orderId, service.id, removing.id)
      setRemoving(null)
      await onRefresh(false, 'Período removido com sucesso.')
    } catch (caught) { setError(message(caught)) }
    finally { setBusy(false) }
  }

  return (
    <div className="service-executions">
      <div className="service-executions__header">
        <span><Clock3 size={15} /> Períodos de trabalho</span>
        <button className="button-link" type="button" onClick={() => { setError(null); setEditing(null) }}>
          <Plus size={14} />Adicionar período
        </button>
      </div>
      {service.execucoes.length
        ? service.execucoes.map((execution) => (
            <div className="service-execution" key={execution.id}>
              <span><strong>{execution.funcionario_nome}</strong><small>{formatDate(execution.inicio)} · {execution.inicio.slice(11,16)} → {execution.fim.slice(11,16)}</small></span>
      <strong>{formatWorkDuration(execution.duracao_minutos)}</strong>
              <span className="item-actions">
                <button className="icon-button" aria-label="Editar período" onClick={() => setEditing(execution)}><Pencil size={15}/></button>
                <button className="icon-button icon-button--danger" aria-label="Excluir período" onClick={() => setRemoving(execution)}><Trash2 size={15}/></button>
              </span>
            </div>
          ))
        : <small className="details-empty">Nenhum período de trabalho registrado.</small>}
      {total > 0 && <div className="service-executions__total">Tempo registrado no serviço: <strong>{formatWorkDuration(total)}</strong></div>}
      {editing !== undefined && (
        <ExecutionForm
          execution={editing}
          employees={employees}
          busy={busy}
          error={error}
          onClose={() => !busy && setEditing(undefined)}
          onSave={(payload) => void save(payload)}
        />
      )}
      {removing && <ConfirmDialog title="Excluir período de trabalho?" message={`Excluir o período de ${removing.funcionario_nome}? Esta ação não poderá ser desfeita.`} busy={busy} error={error} confirmLabel="Excluir período" onCancel={() => !busy && setRemoving(null)} onConfirm={() => void remove()} />}
    </div>
  )
}

function ExecutionForm({ execution, employees, busy, error, onClose, onSave }: {
  execution: ServiceExecution | null
  employees: OrderEmployee[]
  busy: boolean
  error: string | null
  onClose: () => void
  onSave: (payload: ServiceExecutionPayload) => void
}) {
  const [employee, setEmployee] = useState(execution?.funcionario_id ?? '')
  const [day, setDay] = useState(execution?.inicio.slice(0,10) ?? '')
  const [start, setStart] = useState(execution?.inicio.slice(11,16) ?? '')
  const [end, setEnd] = useState(execution?.fim.slice(11,16) ?? '')
  const minutes = day && start && end
    ? (new Date(`${day}T${end}`).getTime() - new Date(`${day}T${start}`).getTime()) / 60000
    : 0
  return <div className="nested-backdrop"><form className="item-form" onSubmit={(event) => {event.preventDefault();onSave({funcionario_id:employee,inicio:`${day}T${start}`,fim:`${day}T${end}`})}}>
    <header><h3>{execution ? 'Editar período de trabalho' : 'Adicionar período de trabalho'}</h3><button className="icon-button" type="button" onClick={onClose}><X/></button></header>
    <main>
      <label>Funcionário<select required value={employee} onChange={(event)=>setEmployee(event.target.value)}><option value="">Selecione</option>{employees.map((item)=><option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
      <label>Data<input required type="date" value={day} onChange={(event)=>setDay(event.target.value)}/></label>
      <div className="item-form__measurements"><label>Início<input required type="time" value={start} onChange={(event)=>setStart(event.target.value)}/></label><label>Término<input required type="time" value={end} onChange={(event)=>setEnd(event.target.value)}/></label></div>
      <div className="item-preview"><span>Duração</span><strong>{minutes > 0 ? formatWorkDuration(minutes) : '—'}</strong></div>
      {error && <p className="form-api-error" role="alert">{error}</p>}
    </main>
    <footer><button className="button button--secondary" disabled={busy} type="button" onClick={onClose}>Cancelar</button><button className="button button--primary" disabled={busy || minutes <= 0}>{busy ? 'Salvando...' : 'Salvar período'}</button></footer>
  </form></div>
}
