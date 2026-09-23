import { useEffect, useState, type FormEvent } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { ErrorState } from '../components/ErrorState'
import { OrdersLoading } from '../components/orders/OrdersLoading'
import { PageHeader } from '../components/PageHeader'
import { getAbastecimentoProdutos, getConsumoFrota } from '../services/abastecimentos'
import { getFleets } from '../services/fleets'
import { getProjects } from '../services/projects'
import type { AbastecimentoProduto, ConsumoFrotaFilters, ConsumoFrotaItem, ConsumoFrotaResponse } from '../types/abastecimentos'
import type { Fleet } from '../types/fleets'
import type { Project } from '../types/projects'
import { formatQuantity } from '../utils/formatters'

type Filters = { data_inicio: string; data_fim: string; obra_id: string; frota_id: string; produto: string; tipo_calculo: 'TODOS' | 'KM_L' | 'L_H'; situacao: 'TODAS' | 'CALCULAVEL' | 'PROBLEMATICA' | 'INSUFICIENTE'; page: number }
const initialFilters: Filters = { data_inicio: '', data_fim: '', obra_id: '', frota_id: '', produto: '', tipo_calculo: 'TODOS', situacao: 'TODAS', page: 1 }
const errorMessage = (error: unknown) => axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || 'Não foi possível carregar o relatório de consumo.' : 'Não foi possível carregar o relatório de consumo.'
const dateTime = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
const statusLabel = (value: ConsumoFrotaItem['situacao']) => ({ CALCULAVEL_KM: 'Calculável por km/L', CALCULAVEL_HORIMETRO: 'Calculável por L/h', AMBIGUA: 'Ambígua', INSUFICIENTE: 'Dados insuficientes', PROBLEMATICA: 'Problemática' }[value])
const productLabel = (product: ConsumoFrotaItem['produto']) => product.codigo === 'DIESEL_S10' ? 'S10' : product.codigo === 'DIESEL_S500' ? 'S500' : product.nome
const toQuery = (filters: Filters): ConsumoFrotaFilters => ({ data_inicio: filters.data_inicio || undefined, data_fim: filters.data_fim || undefined, obra_id: filters.obra_id || undefined, frota_id: filters.frota_id || undefined, produto: filters.produto || undefined, tipo_calculo: filters.tipo_calculo, situacao: filters.situacao, page: filters.page, limit: 25 })

export function AbastecimentosConsumoFrotaPage() {
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [applied, setApplied] = useState<Filters>(initialFilters)
  const [report, setReport] = useState<ConsumoFrotaResponse | null>(null)
  const [products, setProducts] = useState<AbastecimentoProduto[]>([])
  const [fleets, setFleets] = useState<Fleet[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async (next = filters) => {
    setLoading(true); setError(null)
    try {
      const [data, productData, fleetData, projectData] = await Promise.all([getConsumoFrota(toQuery(next)), products.length ? Promise.resolve(products) : getAbastecimentoProdutos(), fleets.length ? Promise.resolve(fleets) : getFleets(), projects.length ? Promise.resolve(projects) : getProjects()])
      setReport(data); setProducts(productData); setFleets(fleetData); setProjects(projectData); setApplied(next)
    } catch (requestError) { setError(errorMessage(requestError)) } finally { setLoading(false) }
  }
  useEffect(() => { void load(initialFilters) }, [])
  const update = (key: keyof Filters, value: string) => setFilters(current => ({ ...current, [key]: value, page: key === 'page' ? Number(value) : 1 }))
  const apply = (event: FormEvent) => { event.preventDefault(); void load({ ...filters, page: 1 }) }
  const clear = () => { setFilters(initialFilters); void load(initialFilters) }
  const changePage = (page: number) => { const next = { ...filters, page }; setFilters(next); void load(next) }

  return <>
    <PageHeader title="Média de Consumo por Frota" subtitle="Indicadores auditáveis de km/L e L/h por frota e produto." />
    <div className="entrada-report-navigation"><Link to="/abastecimentos/relatorios">Relatórios de Abastecimentos</Link><Link to="/abastecimentos/historico">Histórico</Link></div>
    <form className="reports-filters" onSubmit={apply}>
      <header><h2>Filtros</h2><p>O período considera a última leitura válida anterior como referência, sem incluir seus litros.</p></header>
      <div className="reports-filters__grid">
        <label>Data inicial<input type="date" value={filters.data_inicio} onChange={event => update('data_inicio', event.target.value)} /></label>
        <label>Data final<input type="date" value={filters.data_fim} onChange={event => update('data_fim', event.target.value)} /></label>
        <label>Obra<select value={filters.obra_id} onChange={event => update('obra_id', event.target.value)}><option value="">Todas</option>{projects.filter(item => item.status === 'ATIVA').map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
        <label>Frota<select value={filters.frota_id} onChange={event => update('frota_id', event.target.value)}><option value="">Todas</option>{fleets.filter(item => item.status === 'ATIVO').map(item => <option key={item.id} value={item.id}>{item.codigo}</option>)}</select></label>
        <label>Produto<select value={filters.produto} onChange={event => update('produto', event.target.value)}><option value="">Todos</option>{products.map(item => <option key={item.id} value={item.codigo}>{item.nome}</option>)}</select></label>
        <label>Tipo de cálculo<select value={filters.tipo_calculo} onChange={event => update('tipo_calculo', event.target.value)}><option value="TODOS">Todos</option><option value="KM_L">km/L</option><option value="L_H">L/h</option></select></label>
        <label>Situação<select value={filters.situacao} onChange={event => update('situacao', event.target.value)}><option value="TODAS">Todas</option><option value="CALCULAVEL">Calculável</option><option value="PROBLEMATICA">Problemática</option><option value="INSUFICIENTE">Dados insuficientes</option></select></label>
      </div>
      <footer><button className="button button--secondary" type="button" onClick={clear}>Limpar</button><button className="button button--primary" type="submit">Aplicar</button></footer>
    </form>
    {loading && <OrdersLoading />}
    {!loading && error && <ErrorState message={error} onRetry={() => void load(applied)} />}
    {!loading && !error && report && <>
      <section className="relatorios-abastecimento-cards">
        <div className="relatorios-abastecimento-card"><span>Frotas analisadas</span><strong>{report.resumo.frotas_analisadas}</strong></div>
        <div className="relatorios-abastecimento-card"><span>Frotas calculáveis</span><strong>{report.resumo.frotas_calculaveis}</strong></div>
        <div className="relatorios-abastecimento-card"><span>Frotas com problema</span><strong>{report.resumo.frotas_problematicas}</strong></div>
        <div className="relatorios-abastecimento-card"><span>Litros considerados</span><strong>{formatQuantity(report.resumo.litros_considerados)} L</strong></div>
      </section>
      <section className="relatorio-table-section">
        <header><div><h2>Consumo por frota</h2><p>Resultados separados por produto e com intervalos auditáveis.</p></div></header>
        {report.frotas.length ? <div className="orders-table-wrap"><table className="orders-table consumo-frota-table"><thead><tr><th>Frota</th><th>Produto</th><th>Tipo</th><th>Distância/Horas</th><th>Litros</th><th>Média</th><th>Válidos</th><th>Ignorados</th><th>Situação</th><th>Detalhes</th></tr></thead><tbody>{report.frotas.map(item => <ConsumptionRow key={`${item.frota_id}-${item.produto.id}`} item={item} />)}</tbody></table></div> : <div className="relatorio-empty">Nenhuma frota encontrada para os filtros aplicados.</div>}
        {report.pagination.total_pages > 1 && <div className="historico-pagination"><button className="button button--secondary" disabled={report.pagination.page <= 1} onClick={() => changePage(report.pagination.page - 1)}>Anterior</button><span>Página {report.pagination.page} de {report.pagination.total_pages}</span><button className="button button--secondary" disabled={report.pagination.page >= report.pagination.total_pages} onClick={() => changePage(report.pagination.page + 1)}>Próxima</button></div>}
      </section>
    </>}
  </>
}

function ConsumptionRow({ item }: { item: ConsumoFrotaItem }) {
  const [open, setOpen] = useState(false)
  const metric = item.tipo_calculo === 'L/H' ? `${formatQuantity(item.horas_total)} h` : item.tipo_calculo === 'KM/L' ? `${formatQuantity(item.km_total)} km` : '—'
  const average = item.media === null ? 'Dados insuficientes' : item.tipo_calculo === 'L/H' ? `${formatQuantity(item.media)} L/h` : `${formatQuantity(item.media)} km/L`
  return <><tr><td><strong>{item.frota}</strong><small>{item.placa || 'Sem placa'}</small></td><td>{productLabel(item.produto)}</td><td>{item.tipo_calculo || '—'}</td><td>{metric}</td><td>{formatQuantity(item.litros_considerados)} L</td><td>{average}</td><td>{item.intervalos_validos}</td><td>{item.leituras_ignoradas}</td><td><span className={`consumo-status consumo-status--${item.situacao.toLowerCase()}`}>{statusLabel(item.situacao)}</span>{item.regressoes > 0 && <small>Leituras regressivas: {item.regressoes}</small>}</td><td><button className="button button--secondary" type="button" onClick={() => setOpen(value => !value)}>{open ? <ChevronUp size={15} /> : <ChevronDown size={15} />} {open ? 'Fechar' : 'Abrir'}</button></td></tr>{open && <tr><td colSpan={10}><IntervalDetails item={item} /></td></tr>}</>
}

function IntervalDetails({ item }: { item: ConsumoFrotaItem }) {
  return <div className="consumo-details"><strong>Intervalos cronológicos</strong>{item.intervalos.length ? item.intervalos.map((interval, index) => <article key={`${interval.leitura_final.id}-${interval.tipo_calculo}-${index}`}><header><strong>{interval.tipo_calculo}</strong><span className={`consumo-status consumo-status--${interval.status.toLowerCase()}`}>{interval.status === 'LEITURA_REGRESSIVA' ? 'Leitura regressiva' : interval.status === 'DADOS_INSUFICIENTES' ? 'Dados insuficientes' : interval.status === 'LEITURA_IGUAL' ? 'Leitura igual' : 'Válido'}</span></header><p>Base: {interval.leitura_base ? `${dateTime(interval.leitura_base.data_hora)} · ${formatQuantity(interval.leitura_base.valor)}` : 'Sem leitura-base válida'} → Final: {dateTime(interval.leitura_final.data_hora)} · {formatQuantity(interval.leitura_final.valor)}</p><p>{interval.distancia_km === null ? `Horas: ${interval.horas === null ? '—' : formatQuantity(interval.horas)}` : `Distância: ${formatQuantity(interval.distancia_km)} km`} · Litros: {formatQuantity(interval.litros_intervalo)} L · Média: {interval.media_intervalo === null ? '—' : `${formatQuantity(interval.media_intervalo)} ${interval.tipo_calculo === 'KM/L' ? 'km/L' : 'L/h'}`}</p>{interval.abastecimentos.length > 0 && <details><summary>Abastecimentos do intervalo ({interval.abastecimentos.length})</summary>{interval.abastecimentos.map(fuel => <span key={fuel.id}>{dateTime(fuel.data_hora)} · {formatQuantity(fuel.litros)} L · Km/Hr {fuel.km_hr === null ? '—' : formatQuantity(fuel.km_hr)} · Hr {fuel.horimetro === null ? '—' : formatQuantity(fuel.horimetro)}</span>)}</details>}</article>) : <p>Nenhum intervalo disponível.</p>}</div>
}
