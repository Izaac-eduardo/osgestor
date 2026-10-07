import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { CircleDollarSign, ClipboardList, Package, RefreshCw, Settings2, Wrench } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PageHeader } from '../components/PageHeader'
import { ErrorState } from '../components/ErrorState'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import { useDashboardData } from '../hooks/useDashboardData'
import { getProjects } from '../services/projects'
import type { Project } from '../types/projects'
import type { ReportFilters } from '../types/reports'
import { formatCurrency } from '../utils/formatters'
import { activeDashboardPreset, dashboardPeriod, type DashboardPreset } from '../utils/dashboard-periods'
import '../styles/dashboard.css'

const money = (value: number) => formatCurrency(value)
const date = (value: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(`${value}T12:00:00`))

function Kpi({ label, value, meta, icon: Icon, tone }: { label: string; value: string; meta?: string; icon: any; tone: string }) {
  return <article className={`dashboard-kpi dashboard-kpi--${tone}`}><span className="dashboard-kpi__icon"><Icon size={18} /></span><div><small>{label}</small><strong>{value}</strong>{meta && <em>{meta}</em>}</div></article>
}
function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="dashboard-panel"><header><div><h2>{title}</h2>{description && <p>{description}</p>}</div></header>{children}</section>
}
function Ranking({ rows, showMeta = true }: { rows: Array<{ label: string; meta?: string; value: number; valueLabel?: string }>; showMeta?: boolean }) {
  if (!rows.length) return <p className="dashboard-empty-inline">Nenhum resultado no período.</p>
  return <div className={`dashboard-ranking${showMeta ? '' : ' dashboard-ranking--single-line'}`}>{rows.map((row, index) => <div className="dashboard-ranking__row" key={`${row.label}-${index}`}><span className="dashboard-ranking__position">{index + 1}</span><span className="dashboard-ranking__label"><strong>{row.label}</strong>{showMeta && row.meta && <small>{row.meta}</small>}</span><b>{row.valueLabel ?? money(row.value)}</b></div>)}</div>
}

export function DashboardPage() {
  const { filters, setFilters, data, loading, error, load } = useDashboardData()
  const [projects, setProjects] = useState<Project[]>([])
  const [draft, setDraft] = useState<ReportFilters>(filters)
  useEffect(() => { void getProjects().then(setProjects).catch(() => setProjects([])) }, [])
  useEffect(() => { setDraft(filters) }, [filters])
  const activePreset = activeDashboardPreset(draft)
  const submit = (event: FormEvent) => { event.preventDefault(); setFilters(draft) }
  const applyPreset = (preset: DashboardPreset) => { const next = { ...draft, ...dashboardPeriod(preset) }; setDraft(next); setFilters(next) }
  const natureLabels: Record<string, string> = { INTERNA: 'Interna', TERCEIRO: 'Terceiros', MATERIAL: 'Material' }
  return <>
    <PageHeader title="Dashboard" subtitle="Visão gerencial rápida da operação da oficina" />
    <form className="dashboard-filters" onSubmit={submit}>
      <div className="dashboard-filter-heading"><div><Settings2 size={18} /><div><strong>Período de análise</strong><small>Use os atalhos ou selecione um período personalizado</small></div></div><div className="dashboard-period-presets" role="group" aria-label="Atalhos de período">{([['week', 'Semanal'], ['15days', 'Últimos 15 dias'], ['month', 'Mensal']] as [DashboardPreset, string][]).map(([preset, label]) => <button key={preset} type="button" className={`button ${activePreset === preset ? 'button--primary' : 'button--secondary'}`} aria-pressed={activePreset === preset} onClick={() => applyPreset(preset)}>{label}</button>)}</div></div>
      <div className="dashboard-filter-grid"><label>Data inicial<input type="date" value={draft.data_inicio ?? ''} onChange={event => setDraft({ ...draft, data_inicio: event.target.value })} /></label><label>Data final<input type="date" value={draft.data_fim ?? ''} onChange={event => setDraft({ ...draft, data_fim: event.target.value })} /></label><label>Obra<select value={draft.obra_id ?? ''} onChange={event => setDraft({ ...draft, obra_id: event.target.value || undefined })}><option value="">Todas as obras</option>{projects.map(project => <option key={project.id} value={project.id}>{project.codigo} · {project.nome}</option>)}</select></label><label>Frota<input placeholder="Ex.: CT32 ou MC06" value={draft.frota_codigo ?? ''} onChange={event => setDraft({ ...draft, frota_codigo: event.target.value || undefined })} /></label><label>Natureza<select value={draft.natureza_os ?? ''} onChange={event => setDraft({ ...draft, natureza_os: (event.target.value || undefined) as ReportFilters['natureza_os'] })}><option value="">Todas</option><option value="INTERNA">Interna</option><option value="MATERIAL">Material</option><option value="TERCEIRO">Terceiros</option></select></label><label>Status<select value={draft.status ?? ''} onChange={event => setDraft({ ...draft, status: (event.target.value || undefined) as ReportFilters['status'] })}><option value="">Todos</option><option value="ABERTA">Abertas</option><option value="FINALIZADA">Finalizadas</option><option value="CANCELADA">Canceladas</option><option value="EM_ANDAMENTO">Em andamento</option><option value="AGUARDANDO_PECA">Aguardando peça</option></select></label><label>Categoria<select value={draft.categoria_servico ?? ''} onChange={event => setDraft({ ...draft, categoria_servico: (event.target.value || undefined) as ReportFilters['categoria_servico'] })}><option value="">Todas</option>{['LAVAGEM', 'MECANICA', 'AUTO_ELETRICA', 'ELETRICA', 'BORRACHARIA', 'LUBRIFICACAO', 'SOLDAGEM', 'FUNILARIA', 'HIDRAULICA', 'OUTROS'].map(category => <option key={category} value={category}>{category.replace('_', ' ')}</option>)}</select></label><button className="button button--primary dashboard-filter-submit" type="submit"><RefreshCw size={16} />Aplicar filtros</button></div>
    </form>
    {loading && !data ? <section className="dashboard-loading"><LoadingSkeleton lines={8} label="Carregando resumo gerencial" /></section> : error ? <ErrorState onRetry={() => void load(filters)} /> : !data ? <section className="dashboard-loading"><LoadingSkeleton lines={8} label="Carregando resumo gerencial" /></section> : <main className="dashboard-content">
      <section className="dashboard-kpis"><Kpi label="Total de O.S." value={String(data.resumo.total_os)} icon={ClipboardList} tone="blue" /><Kpi label="Produtos" value={money(data.resumo.produtos)} meta={`${data.resumo.produtos_os} O.S.`} icon={Package} tone="orange" /><Kpi label="Interna" value={money(data.resumo.interna)} meta={`${data.resumo.interna_os} O.S.`} icon={Wrench} tone="green" /><Kpi label="Terceiros" value={money(data.resumo.terceiros)} meta={`${data.resumo.terceiros_os} O.S.`} icon={CircleDollarSign} tone="navy" /></section>
      <section className="dashboard-grid--three"><Panel title="O.S. por categoria" description="Somente O.S. de natureza interna · Top 5"><Ranking showMeta={false} rows={data.categorias.map(row => ({ label: row.categoria, value: row.quantidade, valueLabel: `${row.quantidade} O.S.` }))} /></Panel><Panel title="Frotas com maiores gastos"><Ranking rows={data.top_frotas.map(row => ({ label: row.frota, meta: `${row.quantidade_os} O.S.`, value: row.gasto }))} /></Panel><Panel title="Obras com maiores gastos"><Ranking rows={data.top_obras.map(row => ({ label: `${row.codigo} · ${row.nome}`, meta: `${row.quantidade_os} O.S.`, value: row.gasto }))} /></Panel></section>
      <section className="dashboard-grid--two"><Panel title="Gasto por natureza" description="Valores efetivos, sem O.S. canceladas"><div className="dashboard-chart"><ResponsiveContainer width="100%" height={220}><BarChart data={data.naturezas.map(row => ({ ...row, nome: natureLabels[row.natureza] ?? row.natureza }))} layout="vertical" margin={{ left: 12, right: 18 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={value => `R$ ${Number(value).toLocaleString('pt-BR')}`} /><YAxis type="category" dataKey="nome" width={84} /><Tooltip formatter={value => money(Number(value))} /><Bar dataKey="gasto" fill="#1f6f8b" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></div></Panel><Panel title="O.S. abertas ao longo do período" description="Novas ordens agrupadas pela data de abertura"><div className="dashboard-chart"><ResponsiveContainer width="100%" height={220}><LineChart data={data.os_por_dia} margin={{ top: 12, right: 20, left: 4, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="data" tickFormatter={date} /><YAxis allowDecimals={false} /><Tooltip labelFormatter={value => date(String(value))} /><Line type="monotone" dataKey="quantidade" name="O.S." stroke="#1f6f8b" strokeWidth={3} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div></Panel></section>
      <div className="dashboard-footnote">O.S. sem custo lançado: <strong>{data.resumo.os_sem_custo}</strong> · Ticket médio considera apenas O.S. não canceladas com custo maior que zero.</div>
    </main>}
  </>
}
