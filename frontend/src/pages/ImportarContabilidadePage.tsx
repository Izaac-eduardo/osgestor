import { useEffect, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/PageHeader'
import { SharedDecisionSection, type SharedDecisionItem } from '../components/accounting/SharedDecisionSection'
import { api } from '../services/api'
import { getFleets } from '../services/fleets'
import { responseArray } from '../services/response-shapes'
import type { Fleet } from '../types/fleets'
import { formatCurrency, formatDate } from '../utils/formatters'
import { getImportDecisionErrorMessage } from '../utils/import-decision-error'
import '../styles/maintenance.css'

type ImportSummary = { id: string; arquivo_nome: string; criado_em?: string | null; status?: string | null; valor_elegivel?: string | number | null; total: number; classificados: number; pendentes: number; pendentes_classificacao: number; pendentes_frota: number; reimportada: boolean }
type ImportItem = { valor_total: string | number | null; motivo_pendencia: string | null; despesa_compartilhada_status: string | null }
type PreviewItem = SharedDecisionItem & { subcentro_original: string | null; motivo_pendencia: string | null; duplicado_no_arquivo: boolean; duplicado_em_importacao_anterior: boolean; fora_periodo_autorizado: boolean; valor_total_invalido: boolean; combustivel_status: string | null }
type Preview = { token: string; arquivo_nome: string; hash_arquivo: string; arquivo_ja_importado: boolean; total: number; periodo: { inicio: string | null; fim: string | null }; frotas_identificadas: string[]; duplicados: number; valor_duplicado: string; fora_periodo: number; valor_fora_periodo: string; pendentes: number; valor_pendente_classificacao: string; valor_compartilhado_aguardando: string; valor_excluido_escopo: string; compartilhadas_aguardando: number; compartilhadas_aprovadas: number; compartilhadas_desconsideradas: number; valor_compartilhado_aprovado: string; confirmacao_bloqueada: boolean; total_elegivel: string; itens: PreviewItem[] }
type Decision = 'APROVAR' | 'DESCONSIDERAR' | 'AGUARDAR'

const reasonLabel = (item: PreviewItem): string => item.combustivel_status === 'FORA_ESCOPO_COMBUSTIVEL' ? 'Fora do escopo: combustível' : item.despesa_compartilhada_status === 'AGUARDANDO_DECISAO' ? 'Despesa compartilhada aguardando decisão' : item.despesa_compartilhada_status === 'APROVADA' ? 'Despesa compartilhada aprovada' : item.despesa_compartilhada_status === 'DESCONSIDERADA' ? 'Despesa compartilhada desconsiderada' : item.valor_total_invalido ? 'Valor inválido' : item.duplicado_no_arquivo ? 'Possível duplicidade identificada' : item.motivo_pendencia || 'Elegível'

export function ImportarContabilidadePage() {
  const [file, setFile] = useState<File | null>(null)
  const [imports, setImports] = useState<ImportSummary[]>([])
  const [fleets, setFleets] = useState<Fleet[]>([])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [destinations, setDestinations] = useState<Record<number, string>>({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [historyEligibleValues, setHistoryEligibleValues] = useState<Record<string, number | null>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setLoading(true); setHistoryError('')
    try {
      const summaries = responseArray<ImportSummary>((await api.get('/contabilidade/importacoes')).data, 'lista de importações contábeis')
      setImports(summaries)
      const values = await Promise.all(summaries.map(async summary => {
        if (summary.valor_elegivel !== undefined && summary.valor_elegivel !== null) return [summary.id, Number(summary.valor_elegivel)] as const
        try {
          const response = await api.get<{ itens?: ImportItem[] }>(`/contabilidade/importacoes/${summary.id}`)
          const items = response.data.itens || []
          const eligible = items.filter(item => !item.motivo_pendencia && ['NAO_COMPARTILHADA', 'APROVADA'].includes(item.despesa_compartilhada_status || ''))
          return [summary.id, eligible.reduce((total, item) => total + Number(item.valor_total || 0), 0)] as const
        } catch {
          return [summary.id, null] as const
        }
      }))
      setHistoryEligibleValues(Object.fromEntries(values))
      if (values.some(([, value]) => value === null)) setHistoryError('Alguns valores elegíveis não puderam ser consultados.')
    } catch { setImports([]); setHistoryEligibleValues({}); setError('Não foi possível carregar as importações contábeis.') } finally { setLoading(false) }
  }
  useEffect(() => { void load(); getFleets().then(value => setFleets(responseArray<Fleet>(value, 'frotas'))).catch(() => setError('Não foi possível carregar as frotas.')) }, [])
  const analyze = async (event: FormEvent) => { event.preventDefault(); if (!file || busy) return; const form = new FormData(); form.append('arquivo', file); setBusy(true); setError(''); try { setPreview((await api.post<Preview>('/contabilidade/importacoes/analisar', form)).data); setDestinations({}); setMessage('Arquivo analisado. Nenhum lançamento foi gravado.') } catch { setError('Não foi possível analisar o arquivo.') } finally { setBusy(false) } }
  const decide = async (item: PreviewItem, decisao: Decision) => { if (!preview || busy || item.bloqueios_decisao.length) return; const frotaId = decisao === 'APROVAR' ? destinations[item.linha_original] || null : null; if (decisao === 'APROVAR' && frotaId && !fleets.some(fleet => fleet.id === frotaId)) { setError('Selecione uma frota ativa.'); return } setBusy(true); try { setPreview((await api.patch<Preview>(`/contabilidade/importacoes/${preview.token}/itens/${item.linha_original}/decisao`, { decisao, frota_id: frotaId })).data); if (decisao !== 'APROVAR' || !frotaId) setDestinations(current => ({ ...current, [item.linha_original]: '' })) } catch (failure) { setError(getImportDecisionErrorMessage(failure, 'Não foi possível registrar a decisão.')) } finally { setBusy(false) } }
  const confirm = async () => { if (!preview || busy || preview.arquivo_ja_importado || preview.confirmacao_bloqueada) return; setBusy(true); try { await api.post(`/contabilidade/importacoes/${preview.token}/confirmar`); setPreview(null); setFile(null); setDestinations({}); setMessage('Importação concluída após confirmação.'); await load() } catch { setError('Não foi possível confirmar a importação.') } finally { setBusy(false) } }
  const shared = preview?.itens.filter(item => item.subcentro_original?.trim().toUpperCase() === 'FROTAS DIVERSAS' && item.combustivel_status !== 'FORA_ESCOPO_COMBUSTIVEL') ?? []

  return <>
    <PageHeader title="Importar contabilidade" subtitle="Analise e confirme relatórios contábeis" />
    <form className="maintenance-panel" onSubmit={analyze}><input type="file" accept=".xls,.xlsx" onChange={event => setFile(event.target.files?.[0] || null)} /><button className="button button--primary" disabled={!file || busy}>{busy ? 'Processando...' : 'Analisar arquivo'}</button>{message && <p>{message}</p>}{error && <p className="maintenance-error">{error}</p>}</form>
    {preview && <section className="maintenance-panel"><header><h2>Prévia — {preview.arquivo_nome}</h2><button type="button" className="button button--primary" disabled={busy || preview.arquivo_ja_importado || preview.confirmacao_bloqueada} onClick={() => void confirm()}>Confirmar importação</button></header>
      <p>Pendentes: {preview.pendentes} · Total elegível: R$ {preview.total_elegivel}</p>
      <p>Classificação pendente: R$ {preview.valor_pendente_classificacao} · Compartilhadas aguardando: R$ {preview.valor_compartilhado_aguardando} · Fora do escopo: R$ {preview.valor_excluido_escopo}</p>
      <p>Compartilhadas: {preview.compartilhadas_aguardando} aguardando · {preview.compartilhadas_aprovadas} aprovadas · {preview.compartilhadas_desconsideradas} desconsideradas</p>
      {preview.confirmacao_bloqueada && <p className="maintenance-warning">Confirmação bloqueada por pendências ou inconsistências críticas.</p>}
      <div className="maintenance-table-wrap"><table><thead><tr><th>Linha</th><th>Produto</th><th>Subcentro</th><th>Data</th><th>Valor</th><th>Situação</th></tr></thead><tbody>{preview.itens.map(item => <tr key={item.linha_original}><td>{item.linha_original}</td><td>{item.produto_original || '—'}</td><td>{item.subcentro_original || '—'}</td><td>{item.data_conta || '—'}</td><td>{item.valor_total == null ? '—' : `R$ ${item.valor_total.toFixed(2)}`}</td><td>{reasonLabel(item)}</td></tr>)}</tbody></table></div>
      <SharedDecisionSection items={shared} fleets={fleets} destinations={destinations} busy={busy} onDestinationChange={(line, fleetId) => setDestinations(current => ({ ...current, [line]: fleetId }))} onDecision={(item, decision) => void decide(item as PreviewItem, decision)} />
    </section>}
    {loading ? <p>Carregando histórico...</p> : <section className="maintenance-panel"><header><div><h2>Histórico de importações</h2><p>{imports.length} arquivo(s) encontrado(s).</p></div></header>{historyError && <p className="maintenance-warning">{historyError}</p>}{imports.length === 0 ? <p>Nenhuma importação contábil encontrada.</p> : <div className="maintenance-table-wrap"><table><thead><tr><th>Arquivo</th><th>Data/hora</th><th>Status</th><th>Lançamentos</th><th>Elegíveis</th><th>Pendências</th><th>Valor elegível</th></tr></thead><tbody>{imports.map(item => { const value = item.valor_elegivel === undefined || item.valor_elegivel === null ? historyEligibleValues[item.id] : Number(item.valor_elegivel); return <tr key={item.id}><td>{item.arquivo_nome}</td><td>{item.criado_em ? formatDate(item.criado_em) : 'Não disponível'}</td><td>{item.status || 'Registrada'}</td><td>{item.total}</td><td>{item.classificados}</td><td>{item.pendentes}</td><td>{value === null || value === undefined ? 'Não disponível' : formatCurrency(value)}</td></tr> })}</tbody></table></div>}</section>}
  </>
}
