import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { SharedDecisionSection, type SharedDecisionItem } from '../components/accounting/SharedDecisionSection'
import { api } from '../services/api'
import { getFleets } from '../services/fleets'
import { responseArray } from '../services/response-shapes'
import type { Fleet } from '../types/fleets'
import { getImportDecisionErrorMessage } from '../utils/import-decision-error'
import { formatCurrency, formatDate } from '../utils/formatters'
import '../styles/maintenance.css'

type ImportSummary = { id: string; arquivo_nome: string; criado_em?: string | null; status?: string | null; valor_elegivel?: string | number | null; total: number; classificados: number; pendentes: number; pendentes_classificacao: number; pendentes_frota: number; reimportada: boolean }
type ImportItem = { valor_total: string | number | null; motivo_pendencia: string | null; despesa_compartilhada_status: string | null }
type PreviewItem = SharedDecisionItem & { subcentro_original: string | null; motivo_pendencia: string | null; duplicado_no_arquivo: boolean; duplicado_em_importacao_anterior: boolean; fora_periodo_autorizado: boolean; valor_total_invalido: boolean; combustivel_status: string | null }
type Preview = { token: string; arquivo_nome: string; hash_arquivo: string; arquivo_ja_importado: boolean; total: number; periodo: { inicio: string; fim: string }; intervalo_observado: { inicio: string | null; fim: string | null }; historico_sem_periodo: number; periodo_sobreposto: boolean; frotas_identificadas: string[]; duplicados: number; valor_duplicado: string; fora_periodo: number; valor_fora_periodo: string; pendentes: number; valor_pendente_classificacao: string; valor_compartilhado_aguardando: string; valor_excluido_escopo: string; compartilhadas_aguardando: number; compartilhadas_aprovadas: number; compartilhadas_desconsideradas: number; valor_compartilhado_aprovado: string; confirmacao_bloqueada: boolean; total_elegivel: string; itens: PreviewItem[] }
type Decision = 'APROVAR' | 'DESCONSIDERAR' | 'AGUARDAR'

const reasonLabel = (item: PreviewItem): string => item.fora_periodo_autorizado ? 'Data Conta fora do periodo informado' : item.combustivel_status === 'FORA_ESCOPO_COMBUSTIVEL' ? 'Fora do escopo: combustivel' : item.despesa_compartilhada_status === 'AGUARDANDO_DECISAO' ? 'Despesa compartilhada aguardando decisao' : item.despesa_compartilhada_status === 'APROVADA' ? 'Despesa compartilhada aprovada' : item.despesa_compartilhada_status === 'DESCONSIDERADA' ? 'Despesa compartilhada desconsiderada' : item.valor_total_invalido ? 'Valor invalido' : item.duplicado_no_arquivo ? 'Possivel duplicidade identificada' : item.motivo_pendencia || 'Elegivel'

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
  const analyze = async (event: FormEvent) => { event.preventDefault(); if (!file || !periodStart || !periodEnd || busy) return; const form = new FormData(); form.append('arquivo', file); form.append('periodo_inicio', periodStart); form.append('periodo_fim', periodEnd); setBusy(true); setError(''); try { setPreview((await api.post<Preview>('/contabilidade/importacoes/analisar', form)).data); setDestinations({}); setMessage('Arquivo analisado. Nenhum lancamento foi gravado.') } catch (failure) { setError(getImportDecisionErrorMessage(failure, 'Nao foi possivel analisar o arquivo.')) } finally { setBusy(false) } }
  const decide = async (item: PreviewItem, decisao: Decision) => { if (!preview || busy || item.bloqueios_decisao.length) return; const frotaId = decisao === 'APROVAR' ? destinations[item.linha_original] || null : null; if (decisao === 'APROVAR' && frotaId && !fleets.some(fleet => fleet.id === frotaId)) { setError('Selecione uma frota ativa.'); return } setBusy(true); try { setPreview((await api.patch<Preview>(`/contabilidade/importacoes/${preview.token}/itens/${item.linha_original}/decisao`, { decisao, frota_id: frotaId })).data); if (decisao !== 'APROVAR' || !frotaId) setDestinations(current => ({ ...current, [item.linha_original]: '' })) } catch (failure) { setError(getImportDecisionErrorMessage(failure, 'Não foi possível registrar a decisão.')) } finally { setBusy(false) } }
  const reviewDuplicate = async (item: PreviewItem, justification: string) => { if (!preview || busy || !isAdmin) return; setBusy(true); setError(''); try { setPreview((await api.patch<Preview>('/contabilidade/importacoes/' + preview.token + '/itens/' + item.linha_original + '/revisar-duplicidade', { justificativa: justification })).data); setMessage('Revisao registrada. A decisao de inclusao continua pendente.') } catch (failure) { setError(getImportDecisionErrorMessage(failure, 'Nao foi possivel revisar a duplicidade.')) } finally { setBusy(false) } }
  const confirm = async () => { if (!preview || busy || preview.arquivo_ja_importado || preview.confirmacao_bloqueada) return; setBusy(true); try { await api.post(`/contabilidade/importacoes/${preview.token}/confirmar`); setPreview(null); setFile(null); setDestinations({}); setMessage('Importação concluída após confirmação.'); await load() } catch { setError('Não foi possível confirmar a importação.') } finally { setBusy(false) } }
  const shared = preview?.itens.filter(item => item.subcentro_original?.trim().toUpperCase() === 'FROTAS DIVERSAS' && item.combustivel_status !== 'FORA_ESCOPO_COMBUSTIVEL') ?? []

  return <>
    <PageHeader title="Importar contabilidade" subtitle="Analise e confirme relatórios contábeis" />
    <form className="maintenance-panel" onSubmit={analyze}><label>In&#237;cio da compet&#234;ncia<input type="date" min="2026-11-01" required value={periodStart} onChange={event => setPeriodStart(event.target.value)} /></label><label>Fim da compet&#234;ncia<input type="date" min="2026-11-01" required value={periodEnd} onChange={event => setPeriodEnd(event.target.value)} /></label><label>Arquivo cont&#225;bil<input type="file" accept=".xls,.xlsx" required onChange={event => setFile(event.target.files?.[0] || null)} /></label><button className="button button--primary" disabled={!file || !periodStart || !periodEnd || busy}>{busy ? 'Processando...' : 'Analisar arquivo'}</button>{message && <p>{message}</p>}{error && <p className="maintenance-error">{error}</p>}</form>
    {preview && <section className="maintenance-panel"><header><h2>Prévia — {preview.arquivo_nome}</h2><button type="button" className="button button--primary" disabled={busy || preview.arquivo_ja_importado || preview.confirmacao_bloqueada} onClick={() => void confirm()}>Confirmar importação</button></header>
      <p>{'Compet\u00eancia informada: '}{preview.periodo.inicio} a {preview.periodo.fim}. {'Datas no arquivo: '}{preview.intervalo_observado.inicio || '\u2014'} a {preview.intervalo_observado.fim || '\u2014'}.</p>
      <p>Pendentes: {preview.pendentes} · Total elegível: R$ {preview.total_elegivel}</p>
      <p>Classificação pendente: R$ {preview.valor_pendente_classificacao} · Compartilhadas aguardando: R$ {preview.valor_compartilhado_aguardando} · Fora do escopo: R$ {preview.valor_excluido_escopo}</p>
      <p>Compartilhadas: {preview.compartilhadas_aguardando} aguardando · {preview.compartilhadas_aprovadas} aprovadas · {preview.compartilhadas_desconsideradas} desconsideradas</p>
      {preview.confirmacao_bloqueada && <p className="maintenance-warning">Confirmação bloqueada por pendências ou inconsistências críticas.</p>}
      {preview.arquivo_ja_importado && <p className="maintenance-warning">Este arquivo já consta no histórico; a confirmação está bloqueada.</p>}
      {preview.historico_sem_periodo > 0 && <p className="maintenance-warning">Há {preview.historico_sem_periodo} importação(ões) anterior(es) sem período contábil. É necessária reconciliação administrativa antes de confirmar qualquer novo período.</p>}
      {preview.periodo_sobreposto && <p className="maintenance-warning">O intervalo informado se sobrepõe a um período já confirmado.</p>}
      {preview.fora_periodo > 0 && <p className="maintenance-warning">{preview.fora_periodo} lançamento(s) têm Data Conta ausente ou fora do intervalo informado.</p>}
      <div className="maintenance-table-wrap"><table><thead><tr><th>Linha</th><th>Produto</th><th>Subcentro</th><th>Data</th><th>Valor</th><th>Situação</th></tr></thead><tbody>{preview.itens.map(item => <tr key={item.linha_original}><td>{item.linha_original}</td><td>{item.produto_original || '—'}</td><td>{item.subcentro_original || '—'}</td><td>{item.data_conta || '—'}</td><td>{item.valor_total == null ? '—' : `R$ ${item.valor_total.toFixed(2)}`}</td><td>{reasonLabel(item)}</td></tr>)}</tbody></table></div>
      <SharedDecisionSection items={shared} fleets={fleets} destinations={destinations} busy={busy} isAdmin={isAdmin} onReviewDuplicate={(item, justification) => void reviewDuplicate(item as PreviewItem, justification)} onDestinationChange={(line, fleetId) => setDestinations(current => ({ ...current, [line]: fleetId }))} onDecision={(item, decision) => void decide(item as PreviewItem, decision)} />
    </section>}
    {loading ? <p>Carregando histórico...</p> : <section className="maintenance-panel"><header><div><h2>Histórico de importações</h2><p>{imports.length} arquivo(s) encontrado(s).</p></div></header>{historyError && <p className="maintenance-warning">{historyError}</p>}{imports.length === 0 ? <p>Nenhuma importação contábil encontrada.</p> : <div className="maintenance-table-wrap"><table><thead><tr><th>Arquivo</th><th>Data/hora</th><th>Status</th><th>Lançamentos</th><th>Elegíveis</th><th>Pendências</th><th>Valor elegível</th></tr></thead><tbody>{imports.map(item => { const value = item.valor_elegivel === undefined || item.valor_elegivel === null ? historyEligibleValues[item.id] : Number(item.valor_elegivel); return <tr key={item.id}><td>{item.arquivo_nome}</td><td>{item.criado_em ? formatDate(item.criado_em) : 'Não disponível'}</td><td>{item.status || 'Registrada'}</td><td>{item.total}</td><td>{item.classificados}</td><td>{item.pendentes}</td><td>{value === null || value === undefined ? 'Não disponível' : formatCurrency(value)}</td></tr> })}</tbody></table></div>}</section>}
  </>
}
