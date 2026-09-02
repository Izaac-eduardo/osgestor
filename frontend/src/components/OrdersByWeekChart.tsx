import { CalendarRange } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AsyncSection } from '../hooks/useDashboardData'
import type { OrdersByWeek } from '../types/reports'
import { formatCompactDate, formatShortDate } from '../utils/formatters'
import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'
import { LoadingSkeleton } from './LoadingSkeleton'

export function OrdersByWeekChart({ state, onRetry }: { state: AsyncSection<OrdersByWeek[]>; onRetry: () => void }) {
  const data=state.data?.map((item)=>({...item,label:formatCompactDate(item.data_inicio_semana)}))
  return <article className="data-card"><div className="data-card__heading"><div><h2>Ordens de Serviço por Semana</h2><p>Evolução semanal das ordens registradas</p></div><CalendarRange size={21} aria-hidden="true"/></div><div className="data-card__body">{state.loading?<LoadingSkeleton lines={6} label="Carregando ordens por semana"/>:state.error?<ErrorState onRetry={onRetry}/>:!data?.length?<EmptyState compact title="Nenhuma ordem encontrada" description="Nenhum dado disponível para este período."/>:<><div className="line-chart" role="img" aria-label="Gráfico da quantidade de ordens de serviço por semana"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{top:12,right:14,bottom:5,left:-18}}><CartesianGrid strokeDasharray="3 3" stroke="#e5eaed"/><XAxis dataKey="label" tick={{fontSize:11,fill:'#687985'}} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{fontSize:11,fill:'#687985'}} axisLine={false} tickLine={false}/><Tooltip formatter={(value)=>[Number(value),'Ordens de Serviço']} labelFormatter={(_,payload)=>payload[0]?.payload?`Semana ${payload[0].payload.semana} — ${formatShortDate(payload[0].payload.data_inicio_semana)}`:''} contentStyle={{borderRadius:8,borderColor:'#dfe6ea'}}/><Line type="monotone" dataKey="quantidade_os" stroke="#2c779e" strokeWidth={3} dot={{r:4,fill:'#fff',strokeWidth:2}} activeDot={{r:6}}/></LineChart></ResponsiveContainer></div><ul className="sr-only">{data.map((item)=><li key={`${item.ano}-${item.semana}`}>Semana {item.semana}, início em {formatShortDate(item.data_inicio_semana)}: {item.quantidade_os} ordens</li>)}</ul></>}</div></article>
}