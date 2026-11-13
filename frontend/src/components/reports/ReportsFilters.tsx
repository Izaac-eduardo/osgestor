import type { FormEvent } from 'react'
import type { ReportFilters } from '../../types/reports'
import type { MaintenanceNature } from '../../types/maintenance'

const natureLabels: Record<MaintenanceNature, string> = { MAO_DE_OBRA_INTERNA: 'Mão de obra interna', MATERIAIS_ALMOXARIFADO: 'Materiais do almoxarifado', PECAS_EXTERNAS: 'Peças externas', SERVICOS_TERCEIRIZADOS: 'Serviços terceirizados' }
type Props = { draft: ReportFilters; financialNature?: MaintenanceNature; error: string; onChange: (filters: ReportFilters) => void; onFinancialNatureChange: (nature?: MaintenanceNature) => void; onApply: () => void; onClear: () => void }

export function ReportsFilters({ draft, financialNature, error, onChange, onFinancialNatureChange, onApply, onClear }: Props) {
  const change = (field: keyof ReportFilters, value: string) => onChange({ ...draft, [field]: value || undefined })
  const submit = (event: FormEvent) => { event.preventDefault(); onApply() }
  return <form className="reports-filters" onSubmit={submit}>
    <header><h2>Filtros gerais</h2><p>Período, frota e natureza financeira aplicados aos custos de manutenção.</p></header>
    <div className="reports-filters__grid reports-filters__grid--compact"><label>Data inicial<input type="date" value={draft.data_inicio || ''} aria-invalid={Boolean(error)} aria-describedby={error ? 'report-period-error' : undefined} onChange={event => change('data_inicio', event.target.value)} /></label><label>Data final<input type="date" value={draft.data_fim || ''} aria-invalid={Boolean(error)} aria-describedby={error ? 'report-period-error' : undefined} onChange={event => change('data_fim', event.target.value)} /></label><label>Frota<input placeholder="Ex.: CT32 ou OFICINA" value={draft.frota_codigo || ''} onChange={event => change('frota_codigo', event.target.value)} /></label><label>Natureza financeira<select value={financialNature || ''} onChange={event => onFinancialNatureChange((event.target.value || undefined) as MaintenanceNature | undefined)}><option value="">Todas as naturezas</option>{(Object.keys(natureLabels) as MaintenanceNature[]).map(value => <option key={value} value={value}>{natureLabels[value]}</option>)}</select></label></div>
    {error && <p className="reports-filters__error" id="report-period-error" role="alert">{error}</p>}
    <footer><button className="button-link" type="button" onClick={onClear}>Limpar filtros</button><button className="button button--primary">Aplicar filtros</button></footer>
  </form>
}
