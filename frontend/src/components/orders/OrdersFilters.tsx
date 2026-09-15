import type { Dispatch, FormEvent, SetStateAction } from 'react'
import { Filter, RotateCcw } from 'lucide-react'
import { orderCategories, orderNatures, orderStatuses, type OrderFilters, type ProjectOption } from '../../types/orders'
import { orderCategoryLabels, orderNatureLabels, orderStatusLabels } from '../../utils/orderLabels'

type Props = { filters: OrderFilters; setFilters: Dispatch<SetStateAction<OrderFilters>>; projects: ProjectOption[]; loadingOptions: boolean; onSubmit: () => void; onClear: () => void }
export function OrdersFilters({ filters, setFilters, projects, loadingOptions, onSubmit, onClear }: Props) {
  const set = (field: keyof OrderFilters, value: string) => setFilters(current => ({ ...current, [field]: value }))
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit() }
  return <form className="orders-filters" onSubmit={submit}>
    <header><h2>Filtros</h2><p>Refine a consulta das ordens cadastradas.</p></header>
    <div className="orders-filters__grid">
      <Field label="Número da O.S."><input min="1" type="number" value={filters.numero_os || ''} onChange={event => set('numero_os', event.target.value)} /></Field>
      <Field label="Frota"><input placeholder="Ex.: CT32 ou OFICINA" value={filters.frota_codigo || ''} onChange={event => set('frota_codigo', event.target.value)} /></Field>
      <Field label="Obra"><select disabled={loadingOptions} value={filters.obra_id || ''} onChange={event => set('obra_id', event.target.value)}><option value="">Todas</option>{projects.map(project => <option key={project.id} value={project.id}>{project.codigo} — {project.nome}</option>)}</select></Field>
      <Field label="Status"><select value={filters.status || ''} onChange={event => set('status', event.target.value)}><option value="">Todos</option>{orderStatuses.map(status => <option key={status} value={status}>{orderStatusLabels[status]}</option>)}</select></Field>
      <Field label="Natureza"><select value={filters.natureza_os || ''} onChange={event => set('natureza_os', event.target.value)}><option value="">Todas</option>{orderNatures.map(nature => <option key={nature} value={nature}>{orderNatureLabels[nature]}</option>)}</select></Field>
      <Field label="Categoria"><select value={filters.categoria_servico || ''} onChange={event => set('categoria_servico', event.target.value)}><option value="">Todas</option>{orderCategories.map(category => <option key={category} value={category}>{orderCategoryLabels[category]}</option>)}</select></Field>
      <Field label="Data inicial"><input type="date" value={filters.data_inicio || ''} onChange={event => set('data_inicio', event.target.value)} /></Field>
      <Field label="Data final"><input type="date" value={filters.data_fim || ''} onChange={event => set('data_fim', event.target.value)} /></Field>
    </div>
    <footer><button className="button button--primary"><Filter size={17} />Filtrar</button><button className="button button--secondary" type="button" onClick={onClear}><RotateCcw size={17} />Limpar filtros</button></footer>
  </form>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label>{label}{children}</label> }
