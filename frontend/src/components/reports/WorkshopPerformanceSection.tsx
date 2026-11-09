import type { WorkshopPerformance } from '../../types/maintenance'
import type { MaintenanceFilters } from '../../types/maintenance'
import { downloadWorkshopPerformance } from '../../services/maintenance'
import { formatCurrency } from '../../utils/formatters'

type Props = { performance: WorkshopPerformance | null; loading: boolean; hasPeriod: boolean; filters: MaintenanceFilters }

const dateBr = (value: string) => value.includes('-') ? value.slice(0, 10).split('-').reverse().join('/') : value

export function WorkshopPerformanceSection({ performance, loading, hasPeriod, filters }: Props) {
  const download = (format: 'pdf' | 'xlsx') => void downloadWorkshopPerformance(format, filters)
  return <section className="report-section workshop-performance">
    <header className="report-section__header">
      <div><h2>Desempenho da Oficina</h2><p>Indicador gerencial por data de abertura; não representa lucro ou economia comprovada.</p></div><div><button type="button" className="button button--secondary" onClick={() => download('pdf')}>PDF</button><button type="button" className="button button--secondary" onClick={() => download('xlsx')}>Excel</button></div>
    </header>
    {!hasPeriod ? <p className="report-state">Informe um período para consultar o desempenho.</p> : loading ? <p className="report-state">Carregando desempenho...</p> : !performance ? <p className="report-state report-state--error">Não foi possível carregar o desempenho da oficina.</p> : <>
      <div className="reports-stats reports-stats--standalone">
        <article className="stat-card"><span>Serviços internos registrados</span><strong>{formatCurrency(Number(performance.valor_servicos_internos))}</strong><small>O.S. abertas no período</small></article>
        <article className="stat-card"><span>Mão de obra interna registrada</span><strong>{formatCurrency(Number(performance.valor_mao_obra_interna_registrada))}</strong><small>Mesmo valor dos serviços classificados como internos</small></article>
        <article className="stat-card"><span>Base salarial informada</span><strong>{performance.salario_base_cadastrado === null ? 'Não informado' : formatCurrency(Number(performance.salario_base_cadastrado))}</strong><small>{performance.meses_com_salario}/{performance.meses_no_periodo} competências</small></article>
        <article className="stat-card"><span>Diferença gerencial estimada</span><strong>{performance.diferenca_gerencial_estimada === null ? 'Indisponível' : formatCurrency(Number(performance.diferenca_gerencial_estimada))}</strong><small>Não é custo efetivo</small></article>
      </div>
      {performance.dados_incompletos && <p className="report-warning">Comparação salarial indisponível: faltam salários em {performance.competencias_sem_salario.join(', ') || 'uma ou mais competências'}{performance.periodo_salarial_completo ? '.' : ' e o período não corresponde a meses completos.'}</p>}
      <p className="report-section__meta">Linhas abertas: {performance.linhas_abertas} · linhas finalizadas: {performance.linhas_finalizadas} · O.S. abertas: {performance.os_abertas} · O.S. finalizadas: {performance.os_finalizadas}</p>
      <div className="maintenance-table-wrap"><table><thead><tr><th>O.S.</th><th>Status</th><th>Abertura</th><th>Serviço interno</th><th>Valor</th></tr></thead><tbody>{performance.detalhes.map((row, index) => <tr key={`${row.ordem_servico_id}-${index}`}><td>{row.numero_os}</td><td>{row.status}</td><td>{dateBr(row.data_abertura)}</td><td>{row.descricao}</td><td>{formatCurrency(Number(row.valor))}</td></tr>)}</tbody></table></div>
    </>}
  </section>
}
