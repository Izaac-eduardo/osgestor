import { useEffect, useMemo, useState } from 'react'
import { LoaderCircle, X } from 'lucide-react'
import type { AbastecimentoProduto, Entrada, EntradaPayload, PontoOperacional } from '../../types/abastecimentos'
import { formatCurrencyCentsInput, formatCurrencyNumber, formatCurrencyInput, formatLitersInput, formatLitersNumber, parseCurrencyInput, parseLitersInput } from '../../utils/number-inputs'

type Props = { entrada: Entrada | null; produtos: AbastecimentoProduto[]; pontos: PontoOperacional[]; compatibilidades: Record<string, string[]>; saving: boolean; error: string | null; onClose: () => void; onSave: (payload: EntradaPayload) => void }
type Form = { data_entrada: string; numero_nf: string; produto_id: string; litros_nf: string; valor_total_nf: string; observacoes: string; destinos: Record<string, string> }

const initial = (entrada: Entrada | null, produtos: AbastecimentoProduto[]): Form => ({
  data_entrada: entrada?.data_entrada?.slice(0, 10) || new Date().toISOString().slice(0, 10),
  numero_nf: entrada?.numero_nf || '', produto_id: entrada?.produto_id || produtos[0]?.id || '',
  litros_nf: entrada ? formatLitersInput(String(entrada.litros_nf)) : '', valor_total_nf: entrada ? formatCurrencyNumber(entrada.valor_total_nf) : '',
  observacoes: entrada?.observacoes || '', destinos: Object.fromEntries((entrada?.destinos || []).map(item => [item.ponto_id, String(item.litros)])),
})

export function EntradaFormModal({ entrada, produtos, pontos, compatibilidades, saving, error, onClose, onSave }: Props) {
  const [form, setForm] = useState(() => initial(entrada, produtos))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const produto = produtos.find(item => item.id === form.produto_id)
  const pontosCompativeis = useMemo(() => pontos.filter(ponto => compatibilidades[ponto.id]?.includes(form.produto_id) && ponto.status === 'ATIVO'), [compatibilidades, form.produto_id, pontos])
  const total = Object.values(form.destinos).reduce((sum, value) => sum + (parseLitersInput(value) || 0), 0)

  useEffect(() => {
    const valid = new Set(pontosCompativeis.map(item => item.id))
    setForm(current => ({ ...current, destinos: Object.fromEntries(Object.entries(current.destinos).filter(([id, value]) => valid.has(id) && value.trim() !== '')) }))
  }, [pontosCompativeis])

  const set = (field: keyof Form, value: string) => { setForm(current => ({ ...current, [field]: value })); setErrors(current => ({ ...current, [field]: '' })) }
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (!form.data_entrada) next.data_entrada = 'Informe a data.'
    if (!form.numero_nf.trim()) next.numero_nf = 'Informe o número da NF.'
    if (!form.produto_id) next.produto_id = 'Selecione o produto.'
    const litros = parseLitersInput(form.litros_nf); const valor = parseCurrencyInput(form.valor_total_nf)
    if (!(litros !== null && litros > 0)) next.litros_nf = 'Informe litros maiores que zero.'
    if (valor === null || valor < 0) next.valor_total_nf = 'Informe um valor igual ou maior que zero.'
    for (const value of Object.values(form.destinos)) { const parsed = parseLitersInput(value); if (value && !(parsed !== null && parsed > 0)) next.destinos = 'Cada destino preenchido deve ter litros maiores que zero.' }
    setErrors(next)
    if (Object.keys(next).length) return
    onSave({ data_entrada: form.data_entrada, numero_nf: form.numero_nf.trim(), produto_id: form.produto_id, litros_nf: litros!, valor_total_nf: valor!, observacoes: form.observacoes.trim() || null, destinos: Object.entries(form.destinos).filter(([, value]) => value.trim() !== '').map(([ponto_id, litros]) => ({ ponto_id, litros: parseLitersInput(litros)! })) })
  }

  return <div className="modal-backdrop"><form className="order-form abastecimento-form" role="dialog" aria-modal="true" aria-labelledby="entrada-form-title" onSubmit={submit}>
    <header><div><span>{entrada ? 'Editar cadastro' : 'Novo cadastro'}</span><h2 id="entrada-form-title">{entrada ? 'Editar entrada' : 'Nova entrada'}</h2></div><button className="icon-button" type="button" onClick={onClose} disabled={saving} aria-label="Fechar formulário"><X /></button></header>
    <main><div className="form-grid"><Field label="Data" error={errors.data_entrada}><input type="date" value={form.data_entrada} onChange={event => set('data_entrada', event.target.value)} /></Field><Field label="Número da NF" error={errors.numero_nf}><input value={form.numero_nf} maxLength={80} onChange={event => set('numero_nf', event.target.value)} /></Field><Field label="Produto" error={errors.produto_id}><select value={form.produto_id} onChange={event => set('produto_id', event.target.value)}>{produtos.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></Field><Field label="Litros da NF" error={errors.litros_nf}><input inputMode="decimal" placeholder="0,000" value={form.litros_nf} onChange={event => set('litros_nf', formatLitersInput(event.target.value))} /></Field><Field label="Valor total da NF" error={errors.valor_total_nf}><input inputMode="decimal" placeholder="R$ 0,00" value={form.valor_total_nf} onChange={event => set('valor_total_nf', formatCurrencyCentsInput(event.target.value))} onBlur={() => set('valor_total_nf', formatCurrencyInput(form.valor_total_nf, true))} /></Field><label className="form-field form-field--wide">Observações<textarea rows={3} value={form.observacoes} onChange={event => set('observacoes', event.target.value)} /></label></div>
      {produto?.permite_distribuicao && <section className="abastecimento-distribution"><div className="abastecimento-section-heading"><div><h3>Distribuição</h3><p>Informe somente os pontos que receberam litros.</p></div><strong>Total distribuído: {formatLitersNumber(total)} L</strong></div>{pontosCompativeis.length ? <div className="distribution-grid"><div className="distribution-grid__header"><span>Ponto</span><span>Litros</span></div>{pontosCompativeis.map(ponto => <label className="distribution-row" key={ponto.id}><span><strong>{ponto.codigo}</strong><small>{ponto.nome}</small></span><input aria-label={`Litros para ${ponto.codigo}`} inputMode="decimal" placeholder="0,000" value={form.destinos[ponto.id] || ''} onChange={event => setForm(current => ({ ...current, destinos: { ...current.destinos, [ponto.id]: formatLitersInput(event.target.value) } }))} /></label>)}</div> : <p className="abastecimento-muted">Nenhum ponto compatível ativo para este produto.</p>}{errors.destinos && <p className="form-api-error" role="alert">{errors.destinos}</p>}</section>}
      {error && <p className="form-api-error" role="alert">{error}</p>}
    </main><footer><button className="button button--secondary" type="button" disabled={saving} onClick={onClose}>Cancelar</button><button className="button button--primary" disabled={saving}>{saving ? <><LoaderCircle className="spin" size={16} />Salvando...</> : 'Salvar entrada'}</button></footer>
  </form></div>
}
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactElement }) { return <label className="form-field">{label}{children}{error && <small>{error}</small>}</label> }
