import { useState } from 'react'
import axios from 'axios'
import { ChevronDown, Download } from 'lucide-react'
import { downloadAbastecimentosExport, type AbastecimentosExportFormat, type AbastecimentosExportKind, type AbastecimentosExportParams } from '../../services/abastecimentos'

const exportErrorMessage = async (cause: unknown): Promise<string> => {
  if (!axios.isAxiosError<{ message?: string }>(cause)) return 'Falha ao iniciar o download.'
  const data = cause.response?.data
  if (data instanceof Blob) {
    try { const parsed = JSON.parse(await data.text()) as { message?: string }; if (parsed.message) return parsed.message } catch { /* mantém fallback seguro */ }
  }
  return cause.response?.data?.message || 'Não foi possível gerar a exportação.'
}

export function AbastecimentosExportMenu({ kind, filters }: { kind: AbastecimentosExportKind; filters: AbastecimentosExportParams }) {
  const [busy, setBusy] = useState<AbastecimentosExportFormat | null>(null)
  const [error, setError] = useState<string | null>(null)
  const download = async (format: AbastecimentosExportFormat) => {
    if (busy) return
    setBusy(format)
    setError(null)
    try { await downloadAbastecimentosExport(kind, format, filters) } catch (cause) { setError(await exportErrorMessage(cause)) } finally { setBusy(null) }
  }
  const [open, setOpen] = useState(false)
  return <div className="reports-export-menu"><button className="button button--secondary" type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}><Download size={17} />Exportar<ChevronDown size={15} /></button>{open && <div className="reports-export-menu__panel"><strong>Exportações disponíveis</strong><div><span>Relatório de abastecimentos</span><button type="button" disabled={Boolean(busy)} onClick={() => void download('excel')}>{busy === 'excel' ? 'Gerando Excel…' : 'Excel'}</button><button type="button" disabled={Boolean(busy)} onClick={() => void download('pdf')}>{busy === 'pdf' ? 'Gerando PDF…' : 'PDF'}</button></div>{error && <small className="report-download-error" role="alert">{error}</small>}</div>}</div>
}
