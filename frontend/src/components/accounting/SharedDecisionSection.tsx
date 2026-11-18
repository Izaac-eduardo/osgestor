import React from 'react'
import type { ManualDecisionBlock } from '../../types/accounting-decision'
import { formatCurrency, formatShortDate } from '../../utils/formatters'

void React
export type SharedDecisionItem = { linha_original: number; produto_original: string | null; data_conta: string | null; valor_total: number | null; frota_destino: string | null; despesa_compartilhada_status: string; bloqueios_decisao: ManualDecisionBlock[]; duplicado_no_arquivo: boolean; linhas_duplicadas: number[]; duplicidade_revisada: boolean; revisada_por: string | null }
type Decision = 'APROVAR' | 'DESCONSIDERAR' | 'AGUARDAR'
type Props = { items: SharedDecisionItem[]; busy: boolean; isAdmin: boolean; fleets?: unknown[]; destinations?: Record<number, string>; onDestinationChange?: (line: number, fleetId: string) => void; onDecision: (item: SharedDecisionItem, decision: Decision) => void; onReviewDuplicate: (item: SharedDecisionItem, decision: 'APROVAR' | 'DESCONSIDERAR') => void }
const statusLabel: Record<string, string> = { AGUARDANDO_DECISAO: 'Aguardando decisão', APROVADA: 'Aprovada como compartilhada', DESCONSIDERADA: 'Desconsiderada', NAO_COMPARTILHADA: 'Pronta para confirmação' }

export function SharedDecisionSection({ items, busy, isAdmin, onDecision, onReviewDuplicate }: Props) {
  if (!items.length) return null
  return <section className="shared-decisions" aria-labelledby="shared-decisions-title">
    <h3 id="shared-decisions-title">Decisão manual — FROTAS DIVERSAS</h3>
    <p>Escolha entre aprovar como despesa compartilhada ou desconsiderar. Nenhuma frota é atribuída.</p>
    <div className="shared-decisions__table-wrap"><table className="shared-decisions__table">
      <thead><tr><th>Data</th><th>Descrição</th><th>Valor</th><th>Destino financeiro</th><th>Situação</th><th>Ações</th></tr></thead>
      <tbody>{items.map(item => {
        const duplicateOnly = item.duplicado_no_arquivo && !item.duplicidade_revisada && item.bloqueios_decisao.every(block => block.codigo === 'DUPLICATE_IN_FILE')
        const blocked = item.bloqueios_decisao.length > 0 && !duplicateOnly
        const pending = item.despesa_compartilhada_status === 'AGUARDANDO_DECISAO'
        const disabled = busy || blocked || !pending || (duplicateOnly && !isAdmin)
        const label = duplicateOnly ? 'Possível repetição — decisão ADMIN' : blocked ? 'Bloqueado' : statusLabel[item.despesa_compartilhada_status] || 'Aguardando decisão'
        return <tr key={item.linha_original}>
          <td data-label="Data">{item.data_conta ? formatShortDate(item.data_conta) : '—'}</td>
          <td data-label="Descrição" className="shared-decisions__description"><span>{item.produto_original || 'Descrição não informada'}</span>{item.duplicado_no_arquivo && <p className="shared-decisions__notice">Possível coincidência com a(s) linha(s) {item.linhas_duplicadas.filter(line => line !== item.linha_original).join(', ')}.</p>}{blocked && <ul className="maintenance-warning" aria-label={`Motivos do bloqueio da linha ${item.linha_original}`}>{item.bloqueios_decisao.map(reason => <li key={reason.codigo}>{reason.mensagem}</li>)}</ul>}{duplicateOnly && !isAdmin && <small>Somente ADMIN pode decidir esta ocorrência.</small>}{item.duplicidade_revisada && <small>Decisão registrada por {item.revisada_por || 'ADMIN'}.</small>}</td>
          <td data-label="Valor" className="shared-decisions__amount">{item.valor_total == null ? '—' : formatCurrency(item.valor_total)}</td>
          <td data-label="Destino financeiro">Despesas compartilhadas</td>
          <td data-label="Situação"><span className={`shared-decisions__status${blocked ? ' shared-decisions__status--blocked' : duplicateOnly ? ' shared-decisions__status--review' : ''}`}>{label}</span></td>
          <td data-label="Ações"><div className="shared-decisions__actions">{duplicateOnly ? <><button type="button" className="button button--primary" disabled={disabled} onClick={() => onReviewDuplicate(item, 'APROVAR')}>Aprovar como compartilhada</button><button type="button" className="button button--secondary" disabled={disabled} onClick={() => onReviewDuplicate(item, 'DESCONSIDERAR')}>Desconsiderar</button></> : blocked ? <><button type="button" className="button button--primary" disabled>Aprovar como compartilhada</button><button type="button" className="button button--secondary" disabled>Desconsiderar</button></> : pending ? <><button type="button" className="button button--primary" disabled={busy} onClick={() => onDecision(item, 'APROVAR')}>Aprovar como compartilhada</button><button type="button" className="button button--secondary" disabled={busy} onClick={() => onDecision(item, 'DESCONSIDERAR')}>Desconsiderar</button></> : <span className="shared-decisions__completed">Decisão concluída</span>}</div></td>
        </tr>
      })}</tbody>
    </table></div>
  </section>
}
