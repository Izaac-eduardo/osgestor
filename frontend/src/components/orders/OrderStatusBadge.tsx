import type{OrderStatus}from'../../types/orders';import{orderStatusLabels}from'../../utils/orderLabels'
export function OrderStatusBadge({status}:{status:OrderStatus}){return <span className={`status-badge status-badge--${status.toLowerCase()}`}>{orderStatusLabels[status]}</span>}
