import { useEffect, useState, type FormEvent } from 'react'
import axios from 'axios'
import { useAuth } from '../../auth/AuthContext'
import type { SalaryBase, WorkshopPerformance } from '../../types/maintenance'
import type { MaintenanceFilters } from '../../types/maintenance'
import { downloadWorkshopPerformance, getSalaryBases, saveSalaryBase } from '../../services/maintenance'
import { formatCurrency } from '../../utils/formatters'
import { validateSalaryValue } from '../../utils/salary-validation'

type Props = { performance: WorkshopPerformance | null; loading: boolean; hasPeriod: boolean; filters: MaintenanceFilters; onSalarySaved: (ano: number, mes: number) => Promise<void> }
type Competence = { ano: number; mes: number }
const dateBr = (value: string) => value.includes('-') ? value.slice(0, 10).split('-').reverse().join('/') : value
const initialCompetence = (value?: string): Competence => { const source = value ? new Date(`${value}T12:00:00`) : new Date(); return { ano: source.getFullYear(), mes: source.getMonth() + 1 } }

export function WorkshopPerformanceSection({ performance, loading, hasPeriod, filters, onSalarySaved }: Props) {
  const { isAdmin } = useAuth()
  const [salaries, setSalaries] = useState<SalaryBase[] | null>(null)
  const [salaryError, setSalaryError] = useState('')
  const [salarySuccess, setSalarySuccess] = useState('')
  const [salarySaving, setSalarySaving] = useState(false)
  const [competence, setCompetence] = useState(() => initialCompetence(filters.data_inicio))
  const [salaryDraft, setSalaryDraft] = useState<string | null>(null)
  const setSalaryValue = setSalaryDraft
  const selectedSalary = salaries?.find(item => item.ano === competence.ano && item.mes === competence.mes)
  const salaryValue = salaryDraft ?? selectedSalary?.valor_consolidado ?? ''
  const setCompetenceAndValue = (next: Competence) => { setCompetence(next); setSalaryDraft(null) }
  const refreshSalaries = async () => { try { setSalaries(await getSalaryBases()); setSalaryDraft(null) } catch { setSalaryError('Não foi possível carregar os salários-base.'); setSalaries([]) } }
  useEffect(() => { let active = true; getSalaryBases().then(rows => { if (active) setSalaries(rows) }).catch(() => { if (active) { setSalaryError('Não foi possível carregar os salários-base.'); setSalaries([]) } }); return () => { active = false } }, [])
  const saveSalary = async (event: FormEvent) => {
    event.preventDefault(); if (!isAdmin || salarySaving) return
    const value = salaryValue.replace(',', '.').trim(); const validation = validateSalaryValue(value)
    if (validation) { setSalaryError(validation); return }
    setSalarySaving(true); setSalaryError(''); setSalarySuccess('')
    try { await saveSalaryBase({ id: selectedSalary?.id, ano: competence.ano, mes: competence.mes, valor_consolidado: value }); await refreshSalaries(); await onSalarySaved(competence.ano, competence.mes); setSalarySuccess('Salário-base salvo com sucesso.') } catch (error) { setSalaryError(axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || 'Não foi possível salvar o salário-base.' : error instanceof Error ? error.message : 'Não foi possível salvar o salário-base.') } finally { setSalarySaving(false) }
  }
  const download = (format: 'pdf' | 'xlsx') => void downloadWorkshopPerformance(format, filters)
  return <section className="report-section workshop-performance">
    <header className="report-section__header"><div><h2>Desempenho da Oficina</h2><p>Indicador gerencial por data de abertura; não representa lucro ou economia comprovada.</p></div><div><button type="button" className="button button--secondary" onClick={() => download('pdf')}>PDF</button><button type="button" className="button button--secondary" onClick={() => download('xlsx')}>Excel</button></div></header>
    {!hasPeriod ? <p className="report-state">Informe um período para consultar o desempenho.</p> : loading ? <p className="report-state">Carregando desempenho...</p> : !performance ? <p className="report-state report-state--error">Não foi possível carregar o desempenho da oficina.</p> : <>
      <div className="reports-stats reports-stats--standalone"><article className="stat-card"><span>Serviços internos registrados</span><strong>{formatCurrency(Number(performance.valor_servicos_internos))}</strong><small>O.S. abertas no período</small></article><article className="stat-card"><span>Mão de obra interna registrada</span><strong>{formatCurrency(Number(performance.valor_mao_obra_interna_registrada))}</strong><small>Mesmo valor dos serviços classificados como internos</small></article><article className="stat-card"><span>Base salarial informada</span><strong>{performance.salario_base_cadastrado === null ? 'Não informado' : formatCurrency(Number(performance.salario_base_cadastrado))}</strong><small>{performance.meses_com_salario}/{performance.meses_no_periodo} competências</small></article><article className="stat-card"><span>Diferença gerencial estimada</span><strong>{performance.diferenca_gerencial_estimada === null ? 'Indisponível' : formatCurrency(Number(performance.diferenca_gerencial_estimada))}</strong><small>Não é custo efetivo</small></article></div>
      {performance.dados_incompletos && <p className="report-warning">Comparação salarial indisponível: faltam salários em {performance.competencias_sem_salario.join(', ') || 'uma ou mais competências'}{performance.periodo_salarial_completo ? '.' : ' e o período não corresponde a meses completos.'}</p>}
      <p className="report-section__meta">Linhas abertas: {performance.linhas_abertas} · linhas finalizadas: {performance.linhas_finalizadas} · O.S. abertas: {performance.os_abertas} · O.S. finalizadas: {performance.os_finalizadas}</p><div className="maintenance-table-wrap"><table><thead><tr><th>O.S.</th><th>Status</th><th>Abertura</th><th>Serviço interno</th><th>Valor</th></tr></thead><tbody>{performance.detalhes.map((row, index) => <tr key={`${row.ordem_servico_id}-${index}`}><td>{row.numero_os}</td><td>{row.status}</td><td>{dateBr(row.data_abertura)}</td><td>{row.descricao}</td><td>{formatCurrency(Number(row.valor))}</td></tr>)}</tbody></table></div>
    </>}
    <section className="salary-management" aria-labelledby="salary-management-title"><header><div><h3 id="salary-management-title">Salário-base mensal da oficina</h3><p>Valor bruto consolidado da equipe, usado somente como referência gerencial mensal.</p></div></header>{salaries === null ? <p className="report-state">Carregando salários-base...</p> : <><div className="salary-current"><strong>Competência selecionada: {String(competence.mes).padStart(2, '0')}/{competence.ano}</strong><span>{selectedSalary ? `Cadastrado: ${formatCurrency(Number(selectedSalary.valor_consolidado))}` : 'Não informado'}</span></div>{isAdmin && <form className="salary-form" onSubmit={saveSalary}><label>Mês<select value={competence.mes} disabled={salarySaving} onChange={event => setCompetenceAndValue({ ...competence, mes: Number(event.target.value) })}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{String(index + 1).padStart(2, '0')}</option>)}</select></label><label>Ano<input type="number" min="1900" max="9999" value={competence.ano} disabled={salarySaving} onChange={event => setCompetenceAndValue({ ...competence, ano: Number(event.target.value) })} /></label><label>Salário-base bruto<input inputMode="decimal" placeholder="R$ 0,00" value={salaryValue} disabled={salarySaving} onChange={event => setSalaryValue(event.target.value)} /></label><button className="button button--primary" disabled={salarySaving}>{salarySaving ? 'Salvando...' : selectedSalary ? 'Atualizar competência' : 'Cadastrar competência'}</button></form>}{!isAdmin && <p className="salary-help">Somente administradores podem cadastrar ou editar o salário-base.</p>}{salarySuccess && <p className="salary-success" role="status">{salarySuccess}</p>}{salaryError && <p className="maintenance-error" role="alert">{salaryError}</p>}</>}</section>
  </section>
}
