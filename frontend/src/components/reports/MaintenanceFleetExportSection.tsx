import { useEffect, useState } from 'react'
import { Boxes, CircleDollarSign, Download, List, Package, Wrench } from 'lucide-react'
import { StatCard } from '../StatCard'
import { downloadMaintenance, getMaintenanceDetails, getMaintenanceTotals } from '../../services/maintenance'
import type { MaintenanceDetail, MaintenanceFilters, MaintenanceTotals } from '../../types/maintenance'
import { formatCurrency } from '../../utils/formatters'
import { countMaintenanceLaunches } from '../../utils/maintenance-summary'

type Props = { filters: MaintenanceFilters }

export function MaintenanceFleetExportSection({ filters }: Props) {
  const [totals, setTotals] = useState<MaintenanceTotals | null>(null)
  const [details, setDetails] = useState<MaintenanceDetail[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => { const controller = new AbortController(); if (!filters.data_inicio || !filters.data_fim) { setTotals(null); setDetails(null); setLoading(false); return () => controller.abort() }; setLoading(true); setError(false); Promise.all([getMaintenanceTotals(filters, controller.signal), getMaintenanceDetails(filters, controller.signal)]).then(([summary, rows]) => { if (!controller.signal.aborted) { setTotals(summary); setDetails(rows) } }).catch(() => { if (!controller.signal.aborted) { setTotals(null); setDetails(null); setError(true) } }).finally(() => { if (!controller.signal.aborted) setLoading(false) }); return () => controller.abort() }, [filters, retry])
  const canExport = Boolean(filters.data_inicio && filters.data_fim) && !loading
  const download = (format: 'pdf' | 'xlsx') => void downloadMaintenance(format, filters)
  const launchCount = countMaintenanceLaunches(details)
  const cards = totals && launchCount !== null ? [{ label: 'Peças externas', value: formatCurrency(Number(totals.pecas_externas)), icon: Package }, { label: 'Serviços terceirizados', value: formatCurrency(Number(totals.servicos_terceirizados)), icon: CircleDollarSign }, { label: 'Materiais do almoxarifado', value: formatCurrency(Number(totals.materiais_almoxarifado)), icon: Boxes }, { label: 'Mão de obra interna', value: formatCurrency(Number(totals.mao_obra_interna)), icon: Wrench }, { label: 'Total', value: formatCurrency(Number(totals.total_efetivo)), icon: CircleDollarSign, tone: 'amber' as const }, { label: 'Lançamentos', value: String(launchCount), icon: List, tone: 'slate' as const }] : []
  return <section className="report-section maintenance-export-section"><header className="report-section__header"><div><h2>Custos de Manutenção por Frota</h2><p>Resumo financeiro por natureza, com mão de obra interna apresentada separadamente do Total.</p></div><div className="report-export"><button type="button" className="button button--secondary" disabled={!canExport} onClick={() => download('pdf')}><Download size={16} />Exportar PDF</button><button type="button" className="button button--secondary" disabled={!canExport} onClick={() => download('xlsx')}><Download size={16} />Exportar Excel</button></div></header>{loading ? <div className="report-loading maintenance-summary-loading" aria-label="Carregando resumo financeiro"><span /><span /><span /></div> : error ? <div className="report-state report-state--error"><p>Não foi possível consultar o resumo financeiro.</p><button type="button" className="button button--secondary" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></div> : !filters.data_inicio || !filters.data_fim ? <div className="report-state maintenance-summary-empty"><p>Informe um período e clique em Aplicar filtros para consultar os custos.</p></div> : <><div className="reports-stats maintenance-summary-cards">{cards.map(card => <StatCard key={card.label} {...card} />)}</div>{details?.length === 0 && <p className="maintenance-summary-empty-note">Nenhum lançamento encontrado para os filtros selecionados.</p>}</>}</section>
}
