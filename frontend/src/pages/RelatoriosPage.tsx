import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { ReportsFilters } from '../components/reports/ReportsFilters'
import { MaintenanceFleetExportSection } from '../components/reports/MaintenanceFleetExportSection'
import type { MaintenanceFilters, MaintenanceNature } from '../types/maintenance'
import type { ReportFilters } from '../types/reports'

export function RelatoriosPage() {
  const [draft, setDraft] = useState<ReportFilters>({})
  const [applied, setApplied] = useState<ReportFilters>({})
  const [periodError, setPeriodError] = useState('')
  const [financialNatureDraft, setFinancialNatureDraft] = useState<MaintenanceNature | undefined>()
  const [financialNature, setFinancialNature] = useState<MaintenanceNature | undefined>()
  const apply = () => { if (draft.data_inicio && draft.data_fim && draft.data_fim < draft.data_inicio) { setPeriodError('A data final não pode ser anterior à data inicial.'); return }; setPeriodError(''); setApplied({ ...draft }); setFinancialNature(financialNatureDraft) }
  const clear = () => { setPeriodError(''); setDraft({}); setApplied({}); setFinancialNatureDraft(undefined); setFinancialNature(undefined) }
  const maintenanceFilters: MaintenanceFilters = { data_inicio: applied.data_inicio || '', data_fim: applied.data_fim || '', frota_codigo: applied.frota_codigo, natureza: financialNature }
  return <><PageHeader title="Relatórios" subtitle="Geração e exportação dos custos de manutenção da oficina." /><ReportsFilters draft={draft} financialNature={financialNatureDraft} error={periodError} onChange={setDraft} onFinancialNatureChange={setFinancialNatureDraft} onApply={apply} onClear={clear} /><MaintenanceFleetExportSection filters={maintenanceFilters} /></>
}
