import React, { useState } from 'react'
import type { Fleet } from '../../types/fleets'
import type { ManualDecisionBlock } from '../../types/accounting-decision'

void React

export type SharedDecisionItem = {
  linha_original: number; produto_original: string | null; data_conta: string | null; valor_total: number | null
  frota_destino: string | null; despesa_compartilhada_status: string; bloqueios_decisao: ManualDecisionBlock[]
  duplicado_no_arquivo: boolean; linhas_duplicadas: number[]; duplicidade_revisada: boolean
  justificativa_duplicidade: string | null; revisada_por: string | null
}
type Props = {
  items: SharedDecisionItem[]; fleets: Fleet[]; destinations: Record<number, string>; busy: boolean; isAdmin: boolean
  onDestinationChange: (line: number, fleetId: string) => void
  onDecision: (item: SharedDecisionItem, decision: 'APROVAR' | 'DESCONSIDERAR' | 'AGUARDAR') => void
  onReviewDuplicate: (item: SharedDecisionItem, justification: string) => void
}
export function SharedDecisionSection({ items, fleets, destinations, busy, isAdmin, onDestinationChange, onDecision, onReviewDuplicate }: Props) {
  const [justifications, setJustifications] = useState<Record<number, string>>({})
  if (!items.length) return null
  return <>
    <h3>{'Decis\u00e3o manual \u2014 FROTAS DIVERSAS'}</h3>
    <p>{'O destino padr\u00e3o \u00e9 Despesas compartilhadas. A aloca\u00e7\u00e3o individual \u00e9 opcional.'}</p>
    <div className="maintenance-table-wrap"><table><thead><tr><th>Data</th><th>{'Descri\u00e7\u00e3o'}</th><th>Valor</th><th>Destino financeiro</th><th>Status</th><th>{'A\u00e7\u00f5es'}</th></tr></thead><tbody>
      {items.map(item => {
        const duplicateOnly = item.duplicado_no_arquivo && !item.duplicidade_revisada && item.bloqueios_decisao.every(block => block.codigo === 'DUPLICATE_IN_FILE')
        const blocked = item.bloqueios_decisao.length > 0 && !duplicateOnly
        const disabled = busy || blocked || (item.duplicado_no_arquivo && !item.duplicidade_revisada)
        const status = item.duplicidade_revisada ? 'DUPLICIDADE REVISADA \u2014 AGUARDANDO DECIS\u00c3O' : duplicateOnly ? 'POSS\u00cdVEL DUPLICIDADE \u2014 REVIS\u00c3O ADMIN' : blocked ? 'BLOQUEADO' : item.despesa_compartilhada_status
        const lineId = 'duplicate-reason-' + item.linha_original
        return <tr key={item.linha_original}>
          <td>{item.data_conta || '\u2014'}</td>
          <td>{item.produto_original || '\u2014'}{item.duplicado_no_arquivo && <p className="maintenance-warning">Poss\u00edvel coincid\u00eancia com as linhas {item.linhas_duplicadas.filter(line => line !== item.linha_original).join(', ')}. A semelhan\u00e7a n\u00e3o confirma duplicidade.</p>}{blocked && <ul className="maintenance-warning" aria-label={'Motivos do bloqueio da linha ' + item.linha_original}>{item.bloqueios_decisao.map(reason => <li key={reason.codigo}>{reason.mensagem}</li>)}</ul>}{item.duplicidade_revisada && <p>{'Ocorr\u00eancia distinta autorizada por '}{item.revisada_por || 'ADMIN'}. {'Justificativa: '}{item.justificativa_duplicidade}</p>}</td>
          <td>{item.valor_total == null ? '\u2014' : 'R$ ' + item.valor_total.toFixed(2)}</td>
          <td><select aria-label={'Destino da linha ' + item.linha_original} value={destinations[item.linha_original] || item.frota_destino || ''} disabled={disabled || item.despesa_compartilhada_status !== 'AGUARDANDO_DECISAO'} onChange={event => onDestinationChange(item.linha_original, event.target.value)}><option value="">Despesas compartilhadas</option>{fleets.map(fleet => <option key={fleet.id} value={fleet.id}>{fleet.codigo}{fleet.placa ? ' \u2014 ' + fleet.placa : ''}</option>)}</select></td>
          <td>{status}</td>
          <td>{duplicateOnly ? isAdmin ? <><label htmlFor={lineId}>{'Justificativa (m\u00ednimo 20 caracteres)'}</label><textarea id={lineId} value={justifications[item.linha_original] ?? ''} minLength={20} maxLength={1000} disabled={busy} onChange={event => setJustifications(current => ({ ...current, [item.linha_original]: event.target.value }))} /><button type="button" className="button button--primary" disabled={busy || (justifications[item.linha_original] ?? '').trim().length < 20} onClick={() => onReviewDuplicate(item, justifications[item.linha_original] ?? '')}>{'Autorizar ocorr\u00eancia distinta'}</button></> : <span>{'Revis\u00e3o dispon\u00edvel somente para ADMIN.'}</span> : blocked ? <><button type="button" className="button button--primary" disabled>Incluir</button><button type="button" className="button button--secondary" disabled>Desconsiderar</button><button type="button" className="button button--secondary" disabled>Manter pendente</button></> : item.despesa_compartilhada_status === 'AGUARDANDO_DECISAO' ? <><button type="button" className="button button--primary" disabled={busy} onClick={() => onDecision(item, 'APROVAR')}>Incluir</button><button type="button" className="button button--secondary" disabled={busy} onClick={() => onDecision(item, 'DESCONSIDERAR')}>Desconsiderar</button></> : <button type="button" className="button button--secondary" disabled={busy} onClick={() => onDecision(item, 'AGUARDAR')}>Manter pendente</button>}</td>
        </tr>
      })}
    </tbody></table></div>
  </>
}
