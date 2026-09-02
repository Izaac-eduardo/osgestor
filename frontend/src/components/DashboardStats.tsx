import { Banknote, CircleCheckBig, CircleGauge, CirclePlay, Clock3 } from 'lucide-react'
import type { AsyncSection } from '../hooks/useDashboardData'
import type { DashboardSummary } from '../types/reports'
import { formatCurrency } from '../utils/formatters'
import { ErrorState } from './ErrorState'
import { LoadingSkeleton } from './LoadingSkeleton'
import { StatCard } from './StatCard'

export function DashboardStats({ state, onRetry }: { state: AsyncSection<DashboardSummary>; onRetry: () => void }) {
  if (state.loading) return <section className="stats-grid" aria-label="Carregando indicadores">{Array.from({length:5},(_,index)=><article className="stat-card" key={index}><LoadingSkeleton lines={2}/></article>)}</section>
  if (state.error || !state.data) return <section className="dashboard-section dashboard-section--full"><ErrorState onRetry={onRetry}/></section>
  const stats = [
    { label:'Total de O.S.', value:String(state.data.quantidade_os), icon:CircleGauge, tone:'blue' as const },
    { label:'O.S. Abertas', value:String(state.data.os_abertas), icon:Clock3, tone:'amber' as const },
    { label:'Em Andamento', value:String(state.data.os_em_andamento), icon:CirclePlay, tone:'blue' as const },
    { label:'Finalizadas', value:String(state.data.os_finalizadas), icon:CircleCheckBig, tone:'green' as const },
    { label:'Gasto Total', value:formatCurrency(state.data.total_gasto), icon:Banknote, tone:'slate' as const },
  ]
  return <section className="stats-grid" aria-label="Indicadores da oficina">{stats.map((stat)=><StatCard key={stat.label}{...stat}/>)}</section>
}