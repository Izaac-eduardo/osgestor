import { Building2 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AsyncSection } from '../hooks/useDashboardData'
import type { ExpensesByProject } from '../types/reports'
import { formatCurrency } from '../utils/formatters'
import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'
import { LoadingSkeleton } from './LoadingSkeleton'

const projectLabel = (name: string) => name.length > 19 ? `${name.slice(0, 18)}…` : name

export function ExpensesByProjectChart({ state, onRetry }: { state: AsyncSection<ExpensesByProject[]>; onRetry: () => void }) {
  return <article className="data-card"><div className="data-card__heading"><div><h2>Gastos por Obra</h2><p>Valores consolidados, sem ordens canceladas</p></div><Building2 size={21} aria-hidden="true"/></div><div className="data-card__body">{state.loading?<LoadingSkeleton lines={6} label="Carregando gastos por obra"/>:state.error?<ErrorState onRetry={onRetry}/>:!state.data?.length?<EmptyState compact title="Nenhum gasto encontrado" description="Nenhum dado disponível para este período."/>:<><div className="chart-scroll"><div style={{height:Math.max(270,state.data.length*52)}} role="img" aria-label="Gráfico de barras dos gastos totais por obra"><ResponsiveContainer width="100%" height="100%"><BarChart data={state.data} layout="vertical" margin={{top:4,right:18,bottom:4,left:8}}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5eaed"/><XAxis type="number" tickFormatter={(value)=>formatCurrency(Number(value))} tick={{fontSize:11,fill:'#687985'}} axisLine={false} tickLine={false}/><YAxis dataKey="obra_nome" type="category" width={128} tickFormatter={projectLabel} tick={{fontSize:11,fill:'#465a67'}} axisLine={false} tickLine={false}/><Tooltip formatter={(value)=>[formatCurrency(Number(value)),'Total gasto']} labelFormatter={(_,payload)=>payload[0]?.payload?.obra_nome??''} contentStyle={{borderRadius:8,borderColor:'#dfe6ea'}}/><Bar dataKey="total_gasto" fill="#2c779e" radius={[0,5,5,0]} maxBarSize={25}/></BarChart></ResponsiveContainer></div></div><ul className="sr-only">{state.data.map((item)=><li key={item.obra_id}>{item.obra_nome}: {formatCurrency(item.total_gasto)}</li>)}</ul></>}</div></article>
}