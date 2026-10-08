import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Eye, SquarePen, Plus, Search, Trash } from 'lucide-react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EntradaDetailsModal } from '../components/abastecimentos/EntradaDetailsModal'
import { EntradaFormModal } from '../components/abastecimentos/EntradaFormModal'
import { ErrorState } from '../components/ErrorState'
import { OrdersLoading } from '../components/orders/OrdersLoading'
import { PageHeader } from '../components/PageHeader'
import { createEntrada, deleteEntrada, getAbastecimentoProdutos, getEntrada, getEntradas, getPontoProdutos, getPontos, updateEntrada } from '../services/abastecimentos'
import type { AbastecimentoProduto, Entrada, EntradaFilters, EntradaPayload, PontoOperacional } from '../types/abastecimentos'
import { formatCurrency, formatDate, formatQuantity } from '../utils/formatters'
import { getProjects } from '../services/projects'
import { FrotaDiretaAbastecimentoModal } from '../components/abastecimentos/FrotaDiretaAbastecimentoModal'
import type { Project } from '../types/projects'

const message = (error: unknown, fallback: string) => axios.isAxiosError<{ message?: string }>(error) && [400, 404, 409].includes(error.response?.status ?? 0) ? error.response?.data?.message || fallback : fallback

export function AbastecimentosEntradasPage() {
  const [entradas, setEntradas] = useState<Entrada[]>([])
  const [produtos, setProdutos] = useState<AbastecimentoProduto[]>([])
  const [pontos, setPontos] = useState<PontoOperacional[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [compatibilidades, setCompatibilidades] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<EntradaFilters>({})
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, total_pages: 0 })
  const [form, setForm] = useState<Entrada | null | undefined>(undefined)
  const [details, setDetails] = useState<Entrada | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Entrada | null>(null)
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [direct, setDirect] = useState<{ entrada: Entrada; destino: Entrada['destinos'][number] } | null>(null)

  const load = async (nextFilters: EntradaFilters = filters, nextPage = 1) => {
    setLoading(true)
    setError(null)
    try {
      const [response, nextProdutos, nextPontos] = await Promise.all([
        getEntradas({ ...nextFilters, page: nextPage }),
        getAbastecimentoProdutos(),
        getPontos(),
      ])
      setEntradas(response.items)
      setPagination(response.pagination)
      setProdutos(nextProdutos)
      setPontos(nextPontos)
      const pairs = await Promise.all(nextPontos.map(async ponto => [ponto.id, (await getPontoProdutos(ponto.id)).map(product => product.id)] as const))
      setCompatibilidades(Object.fromEntries(pairs))
    } catch (e) {
      setError(message(e, 'Não foi possível carregar as entradas.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load(filters, 1) }, [])
  useEffect(() => { void getProjects().then(setProjects).catch(() => setProjects([])) }, [])

  const applyFilters = async (event: React.FormEvent) => {
    event.preventDefault()
    await load(filters, 1)
  }
  const updateFilter = (key: keyof EntradaFilters, value: string) => setFilters(current => ({ ...current, [key]: value || undefined }))
  const save = async (payload: EntradaPayload) => {
    if (saving || form === undefined) return
    setSaving(true)
    setFormError(null)
    try {
      if (form) await updateEntrada(form.id, payload)
      else await createEntrada(payload)
      setForm(undefined)
      setSuccess('Entrada salva com sucesso.')
      await load(filters, pagination.page)
    } catch (e) {
      setFormError(message(e, 'Não foi possível salvar a entrada.'))
    } finally {
      setSaving(false)
    }
  }
  const edit = async (id: string) => {
    try {
      setForm(await getEntrada(id))
      setFormError(null)
    } catch (e) {
      setSuccess(message(e, 'Não foi possível carregar a entrada.'))
    }
  }
  const remove = async () => {
    if (!confirm || busy) return
    setBusy(true)
    try {
      await deleteEntrada(confirm.id)
      setConfirm(null)
      setSuccess('Entrada excluída com sucesso.')
      await load(filters, pagination.page)
    } catch (e) {
      setSuccess(message(e, 'Não foi possível excluir a entrada.'))
    } finally {
      setBusy(false)
    }
  }
  const clear = () => {
    const nextFilters: EntradaFilters = {}
    setFilters(nextFilters)
    void load(nextFilters, 1)
  }
  const productOptions = useMemo(() => produtos.filter(item => item.permite_entrada), [produtos])

  return <>
    <PageHeader title="Entradas de Combustível" subtitle="Registre notas fiscais e distribua diesel pelos pontos operacionais." action={<button className="button button--primary" onClick={() => { setFormError(null); setForm(null) }}><Plus size={18} />Nova entrada</button>} />
    {success && <div className="success-banner" role="status">{success}</div>}
    <form className="orders-filters abastecimento-filters" onSubmit={applyFilters}><header><h2>Filtros</h2><p>Encontre entradas por período, produto, NF ou ponto.</p></header><div className="orders-filters__grid"><label>Data inicial<input type="date" value={filters.data_inicio || ''} onChange={e => updateFilter('data_inicio', e.target.value)} /></label><label>Data final<input type="date" value={filters.data_fim || ''} onChange={e => updateFilter('data_fim', e.target.value)} /></label><label>Produto<select value={filters.produto_id || ''} onChange={e => updateFilter('produto_id', e.target.value)}><option value="">Todos</option>{productOptions.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label><label>Número da NF<input value={filters.numero_nf || ''} onChange={e => updateFilter('numero_nf', e.target.value)} /></label><label>Ponto de recebimento<select value={filters.ponto_id || ''} onChange={e => updateFilter('ponto_id', e.target.value)}><option value="">Todos</option>{pontos.map(item => <option key={item.id} value={item.id}>{item.codigo} — {item.nome}</option>)}</select></label></div><footer><button className="button button--secondary" type="button" onClick={clear}>Limpar filtros</button><button className="button button--primary">Aplicar filtros</button></footer></form>
    <section className="orders-results" aria-live="polite"><header><div><h2>Entradas registradas</h2><p>{!loading && !error ? `${pagination.total} registro(s) encontrado(s)` : 'Consulta às entradas de combustível'}</p></div></header>{loading ? <OrdersLoading /> : error ? <ErrorState message={error} onRetry={() => void load(filters, pagination.page)} /> : entradas.length ? <EntradaTable entradas={entradas} onView={setDetails} onEdit={id => void edit(id)} onDelete={setConfirm} /> : <div className="orders-message"><Search /><div><h3>Nenhuma entrada encontrada.</h3><p>Cadastre uma entrada ou revise os filtros informados.</p></div></div>}{pagination.total > 0 && <EntradaPagination pagination={pagination} loading={loading} onPage={nextPage => void load(filters, nextPage)} />}</section>
    {form !== undefined && <EntradaFormModal entrada={form} produtos={productOptions} pontos={pontos} compatibilidades={compatibilidades} saving={saving} error={formError} onClose={() => !saving && setForm(undefined)} onSave={payload => void save(payload)} />}{details && <EntradaDetailsModal entrada={details} onClose={() => setDetails(null)} onRegister={destino => { setDetails(null); setDirect({ entrada: details, destino }) }} />}{direct && <FrotaDiretaAbastecimentoModal destino={direct.destino} dataEntrada={direct.entrada.data_entrada} litrosNf={direct.entrada.litros_nf} valorNf={direct.entrada.valor_total_nf} produtoId={direct.entrada.produto_id} projects={projects} pontos={pontos} onClose={() => setDirect(null)} onSaved={() => { setDirect(null); setSuccess('Abastecimento da frota direta registrado.'); void load(filters, pagination.page) }} />}{confirm && <ConfirmDialog title="Excluir entrada?" message="Tem certeza que deseja excluir esta entrada?" busy={busy} error={null} confirmLabel="Excluir" busyLabel="Excluindo..." onCancel={() => !busy && setConfirm(null)} onConfirm={() => void remove()} />}
  </>
}


function EntradaPagination({ pagination, loading, onPage }: { pagination: { page: number; limit: number; total: number; total_pages: number }; loading: boolean; onPage: (page: number) => void }) {
  const start = pagination.total ? (pagination.page - 1) * pagination.limit + 1 : 0
  const end = Math.min(pagination.page * pagination.limit, pagination.total)
  const pages = paginationPages(pagination.page, pagination.total_pages)
  return <footer className="historico-pagination entradas-pagination"><span>Mostrando {start}–{end} de {pagination.total} registros</span><nav aria-label="Paginação das entradas"><button className="button button--secondary" type="button" disabled={loading || pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>Anterior</button>{pages.map((page, index) => page === 'ellipsis' ? <span key={`ellipsis-${index}`} aria-hidden="true">…</span> : <button key={page} className={`button ${page === pagination.page ? 'button--primary' : 'button--secondary'}`} type="button" aria-current={page === pagination.page ? 'page' : undefined} disabled={loading || page === pagination.page} onClick={() => onPage(page)}>{page}</button>)}<button className="button button--secondary" type="button" disabled={loading || pagination.page >= pagination.total_pages} onClick={() => onPage(pagination.page + 1)}>Próxima</button></nav></footer>
}

function paginationPages(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  const visible = new Set([1, total, current - 1, current, current + 1].filter(page => page >= 1 && page <= total))
  const result: Array<number | 'ellipsis'> = []
  Array.from(visible).sort((a, b) => a - b).forEach((page, index, values) => { if (index > 0 && page - values[index - 1]! > 1) result.push('ellipsis'); result.push(page) })
  return result
}

function EntradaTable({ entradas, onView, onEdit, onDelete }: { entradas: Entrada[]; onView: (entrada: Entrada) => void; onEdit: (id: string) => void; onDelete: (entrada: Entrada) => void }) { return <><div className="orders-table-wrap"><table className="orders-table abastecimento-table"><thead><tr><th>Data</th><th>NF</th><th>Produto</th><th>Litros NF</th><th>Total distribuído</th><th>Valor</th><th>Ações</th></tr></thead><tbody>{entradas.map(entrada => <tr key={entrada.id}><td>{formatDate(entrada.data_entrada)}</td><td><strong>{entrada.numero_nf}</strong></td><td>{entrada.produto.nome}</td><td>{formatQuantity(entrada.litros_nf)} L</td><td>{entrada.produto.codigo === 'ARLA_32' ? '—' : `${formatQuantity(entrada.total_distribuido)} L`}</td><td>{formatCurrency(entrada.valor_total_nf)}</td><td><span className="order-actions"><button aria-label="Visualizar" className="button button--secondary" title="Visualizar" onClick={() => onView(entrada)}><Eye size={16} aria-hidden="true" /></button><button aria-label="Editar" className="button button--edit" title="Editar" onClick={() => onEdit(entrada.id)}><SquarePen size={16} aria-hidden="true" /></button><button aria-label="Excluir" className="button button--danger" title="Excluir" onClick={() => onDelete(entrada)}><Trash size={16} aria-hidden="true" /></button></span></td></tr>)}</tbody></table></div><div className="orders-mobile-list">{entradas.map(entrada => <article className="order-mobile-card" key={entrada.id}><header><div><small>{formatDate(entrada.data_entrada)}</small><strong>{entrada.numero_nf}</strong></div><span className="status-badge status-badge--finalizada">{entrada.produto.nome}</span></header><dl><div><dt>Litros NF</dt><dd>{formatQuantity(entrada.litros_nf)} L</dd></div><div><dt>Total distribuído</dt><dd>{entrada.produto.codigo === 'ARLA_32' ? '—' : `${formatQuantity(entrada.total_distribuido)} L`}</dd></div><div><dt>Valor</dt><dd>{formatCurrency(entrada.valor_total_nf)}</dd></div></dl><span className="order-actions"><button aria-label="Visualizar" className="button button--secondary" title="Visualizar" onClick={() => onView(entrada)}><Eye size={16} aria-hidden="true" /></button><button aria-label="Editar" className="button button--edit" title="Editar" onClick={() => onEdit(entrada.id)}><SquarePen size={16} aria-hidden="true" /></button><button aria-label="Excluir" className="button button--danger" title="Excluir" onClick={() => onDelete(entrada)}><Trash size={16} aria-hidden="true" /></button></span></article>)}</div></> }
