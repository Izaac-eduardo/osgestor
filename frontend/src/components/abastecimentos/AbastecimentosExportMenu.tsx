import { useState } from 'react'
import axios from 'axios'
import { downloadAbastecimentosExport, type AbastecimentosExportFormat, type AbastecimentosExportKind, type AbastecimentosExportParams } from '../../services/abastecimentos'

export function AbastecimentosExportMenu({ kind, filters }: { kind: AbastecimentosExportKind; filters: AbastecimentosExportParams }) {
  const [busy, setBusy] = useState<AbastecimentosExportFormat | null>(null)
  const [error, setError] = useState<string | null>(null)
  const download = async (format: AbastecimentosExportFormat) => {
    if (busy) return
    setBusy(format)
    setError(null)
    try { await downloadAbastecimentosExport(kind, format, filters) } catch (cause) { setError(axios.isAxiosError(cause) ? 'Não foi possível gerar a exportação.' : 'Falha ao iniciar o download.') } finally { setBusy(null) }
  }
  return <div className="abastecimentos-export-menu"><span>Exportar:</span><button className="button button--secondary" type="button" disabled={Boolean(busy)} onClick={() => void download('pdf')}>{busy === 'pdf' ? 'Gerando PDF…' : 'PDF'}</button><button className="button button--secondary" type="button" disabled={Boolean(busy)} onClick={() => void download('excel')}>{busy === 'excel' ? 'Gerando Excel…' : 'Excel'}</button>{error && <small role="alert">{error}</small>}</div>
}
