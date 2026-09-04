import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { AlertCircle, Plus, SearchX } from 'lucide-react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PageHeader } from '../components/PageHeader'
import { OrderDetailsModal } from '../components/orders/OrderDetailsModal'
import { OrderFormModal } from '../components/orders/OrderFormModal'
import { OrdersFilters } from '../components/orders/OrdersFilters'
import { OrdersList } from '../components/orders/OrdersList'
import { OrdersLoading } from '../components/orders/OrdersLoading'
import {
  createServiceOrder,
  deleteServiceOrder,
  getFleetPrefixes,
  getProjects,
  getServiceOrder,
  getServiceOrderDetails,
  getServiceOrders,
  updateServiceOrder,
} from '../services/orders'
import type {
  FleetPrefixOption,
  OrderFilters,
  OrderPayload,
  ProjectOption,
  ServiceOrder,
  ServiceOrderDetails,
} from '../types/orders'

type DeleteTarget = Pick<ServiceOrder, 'id' | 'numero_os'>

export function OrdensServicoPage() {
  const [draft, setDraft] = useState<OrderFilters>({})
  const [filters, setFilters] = useState<OrderFilters>({})
  const [orders, setOrders] = useState<ServiceOrder[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [prefixes, setPrefixes] = useState<FleetPrefixOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [details, setDetails] = useState<ServiceOrderDetails | null>(null)
  const [detailsError, setDetailsError] = useState(false)
  const [editing, setEditing] = useState<ServiceOrder | null | undefined>(undefined)
  const [maintenanceDetails, setMaintenanceDetails] = useState<ServiceOrderDetails | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [modalSuccess, setModalSuccess] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const filtered = useMemo(() => Object.values(filters).some(Boolean), [filters])

  const load = useCallback(async (currentFilters: OrderFilters, signal?: AbortSignal) => {
    setLoading(true)
    setError(false)
    try {
      setOrders(await getServiceOrders(currentFilters, signal))
    } catch {
      if (!signal?.aborted) setError(true)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(filters, controller.signal)
    return () => controller.abort()
  }, [filters, load])

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([getProjects(controller.signal), getFleetPrefixes(controller.signal)])
      .then(([projectOptions, prefixOptions]) => {
        setProjects(projectOptions)
        setPrefixes(prefixOptions)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!success) return
    const timer = setTimeout(() => setSuccess(null), 5000)
    return () => clearTimeout(timer)
  }, [success])

  const open = async (id: string) => {
    setSelected(id)
    setDetails(null)
    setDetailsError(false)
    try {
      setDetails(await getServiceOrderDetails(id))
    } catch {
      setDetailsError(true)
    }
  }

  const edit = async (id: string) => {
    setSaveError(null)
    setModalSuccess(null)
    setMaintenanceDetails(null)
    try {
      const [order, fullDetails] = await Promise.all([
        getServiceOrder(id),
        getServiceOrderDetails(id),
      ])
      setEditing(order)
      setMaintenanceDetails(fullDetails)
    } catch {
      setSuccess('Não foi possível carregar a Ordem de Serviço para edição.')
    }
  }

  const save = async (payload: OrderPayload) => {
    if (saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const isEdit = editing !== null
      const saved = isEdit
        ? await updateServiceOrder(editing!.id, payload)
        : await createServiceOrder(payload)
      setEditing(saved)
      setMaintenanceDetails(await getServiceOrderDetails(saved.id))
      const feedback = isEdit
        ? 'Ordem de Serviço atualizada com sucesso.'
        : 'O.S. criada com sucesso.'
      setModalSuccess(feedback)
      setSuccess(feedback)
      await load(filters)
    } catch (caught) {
      const status = axios.isAxiosError(caught) ? caught.response?.status : undefined
      const message = axios.isAxiosError<{ message?: string }>(caught)
        ? caught.response?.data?.message
        : undefined
      setSaveError(
        status === 400 || status === 404 || status === 409
          ? message || 'Verifique os dados informados.'
          : 'Não foi possível salvar a Ordem de Serviço.',
      )
    } finally {
      setSaving(false)
    }
  }

  const requestDelete = (order: DeleteTarget) => {
    setDeleteError(null)
    setDeleteTarget(order)
  }

  const remove = async () => {
    if (!deleteTarget || deleting) return
    const target = deleteTarget
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteServiceOrder(target.id)
      setOrders((current) => current.filter((order) => order.id !== target.id))
      setDeleteTarget(null)
      if (selected === target.id) {
        setSelected(null)
        setDetails(null)
      }
      setSuccess('O.S. excluída com sucesso.')
    } catch (caught) {
      const status = axios.isAxiosError(caught) ? caught.response?.status : undefined
      const backend = axios.isAxiosError<{ message?: string }>(caught)
        ? caught.response?.data?.message
        : undefined
      setDeleteError(
        status === 404
          ? 'Ordem de Serviço não encontrada.'
          : status === 400 || status === 409
            ? backend || 'Não foi possível excluir esta Ordem de Serviço.'
            : 'Não foi possível excluir a Ordem de Serviço. Tente novamente.',
      )
    } finally {
      setDeleting(false)
    }
  }

  const clear = () => {
    setDraft({})
    setFilters({})
  }

  return (
    <>
      <PageHeader
        title="Ordens de Serviço"
        subtitle="Consulte e mantenha os dados principais das ordens."
        action={
          <button className="button button--primary" onClick={() => {
            setSaveError(null)
            setModalSuccess(null)
            setMaintenanceDetails(null)
            setEditing(null)
          }}>
            <Plus size={18} />Nova O.S.
          </button>
        }
      />
      {success && <div className="success-banner" role="status">{success}</div>}
      <OrdersFilters
        filters={draft}
        setFilters={setDraft}
        projects={projects}
        prefixes={prefixes}
        loadingOptions={!projects.length || !prefixes.length}
        onSubmit={() => setFilters({ ...draft })}
        onClear={clear}
      />
      <section aria-live="polite" className="orders-results">
        <header>
          <h2>Ordens cadastradas</h2>
          <p>{!loading && !error ? `${orders.length} registro(s) encontrado(s)` : 'Consulta ao cadastro de ordens'}</p>
        </header>
        {loading
          ? <OrdersLoading />
          : error
            ? <Message
                error
                title="Não foi possível carregar as Ordens de Serviço."
                text="Verifique a conexão e tente novamente."
                action={<button className="button button--secondary" onClick={() => void load(filters)}>Tentar novamente</button>}
              />
            : orders.length
              ? <OrdersList
                  orders={orders}
                  deletingId={deleting ? deleteTarget?.id : undefined}
                  onView={(id) => void open(id)}
                  onEdit={(id) => void edit(id)}
                  onDelete={requestDelete}
                />
              : <Message
                  title={filtered
                    ? 'Nenhuma Ordem de Serviço encontrada com os filtros informados.'
                    : 'Nenhuma Ordem de Serviço cadastrada.'}
                  text={filtered
                    ? 'Revise os campos ou limpe os filtros.'
                    : 'Quando houver ordens, elas aparecerão aqui.'}
                  action={filtered
                    ? <button className="button button--secondary" onClick={clear}>Limpar filtros</button>
                    : undefined}
                />}
      </section>
      {selected && (
        <OrderDetailsModal
          order={details}
          loading={!details && !detailsError}
          error={detailsError}
          onClose={() => setSelected(null)}
          onRetry={() => void open(selected)}
          onDelete={() => details && requestDelete(details)}
          onMutated={async (financial, message) => {
            setDetails(await getServiceOrderDetails(selected))
            if (financial) await load(filters)
            setSuccess(message)
          }}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title={`Excluir O.S. ${deleteTarget.numero_os}?`}
          message="Esta ação excluirá permanentemente a ordem de serviço e seus dados relacionados. Essa ação não poderá ser desfeita."
          busy={deleting}
          error={deleteError}
          confirmLabel="Excluir O.S."
          busyLabel="Excluindo..."
          onCancel={() => !deleting && setDeleteTarget(null)}
          onConfirm={() => void remove()}
        />
      )}
      {editing !== undefined && (
        <OrderFormModal
          order={editing}
          details={maintenanceDetails}
          success={modalSuccess}
          projects={projects}
          prefixes={prefixes}
          saving={saving}
          apiError={saveError}
          onClose={() => {
            if (!saving) {
              setEditing(undefined)
              setMaintenanceDetails(null)
            }
          }}
          onItemsRefresh={async (financial, message) => {
            if (!editing) return
            setMaintenanceDetails(await getServiceOrderDetails(editing.id))
            if (financial) await load(filters)
            setModalSuccess(message)
            setSuccess(message)
          }}
          onSave={(payload) => void save(payload)}
        />
      )}
    </>
  )
}

function Message({
  error,
  title,
  text,
  action,
}: {
  error?: boolean
  title: string
  text: string
  action?: React.ReactNode
}) {
  const Icon = error ? AlertCircle : SearchX
  return (
    <div className={`orders-message${error ? ' orders-message--error' : ''}`}>
      <Icon />
      <div><h3>{title}</h3><p>{text}</p></div>
      {action}
    </div>
  )
}
