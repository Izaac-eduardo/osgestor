import { Eye, Pencil, Trash2 } from 'lucide-react'
import type { ServiceOrder } from '../../types/orders'
import { formatCurrency, formatDate } from '../../utils/formatters'
import { orderCategoryLabels, orderNatureLabels } from '../../utils/orderLabels'
import { OrderStatusBadge } from './OrderStatusBadge'

type Props = {
  orders: ServiceOrder[]
  deletingId?: string
  onView: (id: string) => void
  onEdit: (id: string) => void
  onDelete: (order: ServiceOrder) => void
}

export function OrdersList(props: Props) {
  return (
    <>
      <div className="orders-table-wrap">
        <table className="orders-table">
          <thead>
            <tr>
              <th>O.S.</th><th>Frota</th><th>Obra</th><th>Natureza / categoria</th>
              <th>Status</th><th>Abertura</th><th>Fechamento</th><th>Total</th><th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {props.orders.map((order) => (
              <tr key={order.id}>
                <td><strong>#{order.numero_os}</strong></td>
                <td>{order.frota_codigo}</td>
                <td>{order.obra_nome}<small>{order.obra_codigo}</small></td>
                <td>
                  {orderNatureLabels[order.natureza_os]}
                  <small>{order.categoria_servico ? orderCategoryLabels[order.categoria_servico] : 'Sem categoria'}</small>
                </td>
                <td><OrderStatusBadge status={order.status} /></td>
                <td>{formatDate(order.data_abertura)}</td>
                <td>{formatDate(order.data_fechamento)}</td>
                <td>{formatCurrency(Number(order.total_os))}</td>
                <td><Actions order={order} {...props} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="orders-mobile-list">
        {props.orders.map((order) => (
          <article className="order-mobile-card" key={order.id}>
            <header>
              <div><small>Ordem de Serviço</small><strong>#{order.numero_os}</strong></div>
              <OrderStatusBadge status={order.status} />
            </header>
            <dl>
              <div><dt>Frota</dt><dd>{order.frota_codigo}</dd></div>
              <div><dt>Obra</dt><dd>{order.obra_nome}</dd></div>
              <div><dt>Data</dt><dd>{formatDate(order.data_abertura)}</dd></div>
              <div><dt>Total</dt><dd>{formatCurrency(Number(order.total_os))}</dd></div>
            </dl>
            <Actions order={order} {...props} />
          </article>
        ))}
      </div>
    </>
  )
}

function Actions({ order, deletingId, onView, onEdit, onDelete }: Props & { order: ServiceOrder }) {
  const busy = deletingId === order.id
  return (
    <span className="order-actions">
      <button className="button button--secondary" disabled={busy} type="button" onClick={() => onView(order.id)}>
        <Eye size={16} />Visualizar
      </button>
      <button className="button button--secondary" disabled={busy} type="button" onClick={() => onEdit(order.id)}>
        <Pencil size={16} />Editar
      </button>
      <button className="button-link button-link--danger" disabled={busy} type="button" onClick={() => onDelete(order)}>
        <Trash2 size={16} />{busy ? 'Excluindo...' : 'Excluir'}
      </button>
    </span>
  )
}
