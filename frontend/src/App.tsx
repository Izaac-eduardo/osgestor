import { Route, Routes } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { AbastecimentosEspeciaisPage, AbastecimentosPontosPage, AbastecimentosTerceirosPage } from './pages/AbastecimentosCadastrosPage'
import { AbastecimentosEntradasPage } from './pages/AbastecimentosEntradasPage'
import { AbastecimentosImportarPoliFrotaPage } from './pages/AbastecimentosImportarPoliFrotaPage'
import { AbastecimentosHistoricoPage } from './pages/AbastecimentosHistoricoPage'
import { DashboardPage } from './pages/DashboardPage'
import { FrotasPage } from './pages/FrotasPage'
import { FuncionariosPage } from './pages/FuncionariosPage'
import { ImportarOsPage } from './pages/ImportarOsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ObrasPage } from './pages/ObrasPage'
import { OrdensServicoPage } from './pages/OrdensServicoPage'
import { RelatoriosPage } from './pages/RelatoriosPage'

export default function App() {
  return <Routes><Route element={<AppLayout />}><Route index element={<DashboardPage />} /><Route path="ordens-servico" element={<OrdensServicoPage />} /><Route path="obras" element={<ObrasPage />} /><Route path="funcionarios" element={<FuncionariosPage />} /><Route path="frotas" element={<FrotasPage />} /><Route path="relatorios" element={<RelatoriosPage />} /><Route path="importar-os" element={<ImportarOsPage />} /><Route path="abastecimentos/historico" element={<AbastecimentosHistoricoPage />} /><Route path="abastecimentos/entradas" element={<AbastecimentosEntradasPage />} /><Route path="abastecimentos/pontos" element={<AbastecimentosPontosPage />} /><Route path="abastecimentos/terceiros" element={<AbastecimentosTerceirosPage />} /><Route path="abastecimentos/destinacoes-especiais" element={<AbastecimentosEspeciaisPage />} /><Route path="abastecimentos/importar-polifrota" element={<AbastecimentosImportarPoliFrotaPage />} /><Route path="*" element={<NotFoundPage />} /></Route></Routes>
}
