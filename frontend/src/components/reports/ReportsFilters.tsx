import type { FormEvent } from 'react'
import { orderCategories, orderNatures, orderStatuses } from '../../types/orders'
import type { ProjectOption } from '../../types/orders'
import type { ReportFilters } from '../../types/reports'
import { orderCategoryLabels, orderNatureLabels, orderStatusLabels } from '../../utils/orderLabels'

type Props = { draft: ReportFilters; projects: ProjectOption[]; error: string; onChange: (filters: ReportFilters) => void; onApply: () => void; onClear: () => void }
export function ReportsFilters({ draft, projects, error, onChange, onApply, onClear }: Props) {
  const change = (field: keyof ReportFilters, value: string) => onChange({ ...draft, [field]: value || undefined })
  const submit = (event: FormEvent) => { event.preventDefault(); onApply() }
  return <form className="reports-filters" onSubmit={submit}>
    <header><h2>Filtros</h2></header>
    <div className="reports-filters__grid">
      <label>Data inicial<input type="date" value={draft.data_inicio || ''} aria-invalid={Boolean(error)} aria-describedby={error ? 'report-period-error' : undefined} onChange={event => change('data_inicio', event.target.value)} /></label>
      <label>Data final<input type="date" value={draft.data_fim || ''} aria-invalid={Boolean(error)} aria-describedby={error ? 'report-period-error' : undefined} onChange={event => change('data_fim', event.target.value)} /></label>
      <label>Obra<select value={draft.obra_id || ''} onChange={event => change('obra_id', event.target.value)}><option value="">Todas as obras</option>{projects.map(project => <option key={project.id} value={project.id}>{project.nome} · {project.codigo}</option>)}</select></label>
      <label>Frota<input placeholder="Ex.: CT32 ou OFICINA" value={draft.frota_codigo || ''} onChange={event => change('frota_codigo', event.target.value)} /></label>
      <label>Status<select value={draft.status || ''} onChange={event => change('status', event.target.value)}><option value="">Todos</option>{orderStatuses.map(status => <option key={status} value={status}>{orderStatusLabels[status]}</option>)}</select></label>
      <label>Natureza<select value={draft.natureza_os || ''} onChange={event => change('natureza_os', event.target.value)}><option value="">Todas</option>{orderNatures.map(nature => <option key={nature} value={nature}>{orderNatureLabels[nature]}</option>)}</select></label>
      <label>Categoria<select value={draft.categoria_servico || ''} onChange={event => change('categoria_servico', event.target.value)}><option value="">Todas</option>{orderCategories.map(category => <option key={category} value={category}>{orderCategoryLabels[category]}</option>)}</select></label>
    </div>
    {error && <p className="reports-filters__error" id="report-period-error" role="alert">{error}</p>}
    <footer><button className="button-link" type="button" onClick={onClear}>Limpar filtros</button><button className="button button--primary">Aplicar filtros</button></footer>
  </form>
}
