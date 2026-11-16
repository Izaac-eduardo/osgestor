import type { Fleet } from '../../types/fleets'
import type { ManualDecisionBlock } from '../../types/accounting-decision'

export type SharedDecisionItem = {
  linha_original: number
  produto_original: string | null
  data_conta: string | null
  valor_total: number | null
  frota_destino: string | null
  despesa_compartilhada_status: string
  bloqueios_decisao: ManualDecisionBlock[]
}

type Props = {
  items: SharedDecisionItem[]
  fleets: Fleet[]
  destinations: Record<number, string>
  busy: boolean
  onDestinationChange: (line: number, fleetId: string) => void
  onDecision: (item: SharedDecisionItem, decision: 'APROVAR' | 'DESCONSIDERAR' | 'AGUARDAR') => void
}

export function SharedDecisionSection({ items, fleets, destinations, busy, onDestinationChange, onDecision }: Props) {
  if (!items.length) return null

  return <>
    <h3>Decisão manual — FROTAS DIVERSAS</h3>
    <p>O destino padrão é Despesas compartilhadas. A alocação individual é opcional.</p>
    <div className="maintenance-table-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Valor</th><th>Destino financeiro</th><th>Status</th><th>Ações</th></tr></thead><tbody>
      {items.map(item => {
        const blocked = item.bloqueios_decisao.length > 0
        const disabled = busy || blocked
        return <tr key={item.linha_original}>
          <td>{item.data_conta || '—'}</td>
          <td>{item.produto_original || '—'}{blocked && <ul className="maintenance-warning" aria-label={`Motivos do bloqueio da linha ${item.linha_original}`}>{item.bloqueios_decisao.map(reason => <li key={reason.codigo}>{reason.mensagem}</li>)}</ul>}</td>
          <td>{item.valor_total == null ? '—' : `R$ ${item.valor_total.toFixed(2)}`}</td>
          <td><select aria-label={`Destino da linha ${item.linha_original}`} value={destinations[item.linha_original] || item.frota_destino || ''} disabled={disabled || item.despesa_compartilhada_status !== 'AGUARDANDO_DECISAO'} onChange={event => onDestinationChange(item.linha_original, event.target.value)}><option value="">Despesas compartilhadas</option>{fleets.map(fleet => <option key={fleet.id} value={fleet.id}>{fleet.codigo}{fleet.placa ? ` — ${fleet.placa}` : ''}</option>)}</select></td>
          <td>{blocked ? 'BLOQUEADO' : item.despesa_compartilhada_status}</td>
          <td>{blocked ? <><button type="button" className="button button--primary" disabled>Incluir</button><button type="button" className="button button--secondary" disabled>Desconsiderar</button><button type="button" className="button button--secondary" disabled>Manter pendente</button></> : item.despesa_compartilhada_status === 'AGUARDANDO_DECISAO' ? <><button type="button" className="button button--primary" disabled={busy} onClick={() => onDecision(item, 'APROVAR')}>Incluir</button><button type="button" className="button button--secondary" disabled={busy} onClick={() => onDecision(item, 'DESCONSIDERAR')}>Desconsiderar</button></> : <button type="button" className="button button--secondary" disabled={busy} onClick={() => onDecision(item, 'AGUARDAR')}>Manter pendente</button>}</td>
        </tr>
      })}
    </tbody></table></div>
  </>
}
