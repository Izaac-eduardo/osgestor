import '../styles/fleets.css'
import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Plus, Search, SearchX } from 'lucide-react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorState } from '../components/ErrorState'
import { PageHeader } from '../components/PageHeader'
import { OrdersLoading } from '../components/orders/OrdersLoading'
import { FleetFormModal } from '../components/fleets/FleetFormModal'
import { FleetsList } from '../components/fleets/FleetsList'
import { createFleet, deleteFleet, getFleet, getFleets, updateFleet, updateFleetStatus } from '../services/fleets'
import { PrefixosFrotaPage } from './PrefixosFrotaPage'
import type { Fleet, FleetPayload, FleetStatus } from '../types/fleets'

const message = (error: unknown, fallback: string) => axios.isAxiosError<{ message?: string }>(error) && [400, 404, 409].includes(error.response?.status ?? 0) ? error.response?.data?.message || fallback : fallback
export function FrotasPage() {
  const [tab, setTab] = useState<'frotas' | 'prefixos'>('frotas')
  return <><nav className="fleet-tabs" aria-label="Cadastros de frota">
    <button className={'button button--' + (tab === 'frotas' ? 'primary' : 'secondary')} aria-pressed={tab === 'frotas'} onClick={() => setTab('frotas')}>Frotas / Equipamentos</button>
    <button className={'button button--' + (tab === 'prefixos' ? 'primary' : 'secondary')} aria-pressed={tab === 'prefixos'} onClick={() => setTab('prefixos')}>Prefixos</button>
  </nav>{tab === 'frotas' ? <FleetRegister /> : <PrefixosFrotaPage />}</>
}
function FleetRegister() {
  const [items, setItems] = useState<Fleet[]>([])
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(false)
  const [search, setSearch] = useState(''), [status, setStatus] = useState<'TODOS' | FleetStatus>('TODOS')
  const [editing, setEditing] = useState<Fleet | null | undefined>(undefined)
  const [saving, setSaving] = useState(false), [formError, setFormError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<{ kind: 'delete' | 'status'; item: Fleet } | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null), [busyId, setBusyId] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null), [actionError, setActionError] = useState<string | null>(null)
  const load = async () => {
    setLoading(true); setLoadError(false)
    try { setItems(await getFleets()) } catch { setLoadError(true) } finally { setLoading(false) }
  }
  useEffect(() => {
    let active = true
    getFleets().then(data => { if (active) setItems(data) }).catch(() => { if (active) setLoadError(true) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => { if (!success) return; const timer = setTimeout(() => setSuccess(null), 5000); return () => clearTimeout(timer) }, [success])
  const filtered = useMemo(() => {
    const raw = search.trim().toUpperCase(), compact = raw.replace(/[\s-]+/g, '')
    return items.filter(item => (status === 'TODOS' || item.status === status) && (!raw ||
      [item.descricao, item.modelo].some(value => value?.toUpperCase().includes(raw)) ||
      (Boolean(compact) && [item.codigo, item.placa].some(value => value?.toUpperCase().includes(compact)))))
  }, [items, search, status])
  const edit = async (id: string) => {
    if (busyId) return
    setBusyId(id); setFormError(null); setActionError(null)
    try { setEditing(await getFleet(id)) } catch (error) { setActionError(message(error, 'Não foi possível carregar a frota.')) } finally { setBusyId(null) }
  }
  const save = async (payload: FleetPayload) => {
    if (saving || editing === undefined) return
    setSaving(true); setFormError(null)
    try {
      await (editing ? updateFleet(editing.id, payload) : createFleet(payload))
      setEditing(undefined); setSuccess('Frota salva com sucesso.'); await load()
    } catch (error) { setFormError(message(error, 'Não foi possível salvar a frota.')) } finally { setSaving(false) }
  }
  const execute = async () => {
    if (!confirmation || busyId) return
    const { item, kind } = confirmation
    setBusyId(item.id); setConfirmError(null)
    try {
      if (kind === 'delete') await deleteFleet(item.id)
      else await updateFleetStatus(item.id, item.status === 'ATIVO' ? 'INATIVO' : 'ATIVO')
      setConfirmation(null); setSuccess(kind === 'delete' ? 'Frota excluída.' : 'Status atualizado.'); await load()
    } catch (error) { setConfirmError(message(error, 'Não foi possível concluir a operação.')) } finally { setBusyId(null) }
  }
  const ask = (kind: 'delete' | 'status', item: Fleet) => { setConfirmError(null); setConfirmation({ kind, item }) }
  return <><PageHeader title="Frotas" subtitle="Cadastro de veículos e equipamentos da oficina." action={<button className="button button--primary" disabled={busyId !== null} onClick={() => { setFormError(null); setEditing(null) }}><Plus size={18} />Nova frota</button>} />
    {success && <div className="success-banner" role="status">{success}</div>}
    {actionError && <p className="form-api-error" role="alert">{actionError}</p>}
    <section className="projects-toolbar"><label><span className="sr-only">Buscar por frota, descrição, placa ou modelo</span><Search size={18} /><input placeholder="Buscar por frota, descrição, placa ou modelo" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <label>Status<select aria-label="Filtrar por status" value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="TODOS">Todos</option><option value="ATIVO">Ativos</option><option value="INATIVO">Inativos</option></select></label></section>
    <section className="projects-results" aria-live="polite"><header><div><h2>Frotas cadastradas</h2><p>{!loading && !loadError ? filtered.length + ' registro(s) encontrado(s)' : 'Consulta ao cadastro de frotas'}</p></div></header>
      {loading ? <OrdersLoading /> : loadError ? <ErrorState message="Não foi possível carregar as frotas." onRetry={() => void load()} /> : filtered.length ? <FleetsList items={filtered} busyId={busyId} onEdit={id => void edit(id)} onStatus={item => ask('status', item)} onDelete={item => ask('delete', item)} /> :
        <div className="orders-message"><SearchX /><div><h3>{items.length ? 'Nenhuma frota encontrada para os filtros informados.' : 'Nenhuma frota cadastrada.'}</h3><p>{items.length ? 'Revise a busca ou o status selecionado.' : 'Cadastre um veículo ou equipamento para começar.'}</p></div></div>}
    </section>
    {editing !== undefined && <FleetFormModal item={editing} saving={saving} error={formError} onClose={() => { if (!saving) setEditing(undefined) }} onSave={payload => void save(payload)} />}
    {confirmation && <ConfirmDialog title={confirmation.kind === 'delete' ? 'Excluir frota?' : 'Alterar status da frota?'} message={confirmation.kind === 'delete' ? 'Excluir permanentemente ' + confirmation.item.codigo + '? Para preservar o cadastro histórico, prefira desativar. As O.S. existentes serão preservadas.' : 'Confirma a alteração de status de ' + confirmation.item.codigo + '?'} busy={busyId !== null} error={confirmError} confirmLabel={confirmation.kind === 'delete' ? 'Excluir' : 'Confirmar'} busyLabel="Processando..." onCancel={() => { if (!busyId) setConfirmation(null) }} onConfirm={() => void execute()} />}
  </>
}