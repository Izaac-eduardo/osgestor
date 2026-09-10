import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, X } from 'lucide-react'
import type { Fleet, FleetPayload, FleetStatus } from '../../types/fleets'

type Props = { item: Fleet | null; saving: boolean; error: string | null; onClose: () => void; onSave: (payload: FleetPayload) => void }
export function FleetFormModal({ item, saving, error, onClose, onSave }: Props) {
  const [codigo, setCodigo] = useState(item?.codigo ?? '')
  const [descricao, setDescricao] = useState(item?.descricao ?? '')
  const [placa, setPlaca] = useState(item?.placa ?? '')
  const [modelo, setModelo] = useState(item?.modelo ?? '')
  const [ano, setAno] = useState(item?.ano?.toString() ?? '')
  const [status, setStatus] = useState<FleetStatus>(item?.status ?? 'ATIVO')
  const [validation, setValidation] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => { const previous = document.activeElement; input.current?.focus(); return () => { if (previous instanceof HTMLElement) previous.focus() } }, [])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose()
      if (event.key !== 'Tab') return
      const elements = form.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')
      if (!elements?.length) return
      const first = elements[0], last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key)
  }, [saving, onClose])
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); if (saving) return
    const code = codigo.trim().toUpperCase().replace(/[\s-]+/g, ''), plate = placa.trim().toUpperCase().replace(/[\s-]+/g, '')
    if (!code) return setValidation('Informe um código de frota ou identificação.')
    if (plate && !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)) return setValidation('Placa inválida. Use ABC1234 ou ABC1D23.')
    if (ano && (!/^\d{4}$/.test(ano) || Number(ano) < 1900 || Number(ano) > 9999)) return setValidation('Informe um ano entre 1900 e 9999.')
    setValidation(null); onSave({ codigo: code, descricao: descricao.trim() || null, placa: plate || null, modelo: modelo.trim() || null, ano: ano ? Number(ano) : null, status })
  }
  return <div className="modal-backdrop"><form ref={form} className="order-form" role="dialog" aria-modal="true" aria-labelledby="fleet-title" onSubmit={submit}>
    <header><div><span>Veículo ou equipamento</span><h2 id="fleet-title">{item ? 'Editar frota' : 'Nova frota'}</h2></div><button type="button" className="icon-button" aria-label="Fechar formulário" disabled={saving} onClick={onClose}><X /></button></header>
    <main><div className="form-grid">
      <label className="form-field">Código da frota / identificação<input ref={input} required maxLength={30} placeholder="CT12, A09 ou OFICINA" value={codigo} disabled={saving} onChange={e => setCodigo(e.target.value)} /><small>Identificações internas também são aceitas; zeros são preservados.</small></label>
      <label className="form-field">Status<select value={status} disabled={saving} onChange={e => setStatus(e.target.value as FleetStatus)}><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option></select></label>
      <label className="form-field form-field--wide">Descrição<textarea rows={3} value={descricao} disabled={saving} onChange={e => setDescricao(e.target.value)} /></label>
      <label className="form-field">Placa<input placeholder="ABC1D23" value={placa} disabled={saving} onChange={e => setPlaca(e.target.value)} /><small>Deixe vazio para equipamentos sem placa.</small></label>
      <label className="form-field">Modelo<input placeholder="416 4" value={modelo} disabled={saving} onChange={e => setModelo(e.target.value)} /></label>
      <label className="form-field">Ano<input inputMode="numeric" maxLength={4} value={ano} disabled={saving} onChange={e => setAno(e.target.value)} /></label>
    </div>{(validation || error) && <p className="form-api-error" role="alert">{validation || error}</p>}</main>
    <footer><button type="button" className="button button--secondary" disabled={saving} onClick={onClose}>Cancelar</button><button className="button button--primary" disabled={saving}>{saving ? <><LoaderCircle size={16} className="spin" />Salvando...</> : 'Salvar frota'}</button></footer>
  </form></div>
}
