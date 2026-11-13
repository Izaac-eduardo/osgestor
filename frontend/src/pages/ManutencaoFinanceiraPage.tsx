import { useEffect, useRef, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { getFleets } from '../services/fleets'
import { downloadMaintenance, getMaintenanceByFleet, getMaintenanceDetails, getMaintenanceTotals, getSharedExpenses } from '../services/maintenance'
import type { MaintenanceDetail, MaintenanceFilters, MaintenanceFleetSummary, MaintenanceNature, MaintenanceTotals, SharedExpenses } from '../types/maintenance'
import type { Fleet } from '../types/fleets'
import { formatCurrency } from '../utils/formatters'
import { responseArray } from '../services/response-shapes'
import '../styles/maintenance.css'

const initial = (): MaintenanceFilters => {
  const end = new Date()
  const start = new Date(end)
  start.setDate(end.getDate() - 30)
  const fmt = (date: Date) => date.toISOString().slice(0, 10)
  return { data_inicio: fmt(start), data_fim: fmt(end) }
}

const labels: Record<string, string> = { PECAS_EXTERNAS: 'Peças externas', SERVICOS_TERCEIRIZADOS: 'Serviços terceirizados', MATERIAIS_ALMOXARIFADO: 'Materiais do almoxarifado', MAO_DE_OBRA_INTERNA: 'Mão de obra interna' }
const natureLabels: Record<MaintenanceNature, string> = { MAO_DE_OBRA_INTERNA: 'Mão de obra interna', MATERIAIS_ALMOXARIFADO: 'Materiais do almoxarifado', PECAS_EXTERNAS: 'Peças externas', SERVICOS_TERCEIRIZADOS: 'Serviços terceirizados' }
type Settled<T> = PromiseSettledResult<T>

export function ManutencaoFinanceiraPage() {
  const [filters, setFilters] = useState(initial)
  const [fleets, setFleets] = useState<Fleet[]>([])
  const [rows, setRows] = useState<MaintenanceFleetSummary[] | null>(null)
  const [totals, setTotals] = useState<MaintenanceTotals | null>(null)
  const [details, setDetails] = useState<MaintenanceDetail[] | null>(null)
  const [shared, setShared] = useState<SharedExpenses | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sectionErrors, setSectionErrors] = useState<string[]>([])
  const requestId = useRef(0)
  const controller = useRef<AbortController | null>(null)

  const load = () => {
    controller.current?.abort()
    const currentId = ++requestId.current
    const currentController = new AbortController()
    controller.current = currentController
    setLoading(true)
    setError('')
    setSectionErrors([])
    setRows(null)
    setTotals(null)
    setDetails(null)
    setShared(null)
    Promise.allSettled([
      getMaintenanceByFleet(filters, currentController.signal),
      getMaintenanceTotals(filters, currentController.signal),
      getMaintenanceDetails(filters, currentController.signal),
      getSharedExpenses(filters, currentController.signal),
    ]).then(results => {
      if (currentId !== requestId.current || currentController.signal.aborted) return
      const failures: string[] = []
      const apply = <T,>(result: Settled<T>, name: string, setter: (value: T) => void) => {
        if (result.status === 'fulfilled') setter(result.value)
        else failures.push(name)
      }
      apply(results[0]!, 'Consolidação por frota', setRows)
      apply(results[1]!, 'Totais financeiros', setTotals)
      apply(results[2]!, 'Detalhamento', setDetails)
      apply(results[3]!, 'Despesas compartilhadas', value => setShared(value as SharedExpenses))
      setSectionErrors(failures)
      if (failures.length) setError('Não foi possível carregar os dados financeiros.')
    }).finally(() => {
      if (currentId === requestId.current && !currentController.signal.aborted) setLoading(false)
    })
  }

  useEffect(() => {
    getFleets().then(value => setFleets(responseArray<Fleet>(value, 'frotas'))).catch(() => setFleets([]))
    load()
    return () => { controller.current?.abort(); requestId.current += 1 }
  }, [])

  const apply = (event: React.FormEvent) => { event.preventDefault(); load() }
  const canExport = !loading && rows !== null && totals !== null
  const selectedNature = filters.natureza ? natureLabels[filters.natureza] : 'Todas as naturezas'
  const pendingSharedValue = shared?.itens.filter(item => item.despesa_compartilhada_status === 'AGUARDANDO_DECISAO').reduce((sum, item) => sum + Number(item.valor_total ?? 0), 0) ?? 0

  return <>
    <PageHeader title="Manutenção por frota" subtitle="Custos efetivos e valores de referência da manutenção" />
    <form className="maintenance-filters" onSubmit={apply}>
      <label>Data inicial<input type="date" value={filters.data_inicio} onChange={e => setFilters({ ...filters, data_inicio: e.target.value })} /></label>
      <label>Data final<input type="date" value={filters.data_fim} onChange={e => setFilters({ ...filters, data_fim: e.target.value })} /></label>
      <label>Frota<select value={filters.frota_id || ''} onChange={e => setFilters({ ...filters, frota_id: e.target.value || undefined })}><option value="">Todas</option>{fleets.map(fleet => <option key={fleet.id} value={fleet.id}>{fleet.codigo}{fleet.placa ? ` — ${fleet.placa}` : ''}</option>)}</select></label>
      <label>Natureza dos custos<select value={filters.natureza || ''} onChange={e => setFilters({ ...filters, natureza: (e.target.value || undefined) as MaintenanceNature | undefined })}><option value="">Todas as naturezas</option>{(Object.keys(natureLabels) as MaintenanceNature[]).map(value => <option key={value} value={value}>{natureLabels[value]}</option>)}</select></label>
      <button className="button button--primary" disabled={loading}><RefreshCw size={16} />Aplicar</button>
    </form>
    {loading && <p>Carregando dados financeiros...</p>}
    {error && <section className="maintenance-panel"><p className="maintenance-error">{error}</p><p>As seções sem dados carregados não representam valores zerados.</p><button type="button" className="button button--primary" onClick={load} disabled={loading}>Tentar novamente</button>{sectionErrors.length > 0 && <p>Falha em: {sectionErrors.join(', ')}.</p>}</section>}
    {!loading && !error && totals && <section className="maintenance-kpis"><article><span>Custo efetivo</span><strong>{formatCurrency(Number(totals.total_efetivo))}</strong></article><article><span>Peças externas</span><strong>{formatCurrency(Number(totals.pecas_externas))}</strong></article><article><span>Serviços terceirizados</span><strong>{formatCurrency(Number(totals.servicos_terceirizados))}</strong></article><article><span>Materiais</span><strong>{formatCurrency(Number(totals.materiais_almoxarifado))}</strong></article><article><span>Referência de mão de obra</span><strong>{formatCurrency(Number(totals.mao_obra_interna))}</strong></article><article><span>Total gerencial ampliado</span><strong>{formatCurrency(Number(totals.total_gerencial))}</strong></article></section>}
    {!loading && rows && <section className="maintenance-panel"><header><div><h2>Consolidação por frota</h2><p>Filtro aplicado: {selectedNature}. Custo efetivo não inclui mão de obra interna.</p></div><div><button type="button" className="button button--secondary" disabled={!canExport} onClick={() => void downloadMaintenance('pdf', filters)}><Download size={16} />PDF</button><button type="button" className="button button--secondary" disabled={!canExport} onClick={() => void downloadMaintenance('xlsx', filters)}><Download size={16} />Excel</button></div></header>{rows.length === 0 ? <p>Nenhum lançamento encontrado no período.</p> : <div className="maintenance-table-wrap"><table><thead><tr><th>Frota / placa</th><th>Lançamentos</th><th>Peças</th><th>Serviços</th><th>Materiais</th><th>Mão de obra</th><th>Custo efetivo</th><th>Total gerencial</th></tr></thead><tbody>{rows.map(row => <tr key={row.frota_id}><td>{row.prefixo}<small>{row.placa || 'Sem placa'}</small></td><td>{row.lancamentos}</td><td>{formatCurrency(Number(row.pecas_externas))}</td><td>{formatCurrency(Number(row.servicos_terceirizados))}</td><td>{formatCurrency(Number(row.materiais_almoxarifado))}</td><td>{formatCurrency(Number(row.mao_obra_interna))}</td><td><strong>{formatCurrency(Number(row.total_efetivo))}</strong></td><td><strong>{formatCurrency(Number(row.total_gerencial))}</strong></td></tr>)}</tbody></table></div>}</section>}
    {!loading && shared && <section className="maintenance-panel"><h2>Despesas compartilhadas</h2><p>Valores aprovados são apresentados separadamente e não são somados duas vezes.</p><div className="maintenance-kpis"><article><span>Aguardando decisão</span><strong>{formatCurrency(pendingSharedValue)}</strong><small>{shared.aguardando_decisao} lançamento(s) pendente(s)</small></article><article><span>Total aprovado</span><strong>{formatCurrency(Number(shared.valor_aprovado))}</strong><small>{shared.aprovadas} lançamento(s) aprovado(s)</small></article><article><span>Desconsideradas</span><strong>{shared.desconsideradas}</strong></article></div>{shared.itens.length === 0 ? <p>Nenhuma despesa compartilhada no período.</p> : <div className="maintenance-table-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Plano</th><th>Subcentro</th><th>Documento</th><th>Valor</th><th>Status</th><th>Responsável</th></tr></thead><tbody>{shared.itens.map(item => <tr key={item.id}><td>{item.data_conta}</td><td>{item.produto_original || '—'}</td><td>{labels[item.classificacao] || item.classificacao}</td><td>{item.subcentro_original || '—'}</td><td>{item.nota_original || item.controle_original || '—'}</td><td>{formatCurrency(Number(item.valor_total))}</td><td>{item.despesa_compartilhada_status}</td><td>{item.decidido_por || '—'}</td></tr>)}</tbody></table></div>}</section>}
    {!loading && details && <section className="maintenance-panel"><h2>Detalhamento por lançamento</h2>{details.length === 0 ? <p>Nenhum lançamento encontrado para {selectedNature.toLowerCase()}.</p> : <div className="maintenance-table-wrap"><table><thead><tr><th>Data</th><th>Referência</th><th>Natureza</th><th>Descrição</th><th>Quantidade</th><th>Unidade</th><th>Valor</th><th>Origem</th></tr></thead><tbody>{details.map((row, index) => <tr key={`${row.origem}-${row.referencia}-${index}`}><td>{row.data?.split('-').reverse().join('/')}</td><td>{row.referencia}</td><td>{labels[row.categoria] || row.categoria}</td><td>{row.descricao}</td><td>{row.quantidade ?? '—'}</td><td>{row.unidade || '—'}</td><td>{formatCurrency(Number(row.valor))}</td><td>{row.origem}</td></tr>)}</tbody></table></div>}</section>}
  </>
}
