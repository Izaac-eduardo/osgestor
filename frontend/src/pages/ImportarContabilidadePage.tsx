import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { SharedDecisionSection, type SharedDecisionItem } from '../components/accounting/SharedDecisionSection'
import { AccountingReviewQueue, type AccountingReviewItem } from '../components/accounting/AccountingReviewQueue'
import { api } from '../services/api'
import { getFleets } from '../services/fleets'
import { responseArray } from '../services/response-shapes'
import type { Fleet } from '../types/fleets'
import { getImportDecisionErrorMessage } from '../utils/import-decision-error'
import { formatCurrency, formatDate } from '../utils/formatters'
import '../styles/maintenance.css'

type ImportSummary = { id: string; arquivo_nome: string; criado_em?: string | null; status?: string | null; valor_elegivel?: string | number | null; total: number; classificados: number; pendentes: number; pendentes_classificacao: number; pendentes_frota: number; reimportada: boolean }
type ImportItem = { valor_total: string | number | null; motivo_pendencia: string | null; despesa_compartilhada_status: string | null }
type PreviewItem = SharedDecisionItem & AccountingReviewItem & { combustivel_status: string | null }
type Preview = { token: string; arquivo_nome: string; hash_arquivo: string; arquivo_ja_importado: boolean; total: number; periodo: { inicio: string; fim: string }; intervalo_observado: { inicio: string | null; fim: string | null }; historico_sem_periodo: number; periodo_sobreposto: boolean; frotas_identificadas: string[]; duplicados: number; valor_duplicado: string; fora_periodo: number; valor_fora_periodo: string; pendentes: number; valor_pendente_classificacao: string; valor_compartilhado_aguardando: string; valor_excluido_escopo: string; compartilhadas_aguardando: number; compartilhadas_aprovadas: number; compartilhadas_desconsideradas: number; valor_compartilhado_aprovado: string; confirmacao_bloqueada: boolean; total_elegivel: string; itens: PreviewItem[] }
type Decision = 'APROVAR' | 'DESCONSIDERAR' | 'AGUARDAR'

const pendingReasonLabels: Record<string, string> = { CLASSIFICACAO_NAO_MAPEADA: 'Classificação não identificada', FROTA_NAO_IDENTIFICADA: 'Frota não identificada', DESPESA_COMPARTILHADA_AGUARDANDO_DECISAO: 'Aguardando decisão', DATA_CONTA_NAO_INFORMADA: 'Data Conta não informada', DATA_CONTA_FORA_DO_PERIODO: 'Data Conta fora do período', COMPETENCIA_ANTERIOR_A_NOVEMBRO_2026: 'Competência anterior ao início autorizado', COMBUSTIVEL_AMBIGUO: 'Combustível com classificação ambígua', DUPLICADO_EM_IMPORTACAO_ANTERIOR: 'Já consta em importação anterior', VALOR_TOTAL_INVALIDO: 'Valor inválido', POSSIVEL_DUPLICIDADE_NO_ARQUIVO: 'Possível repetição no arquivo' }
const reasonLabel = (item: PreviewItem): string => item.fora_periodo_autorizado ? 'Data Conta fora do período informado' : item.combustivel_status === 'FORA_ESCOPO_COMBUSTIVEL' ? 'Fora do escopo: combustível' : item.despesa_compartilhada_status === 'AGUARDANDO_DECISAO' ? 'Aguardando decisão' : item.despesa_compartilhada_status === 'APROVADA' ? 'Incluída' : item.despesa_compartilhada_status === 'DESCONSIDERADA' ? 'Desconsiderada' : item.valor_total_invalido ? 'Valor inválido' : item.duplicado_no_arquivo ? 'Possível repetição' : item.motivo_pendencia?.split(',').map(reason => pendingReasonLabels[reason] || 'Revisar lançamento').join(', ') || 'Pronto para confirmação'

export function ImportarContabilidadePage() {
  const { isAdmin } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
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
  const analyze = async (event: FormEvent) => { event.preventDefault(); if (!file || !periodStart || !periodEnd || busy) return; const form = new FormData(); form.append('arquivo', file); form.append('periodo_inicio', periodStart); form.append('periodo_fim', periodEnd); setBusy(true); setError(''); try { setPreview((await api.post<Preview>('/contabilidade/importacoes/analisar', form)).data); setDestinations({}); setMessage('Arquivo analisado. Nenhum lançamento foi gravado.') } catch (failure) { setError(getImportDecisionErrorMessage(failure, 'Não foi possível analisar o arquivo.')) } finally { setBusy(false) } }
  const decide = async (item: PreviewItem, decisao: Decision) => { if (!preview || busy || item.bloqueios_decisao.length) return; const frotaId = decisao === 'APROVAR' ? destinations[item.linha_original] || null : null; if (decisao === 'APROVAR' && frotaId && !fleets.some(fleet => fleet.id === frotaId)) { setError('Selecione uma frota ativa.'); return } setBusy(true); try { setPreview((await api.patch<Preview>(`/contabilidade/importacoes/${preview.token}/itens/${item.linha_original}/decisao`, { decisao, frota_id: frotaId })).data); if (decisao !== 'APROVAR' || !frotaId) setDestinations(current => ({ ...current, [item.linha_original]: '' })) } catch (failure) { setError(getImportDecisionErrorMessage(failure, 'Não foi possível registrar a decisão.')) } finally { setBusy(false) } }
  const reviewDuplicate = async (item: PreviewItem, decision: 'APROVAR' | 'DESCONSIDERAR') => { if (!preview || busy || !isAdmin) return; const fleetId = decision === 'APROVAR' ? destinations[item.linha_original] || null : null; if (fleetId && !fleets.some(fleet => fleet.id === fleetId)) { setError('Selecione uma frota ativa.'); return } setBusy(true); setError(''); try { const response = (await api.patch<Preview>('/contabilidade/importacoes/' + preview.token + '/itens/' + item.linha_original + '/revisar-duplicidade', { decisao: decision, frota_id: fleetId })).data; setPreview(response); if (!fleetId) setDestinations(current => ({ ...current, [item.linha_original]: '' })); setMessage(decision === 'APROVAR' ? 'Ocorrência incluída após revisão ADMIN.' : 'Ocorrência desconsiderada após revisão ADMIN.') } catch (failure) { setError(getImportDecisionErrorMessage(failure, 'Não foi possível registrar a decisão da possível repetição.')) } finally { setBusy(false) } }
  const confirm = async () => { if (!preview || busy || preview.arquivo_ja_importado || preview.confirmacao_bloqueada) return; setBusy(true); try { await api.post(`/contabilidade/importacoes/${preview.token}/confirmar`); setPreview(null); setFile(null); setDestinations({}); setMessage('Importação concluída após confirmação.'); await load() } catch { setError('Não foi possível confirmar a importação.') } finally { setBusy(false) } }
  const reviewItem = async (item: PreviewItem, value: { natureza: string; destinacao: string; classificacao: string; frota_id: string | null; justificativa: string }) => { if (!preview || busy || !isAdmin) return; setBusy(true); setError(''); try { setPreview((await api.patch<Preview>(`/contabilidade/importacoes/${preview.token}/itens/${item.linha_original}/revisao`, value)).data); setMessage(`Linha ${item.linha_original} revisada.`) } catch (failure) { setError(getImportDecisionErrorMessage(failure, 'NÃ£o foi possÃ­vel registrar a revisÃ£o.')) } finally { setBusy(false) } }
  const shared = preview?.itens.filter(item => item.subcentro_original?.trim().toUpperCase() === 'FROTAS DIVERSAS' && item.combustivel_status !== 'FORA_ESCOPO_COMBUSTIVEL') ?? []

  return <>
    <PageHeader title="Importar contabilidade" subtitle="Analise e confirme relatórios contábeis" />
    <form className="maintenance-panel accounting-upload" onSubmit={analyze}>
      <label className="accounting-upload__field"><span>Início da competência</span><input type="date" min="2026-11-01" required value={periodStart} onChange={event => setPeriodStart(event.target.value)} /></label>
      <label className="accounting-upload__field"><span>Fim da competência</span><input type="date" min="2026-11-01" required value={periodEnd} onChange={event => setPeriodEnd(event.target.value)} /></label>
      <label className="accounting-upload__field"><span>Arquivo contábil</span><input type="file" accept=".xls,.xlsx" required onChange={event => setFile(event.target.files?.[0] || null)} /><small className="accounting-upload__filename">{file?.name || 'Nenhum arquivo selecionado'}</small></label>
      <button className="button button--primary accounting-upload__submit" disabled={!file || !periodStart || !periodEnd || busy}>{busy ? 'Analisando arquivo…' : 'Analisar arquivo'}</button>
      {message && <p className="accounting-upload__message" role="status">{message}</p>}{error && <p className="maintenance-error accounting-upload__message" role="alert">{error}</p>}
    </form>
    {preview && <section className="maintenance-panel"><header><h2>Prévia — {preview.arquivo_nome}</h2><button type="button" className="button button--primary" disabled={busy || preview.arquivo_ja_importado || preview.confirmacao_bloqueada} onClick={() => void confirm()}>Confirmar importação</button></header>
      <p>{'Competência informada: '}{formatDate(preview.periodo.inicio)} a {formatDate(preview.periodo.fim)}. {'Datas no arquivo: '}{formatDate(preview.intervalo_observado.inicio)} a {formatDate(preview.intervalo_observado.fim)}.</p>
      <p>Pendentes: {preview.pendentes} · Total elegível: {formatCurrency(Number(preview.total_elegivel))}</p>
      <p>Classificação pendente: {formatCurrency(Number(preview.valor_pendente_classificacao))} · Compartilhadas aguardando: {formatCurrency(Number(preview.valor_compartilhado_aguardando))} · Fora do escopo: {formatCurrency(Number(preview.valor_excluido_escopo))}</p>
      <p>Compartilhadas: {preview.compartilhadas_aguardando} aguardando · {preview.compartilhadas_aprovadas} aprovadas · {preview.compartilhadas_desconsideradas} desconsideradas</p>
      {preview.confirmacao_bloqueada && <p className="maintenance-warning">Confirmação bloqueada por pendências ou inconsistências críticas.</p>}
      {preview.arquivo_ja_importado && <p className="maintenance-warning">Este arquivo já consta no histórico; a confirmação está bloqueada.</p>}
      {preview.historico_sem_periodo > 0 && <p className="maintenance-warning">Há {preview.historico_sem_periodo} importação(ões) anterior(es) sem período contábil. É necessária reconciliação administrativa antes de confirmar qualquer novo período.</p>}
      {preview.periodo_sobreposto && <p className="maintenance-warning">O intervalo informado se sobrepõe a um período já confirmado.</p>}
      {preview.fora_periodo > 0 && <p className="maintenance-warning">{preview.fora_periodo} lançamento(s) têm Data Conta ausente ou fora do intervalo informado.</p>}
      <div className="maintenance-table-wrap"><table><thead><tr><th>Linha</th><th>Produto</th><th>Subcentro</th><th>Data</th><th>Valor</th><th>Situação</th></tr></thead><tbody>{preview.itens.map(item => <tr key={item.linha_original}><td>{item.linha_original}</td><td>{item.produto_original || '—'}</td><td>{item.subcentro_original || '—'}</td><td>{item.data_conta ? formatDate(item.data_conta) : '—'}</td><td>{item.valor_total == null ? '—' : formatCurrency(item.valor_total)}</td><td>{reasonLabel(item)}</td></tr>)}</tbody></table></div>
      <AccountingReviewQueue items={preview.itens as AccountingReviewItem[]} fleets={fleets} busy={busy} isAdmin={isAdmin} onReview={(item, value) => void reviewItem(item as PreviewItem, value)} />
      <SharedDecisionSection items={shared} fleets={fleets} destinations={destinations} busy={busy} isAdmin={isAdmin} onReviewDuplicate={(item, decision) => void reviewDuplicate(item as PreviewItem, decision)} onDestinationChange={(line, fleetId) => setDestinations(current => ({ ...current, [line]: fleetId }))} onDecision={(item, decision) => void decide(item as PreviewItem, decision)} />
    </section>}
    {loading ? <p>Carregando histórico...</p> : <section className="maintenance-panel"><header><div><h2>Histórico de importações</h2><p>{imports.length} arquivo(s) encontrado(s).</p></div></header>{historyError && <p className="maintenance-warning">{historyError}</p>}{imports.length === 0 ? <p>Nenhuma importação contábil encontrada.</p> : <div className="maintenance-table-wrap"><table><thead><tr><th>Arquivo</th><th>Data/hora</th><th>Status</th><th>Lançamentos</th><th>Elegíveis</th><th>Pendências</th><th>Valor elegível</th></tr></thead><tbody>{imports.map(item => { const value = item.valor_elegivel === undefined || item.valor_elegivel === null ? historyEligibleValues[item.id] : Number(item.valor_elegivel); return <tr key={item.id}><td>{item.arquivo_nome}</td><td>{item.criado_em ? formatDate(item.criado_em) : 'Não disponível'}</td><td>{item.status || 'Registrada'}</td><td>{item.total}</td><td>{item.classificados}</td><td>{item.pendentes}</td><td>{value === null || value === undefined ? 'Não disponível' : formatCurrency(value)}</td></tr> })}</tbody></table></div>}</section>}
  </>
}
