import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'

const projects = [
  { id: 'demo-obra-1', codigo: 'OB-2401', nome: 'Pátio Central', status: 'ATIVA' },
  { id: 'demo-obra-2', codigo: 'OB-2402', nome: 'Linha Norte', status: 'ATIVA' },
  { id: 'demo-obra-3', codigo: 'OB-2398', nome: 'Expansão Industrial', status: 'ENCERRADA' },
]

const fleets = [
  { id: 'demo-frota-1', codigo: 'CT32', numero: 32, descricao: 'Caminhão basculante', status: 'ATIVO' },
  { id: 'demo-frota-2', codigo: 'MC06', numero: 6, descricao: 'Máquina carregadeira', status: 'ATIVO' },
  { id: 'demo-frota-3', codigo: 'VN14', numero: 14, descricao: 'Van operacional', status: 'ATIVO' },
]

const employees = [
  { id: 'demo-func-1', nome: 'Carlos Mendes', matricula: '1024', cargo: 'Mecânico', status: 'ATIVO' },
  { id: 'demo-func-2', nome: 'Rafael Souza', matricula: '1031', cargo: 'Eletricista', status: 'ATIVO' },
  { id: 'demo-func-3', nome: 'Juliana Alves', matricula: '1018', cargo: 'Supervisora', status: 'ATIVO' },
]
const demoUsers = [
  { id: 'demo-user-1', username: 'admin.demo', email: 'admin.demo@osgestor.local', role: 'ADMIN', status: 'ATIVO', created_at: '2025-11-03T10:00:00Z', updated_at: '2026-10-08T09:00:00Z', last_login_at: '2026-10-20T08:15:00Z', must_change_password: false },
  { id: 'demo-user-2', username: 'gestao.operacao', email: 'gestao.operacao@osgestor.local', role: 'GESTOR', status: 'ATIVO', created_at: '2025-11-08T10:00:00Z', updated_at: '2026-09-28T09:00:00Z', last_login_at: '2026-10-19T17:42:00Z', must_change_password: false },
  { id: 'demo-user-3', username: 'oficina.coordenacao', email: 'oficina.coordenacao@osgestor.local', role: 'OPERADOR', status: 'ATIVO', created_at: '2025-11-12T10:00:00Z', updated_at: '2026-09-20T09:00:00Z', last_login_at: '2026-10-18T16:20:00Z', must_change_password: false },
  { id: 'demo-user-4', username: 'frota.monitoramento', email: 'frota.monitoramento@osgestor.local', role: 'GESTOR', status: 'ATIVO', created_at: '2025-12-02T10:00:00Z', updated_at: '2026-10-01T09:00:00Z', last_login_at: '2026-10-20T07:55:00Z', must_change_password: false },
  { id: 'demo-user-5', username: 'almoxarifado.demo', email: 'almoxarifado.demo@osgestor.local', role: 'OPERADOR', status: 'ATIVO', created_at: '2025-12-18T10:00:00Z', updated_at: '2026-08-14T09:00:00Z', last_login_at: '2026-10-17T14:10:00Z', must_change_password: false },
  { id: 'demo-user-6', username: 'relatorios.demo', email: 'relatorios.demo@osgestor.local', role: 'GESTOR', status: 'ATIVO', created_at: '2026-01-09T10:00:00Z', updated_at: '2026-09-10T09:00:00Z', last_login_at: '2026-10-16T11:35:00Z', must_change_password: false },
  { id: 'demo-user-7', username: 'manutencao.turno', email: 'manutencao.turno@osgestor.local', role: 'OPERADOR', status: 'ATIVO', created_at: '2026-02-11T10:00:00Z', updated_at: '2026-07-22T09:00:00Z', last_login_at: '2026-10-15T18:05:00Z', must_change_password: false },
  { id: 'demo-user-8', username: 'suprimentos.demo', email: 'suprimentos.demo@osgestor.local', role: 'OPERADOR', status: 'INATIVO', created_at: '2026-03-06T10:00:00Z', updated_at: '2026-09-05T09:00:00Z', last_login_at: '2026-09-12T12:00:00Z', must_change_password: false },
  { id: 'demo-user-9', username: 'auditoria.demo', email: 'auditoria.demo@osgestor.local', role: 'GESTOR', status: 'ATIVO', created_at: '2026-04-18T10:00:00Z', updated_at: '2026-10-03T09:00:00Z', last_login_at: null, must_change_password: true },
  { id: 'demo-user-10', username: 'apoio.administrativo', email: 'apoio.administrativo@osgestor.local', role: 'OPERADOR', status: 'INATIVO', created_at: '2026-05-21T10:00:00Z', updated_at: '2026-08-30T09:00:00Z', last_login_at: '2026-08-29T10:30:00Z', must_change_password: false },
]

const orders: Array<{ id: string; numero: number; status: string; natureza: string; descricao: string; obra_codigo: string; frota_codigo: string; data_abertura: string; valor_total: number; categoria_servico?: string; total_produtos?: number; total_servicos?: number; funcionario_nome?: string }> = [
  { id: 'demo-os-1', numero: 24018, status: 'EM_ANDAMENTO', natureza: 'INTERNA', categoria_servico: 'HIDRAULICA', descricao: 'Revisão do sistema hidráulico', obra_codigo: 'OB-2401', frota_codigo: 'CT32', data_abertura: '2026-10-18', valor_total: 4850 },
  { id: 'demo-os-2', numero: 24017, status: 'ABERTA', natureza: 'MATERIAL', descricao: 'Troca de pneus e alinhamento', obra_codigo: 'OB-2402', frota_codigo: 'VN14', data_abertura: '2026-10-17', valor_total: 2120 },
  { id: 'demo-os-3', numero: 24016, status: 'FINALIZADA', natureza: 'TERCEIRO', descricao: 'Manutenção preventiva', obra_codigo: 'OB-2401', frota_codigo: 'MC06', data_abertura: '2026-10-15', valor_total: 3680 },
]

const demoDate = (daysAgo: number) => { const date = new Date(Date.UTC(2026, 9, 20 - daysAgo)); return date.toISOString().slice(0, 10) }
const fleetKinds = ['Caminhão basculante', 'Escavadeira hidráulica', 'Retroescavadeira', 'Motoniveladora', 'Carregadeira', 'Caminhão pipa', 'Van operacional', 'Gerador']
const fleetPrefixes = ['CT', 'EH', 'RE', 'MN', 'MC', 'CP', 'VN', 'GE']
for (let index = 4; index <= 55; index += 1) fleets.push({ id: `demo-frota-${index}`, codigo: `${fleetPrefixes[index % fleetPrefixes.length]}${String(index).padStart(2, '0')}`, numero: index, descricao: fleetKinds[index % fleetKinds.length], status: index % 17 === 0 ? 'INATIVO' : 'ATIVO' })
for (let index = 4; index <= 15; index += 1) projects.push({ id: `demo-obra-${index}`, codigo: `OB-${2400 + index}`, nome: ['Terraplenagem Leste', 'Ponte do Ribeirão', 'Pedreira São Jorge', 'Acesso Sul', 'Central de Britagem', 'Barragem Nova', 'Terminal Logístico', 'Manutenção Rodoviária', 'Canal de Drenagem', 'Apoio Florestal', 'Pátio de Agregados', 'Linha de Transmissão'][index - 4] || `Frente de serviço ${index}`, status: index % 5 === 0 ? 'ENCERRADA' : 'ATIVA' })
const employeeNames = ['Marcos Lima', 'André Ribeiro', 'Paulo Nunes', 'Fernanda Costa', 'Gustavo Martins', 'Leandro Alves', 'Bianca Rocha', 'Renato Dias', 'Tiago Freitas', 'Sérgio Melo', 'Aline Castro', 'Diego Barros', 'Wesley Moura', 'Nádia Souza', 'Eduardo Reis', 'Priscila Ramos', 'Caio Pinto', 'Mônica Duarte', 'Bruno Teixeira', 'Helena Moraes']
for (let index = 4; index <= 22; index += 1) employees.push({ id: `demo-func-${index}`, nome: employeeNames[index - 4], matricula: String(1030 + index), cargo: ['Mecânico', 'Eletricista', 'Operador', 'Almoxarife', 'Encarregado'][index % 5], status: index % 19 === 0 ? 'INATIVO' : 'ATIVO' })
const orderDescriptions = ['Troca de óleo e filtros', 'Revisão do sistema hidráulico', 'Substituição de pneus', 'Reparo elétrico do painel', 'Manutenção preventiva', 'Troca de mangueiras', 'Revisão do sistema de freios', 'Solda em implemento', 'Lubrificação geral', 'Reparo de bomba d’água', 'Alinhamento e balanceamento', 'Revisão do motor']
const orderCategories = ['MECANICA', 'HIDRAULICA', 'BORRACHARIA', 'AUTO_ELETRICA', 'MECANICA', 'HIDRAULICA', 'MECANICA', 'SOLDAGEM', 'LUBRIFICACAO', 'MECANICA', 'BORRACHARIA', 'MECANICA']
const internalCategories = ['MECANICA', 'HIDRAULICA', 'BORRACHARIA', 'AUTO_ELETRICA', 'SOLDAGEM', 'LUBRIFICACAO']
const orderStatuses = ['FINALIZADA', 'FINALIZADA', 'FINALIZADA', 'EM_ANDAMENTO', 'ABERTA', 'AGUARDANDO_PECA', 'FINALIZADA', 'FINALIZADA', 'CANCELADA']
for (let index = 4; index <= 125; index += 1) { const naturezas = ['INTERNA', 'MATERIAL', 'TERCEIRO']; const status = orderStatuses[index % orderStatuses.length]; const category = naturezas[index % naturezas.length] === 'INTERNA' ? internalCategories[Math.floor((index - 4) / 3) % internalCategories.length] : orderCategories[index % orderCategories.length]; const material = (index % 4) * 410 + 280; const service = (index % 6) * 360 + 520; const daysAgo = index <= 20 ? index - 4 : index * 3 % 365; orders.push({ id: `demo-os-${index}`, numero: 24000 + index, status, natureza: naturezas[index % naturezas.length], categoria_servico: category, descricao: orderDescriptions[index % orderDescriptions.length], obra_codigo: projects[index % projects.length].codigo, frota_codigo: fleets[index % fleets.length].codigo, data_abertura: demoDate(daysAgo), valor_total: status === 'CANCELADA' ? 0 : material + service, total_produtos: material, total_servicos: service, funcionario_nome: employees[index % employees.length].nome }) }

const dashboard = {
  periodo: { data_inicio: '2026-10-05', data_fim: '2026-10-20' },
  resumo: { total_os: 48, gasto_total: 126480, produtos: 38420, servicos: 52100, interna: 35960, terceiros: 52100, produtos_os: 17, interna_os: 19, terceiros_os: 12, ticket_medio: 2635, os_com_custo: 43, os_sem_custo: 5 },
  status: { ABERTA: 12, EM_ANDAMENTO: 9, FINALIZADA: 22, AGUARDANDO_PECA: 4, CANCELADA: 1 },
  naturezas: [{ natureza: 'INTERNA', quantidade: 19, gasto: 35960 }, { natureza: 'MATERIAL', quantidade: 17, gasto: 38420 }, { natureza: 'TERCEIRO', quantidade: 12, gasto: 52100 }],
  composicao: { produtos: 38420, servicos: 52100 },
  os_por_dia: ['05', '08', '11', '14', '17', '20'].map((day, index) => ({ data: `2026-10-${day}`, quantidade: [5, 8, 6, 11, 9, 9][index] })),
  top_obras: projects.map((p, index) => ({ codigo: p.codigo, nome: p.nome, quantidade_os: 16 - index * 3, gasto: 58200 - index * 12100 })),
  top_frotas: fleets.map((f, index) => ({ frota: f.codigo, quantidade_os: 12 - index * 2, gasto: 32800 - index * 6400 })),
  categorias: [{ categoria: 'MECÂNICA', quantidade: 18 }, { categoria: 'ELÉTRICA', quantidade: 11 }, { categoria: 'LUBRIFICAÇÃO', quantidade: 8 }, { categoria: 'BORRACHARIA', quantidade: 6 }],
  classificacao_servicos: [], servicos_sem_classificacao: 3, horas_funcionarios: [],
}

const thirdParty = { total_terceiros: 52100, valor_classificado: 48700, valor_nao_classificado: 3400, valor_sem_proveniencia: 0, cobertura_percentual: 93.5, diferenca_reconciliacao: 0, quantidade_os: 12, quantidade_os_classificadas: 11, categorias: [{ categoria: 'Mecânica pesada', quantidade_itens: 8, quantidade_os: 5, valor: 32100, percentual: 61.6 }, { categoria: 'Pneus', quantidade_itens: 4, quantidade_os: 4, valor: 16600, percentual: 31.9 }] }

const fuelProducts = [
  { id: 'demo-prod-s500', codigo: 'DIESEL_S500', nome: 'Diesel S500', descricao: 'Diesel comum', permite_entrada: true, status: 'ATIVO' },
  { id: 'demo-prod-s10', codigo: 'DIESEL_S10', nome: 'Diesel S10', descricao: 'Diesel de baixo teor de enxofre', permite_entrada: true, status: 'ATIVO' },
  { id: 'demo-prod-arla', codigo: 'ARLA_32', nome: 'ARLA 32', descricao: 'Agente redutor', permite_entrada: true, status: 'ATIVO' },
]
const fuelPoints = [
  { id: 'demo-ponto-1', codigo: 'P01', nome: 'Pátio Central', status: 'ATIVO', observacoes: null },
  { id: 'demo-ponto-2', codigo: 'P02', nome: 'Base Linha Norte', status: 'ATIVO', observacoes: null },
]
for (let index = 3; index <= 8; index += 1) fuelPoints.push({ id: `demo-ponto-${index}`, codigo: `P0${index}`, nome: ['Base Industrial', 'Pátio Norte', 'Oficina Central', 'Usina de Apoio', 'Frente Leste', 'Garagem Operacional'][index - 3], status: 'ATIVO', observacoes: null })
const demoThirdParties = ['Transportes Horizonte', 'Logística Vale', 'Serviços Alfa', 'Pneus Brasil', 'HidroTech Manutenção', 'Auto Diesel Centro', 'Metalúrgica União', 'Guindastes Prime', 'Elétrica Horizonte', 'Loca Máquinas', 'Oficina Estrada', 'Refrigeração Sul'].map((nome, index) => ({ id: `demo-terceiro-${index + 1}`, codigo: `T-${String(index + 1).padStart(3, '0')}`, nome, status: 'ATIVO', documento: `DEMO-${String(100 + index)}` }))
const demoSpecialDestinations = [{ id: 'demo-especial-1', nome: 'Gerador da Administração', status: 'ATIVO', observacoes: 'Destinação demonstrativa' }, { id: 'demo-especial-2', nome: 'Abastecimento externo autorizado', status: 'ATIVO', observacoes: null }]
const fuelEntries = [
  { id: 'demo-entrada-1', data_entrada: '2026-10-18', numero_nf: 'NF-DEMO-1842', produto_id: 'demo-prod-s500', produto: fuelProducts[0], litros_nf: 10000, valor_total_nf: 58900, total_distribuido: 7200, observacoes: 'Recebimento demonstrativo', destinos: [{ id: 'demo-dest-1', tipo_destino: 'PONTO', ponto_id: 'demo-ponto-1', ponto_codigo: 'P01', ponto_nome: 'Pátio Central', frota_id: null, litros: 7200 }], created_at: '2026-10-18T08:30:00Z', updated_at: '2026-10-18T08:30:00Z' },
  { id: 'demo-entrada-2', data_entrada: '2026-10-10', numero_nf: 'NF-DEMO-1817', produto_id: 'demo-prod-s10', produto: fuelProducts[1], litros_nf: 8000, valor_total_nf: 49600, total_distribuido: 6100, observacoes: null, destinos: [{ id: 'demo-dest-2', tipo_destino: 'PONTO', ponto_id: 'demo-ponto-2', ponto_codigo: 'P02', ponto_nome: 'Base Linha Norte', frota_id: null, litros: 6100 }], created_at: '2026-10-10T10:00:00Z', updated_at: '2026-10-10T10:00:00Z' },
  { id: 'demo-entrada-3', data_entrada: '2026-10-03', numero_nf: 'NF-DEMO-1795', produto_id: 'demo-prod-arla', produto: fuelProducts[2], litros_nf: 1200, valor_total_nf: 7800, total_distribuido: 0, observacoes: null, destinos: [], created_at: '2026-10-03T09:15:00Z', updated_at: '2026-10-03T09:15:00Z' },
]
type DemoFuelHistoryItem = { id: string; data_hora: string; produto_id: string; obra_id: string; frota_id: string | null; terceiro_id: string | null; destinacao_especial_id: string | null; tipo_destinatario: string; destinatario: string | null; placa: string | null; produto_codigo: string; litros: number; valor_total: number; km_hr: number | null; horimetro: number | null; bico_codigo_original: string | null; bico_descricao_original: string | null; frentista_original: string | null; identificador_externo: string; identificacao_original: string; origem_sistema: string; obra_nome: string }
const fuelHistory: DemoFuelHistoryItem[] = [
  { id: 'demo-abast-1', data_hora: '2026-10-19T08:10:00Z', produto_id: 'demo-prod-s500', obra_id: 'demo-obra-1', frota_id: 'demo-frota-1', terceiro_id: null, destinacao_especial_id: null, tipo_destinatario: 'FROTA', destinatario: 'CT32', placa: 'ABC-1234', produto_codigo: 'DIESEL_S500', litros: 280, valor_total: 1649, km_hr: 18420, horimetro: null, bico_codigo_original: 'B01', bico_descricao_original: 'Diesel S500', frentista_original: 'Equipe demo', identificador_externo: 'DEMO-AB-0001', identificacao_original: 'CT32', origem_sistema: 'DEMO', obra_nome: 'Pátio Central' },
  { id: 'demo-abast-2', data_hora: '2026-10-18T14:35:00Z', produto_id: 'demo-prod-s10', obra_id: 'demo-obra-2', frota_id: 'demo-frota-3', terceiro_id: null, destinacao_especial_id: null, tipo_destinatario: 'FROTA', destinatario: 'VN14', placa: 'DEF-5678', produto_codigo: 'DIESEL_S10', litros: 145, valor_total: 957, km_hr: 72500, horimetro: null, bico_codigo_original: 'B02', bico_descricao_original: 'Diesel S10', frentista_original: 'Equipe demo', identificador_externo: 'DEMO-AB-0002', identificacao_original: 'VN14', origem_sistema: 'DEMO', obra_nome: 'Linha Norte' },
  { id: 'demo-abast-3', data_hora: '2026-10-17T10:20:00Z', produto_id: 'demo-prod-s500', obra_id: 'demo-obra-1', frota_id: null, terceiro_id: 'demo-terceiro-1', destinacao_especial_id: null, tipo_destinatario: 'TERCEIRO', destinatario: 'Transportes Horizonte', placa: null, produto_codigo: 'DIESEL_S500', litros: 320, valor_total: 1888, km_hr: null, horimetro: null, bico_codigo_original: 'B01', bico_descricao_original: 'Diesel S500', frentista_original: 'Equipe demo', identificador_externo: 'DEMO-AB-0003', identificacao_original: 'TRANSP-HORIZONTE', origem_sistema: 'DEMO', obra_nome: 'Pátio Central' },
]
for (let index = 4; index <= 60; index += 1) { const product = fuelProducts[index % 2]; const point = fuelPoints[index % fuelPoints.length]; const liters = 4500 + (index % 7) * 750; fuelEntries.push({ id: `demo-entrada-${index}`, data_entrada: demoDate(index * 6 % 365), numero_nf: `NF-DEMO-${1800 + index}`, produto_id: product.id, produto: product, litros_nf: liters, valor_total_nf: Math.round(liters * (5.3 + (index % 4) * 0.12)), total_distribuido: Math.round(liters * 0.72), observacoes: index % 4 === 0 ? 'Recebimento programado' : null, destinos: [{ id: `demo-dest-${index}`, tipo_destino: 'PONTO', ponto_id: point.id, ponto_codigo: point.codigo, ponto_nome: point.nome, frota_id: null, litros: Math.round(liters * 0.72) }], created_at: `${demoDate(index * 6 % 365)}T08:00:00Z`, updated_at: `${demoDate(index * 6 % 365)}T08:00:00Z` }) }
for (let index = 4; index <= 250; index += 1) { const product = fuelProducts[index % 2]; const fleet = fleets[index % fleets.length]; const project = projects[index % projects.length]; const isThirdParty = index % 11 === 0; const liters = 90 + (index % 9) * 35; fuelHistory.push({ id: `demo-abast-${index}`, data_hora: `${demoDate(index * 1.45 % 365)}T${String(7 + index % 10).padStart(2, '0')}:20:00Z`, produto_id: product.id, obra_id: project.id, frota_id: isThirdParty ? null : fleet.id, terceiro_id: isThirdParty ? `demo-terceiro-${index % 12}` : null, destinacao_especial_id: index % 23 === 0 ? 'demo-especial-1' : null, tipo_destinatario: isThirdParty ? 'TERCEIRO' : index % 23 === 0 ? 'ESPECIAL' : 'FROTA', destinatario: isThirdParty ? ['Transportes Horizonte', 'Logística Vale', 'Serviços Alfa'][index % 3] : fleet.codigo, placa: isThirdParty ? null : `DEMO-${String(1000 + index).slice(-4)}`, produto_codigo: product.codigo, litros: liters, valor_total: Math.round(liters * (5.5 + (index % 5) * 0.1)), km_hr: isThirdParty ? null : 12000 + index * 137, horimetro: index % 4 === 0 ? 800 + index * 3 : null, bico_codigo_original: `B${String(1 + index % 3).padStart(2, '0')}`, bico_descricao_original: product.nome, frentista_original: employees[index % employees.length].nome, identificador_externo: `DEMO-AB-${String(index).padStart(4, '0')}`, identificacao_original: isThirdParty ? `TERCEIRO-${index % 12}` : fleet.codigo, origem_sistema: 'DEMO', obra_nome: project.nome }) }
const historyResponse = (items = fuelHistory, page = 1, limit = 50) => ({ items, summary: { quantidade: items.length, total_litros: items.reduce((sum, item) => sum + item.litros, 0), total_valor: items.reduce((sum, item) => sum + item.valor_total, 0) }, pagination: { page, limit, total: items.length, total_pages: Math.max(1, Math.ceil(items.length / limit)) } })
const fuelReportLegacy = { summary: { quantidade: 3, litros: 745, valor: 4494, destinatarios: 3 }, por_produto: [{ produto: 'DIESEL_S500', quantidade: 2, litros: 600, valor: 3537 }, { produto: 'DIESEL_S10', quantidade: 1, litros: 145, valor: 957 }], por_obra: [{ obra_id: 'demo-obra-1', obra: 'Pátio Central', quantidade: 2, litros: 600, valor: 3537, percentual_litros: 80.54 }, { obra_id: 'demo-obra-2', obra: 'Linha Norte', quantidade: 1, litros: 145, valor: 957, percentual_litros: 19.46 }], por_frota: [{ frota_id: 'demo-frota-1', frota: 'CT32', placa: 'ABC-1234', quantidade: 1, litros: 280, valor: 1649 }, { frota_id: 'demo-frota-3', frota: 'VN14', placa: 'DEF-5678', quantidade: 1, litros: 145, valor: 957 }], por_terceiro: [{ terceiro_id: 'demo-terceiro-1', terceiro: 'Transportes Horizonte', quantidade: 1, litros: 320, valor: 1888 }], especiais: [], evolucao: [{ data: '2026-10-17', quantidade: 1, litros: 320, valor: 1888 }, { data: '2026-10-18', quantidade: 1, litros: 145, valor: 957 }, { data: '2026-10-19', quantidade: 1, litros: 280, valor: 1649 }] }
const fuelReport = { summary: { quantidade: 3, litros: 745, valor: 4494, destinatarios: 3 }, por_produto: [{ produto: 'DIESEL_S500', quantidade: 2, litros: 600, valor: 3537 }, { produto: 'DIESEL_S10', quantidade: 1, litros: 145, valor: 957 }], por_obra: [{ obra_id: 'demo-obra-1', obra: 'Pátio Central', quantidade: 2, litros: 600, valor: 3537, percentual_litros: 80.54 }, { obra_id: 'demo-obra-2', obra: 'Linha Norte', quantidade: 1, litros: 145, valor: 957, percentual_litros: 19.46 }], por_frota: [{ frota_id: 'demo-frota-1', frota: 'CT32', placa: 'ABC-1234', quantidade: 1, litros: 280, valor: 1649 }, { frota_id: 'demo-frota-3', frota: 'VN14', placa: 'DEF-5678', quantidade: 1, litros: 145, valor: 957 }], por_terceiro: [{ terceiro_id: 'demo-terceiro-1', terceiro: 'Transportes Horizonte', quantidade: 1, litros: 320, valor: 1888 }], especiais: [], evolucao: [{ data: '2026-10-17', quantidade: 1, litros: 320, valor: 1888 }, { data: '2026-10-18', quantidade: 1, litros: 145, valor: 957 }, { data: '2026-10-19', quantidade: 1, litros: 280, valor: 1649 }] }
void fuelReport
void fuelReportLegacy

const buildFuelReport = () => {
  const totalLiters = fuelHistory.reduce((sum, item) => sum + item.litros, 0)
  const totalValue = fuelHistory.reduce((sum, item) => sum + item.valor_total, 0)
  const productRows = fuelProducts.slice(0, 2).map(product => { const rows = fuelHistory.filter(item => item.produto_codigo === product.codigo); return { produto: product.codigo, quantidade: rows.length, litros: rows.reduce((sum, item) => sum + item.litros, 0), valor: rows.reduce((sum, item) => sum + item.valor_total, 0) } })
  const workRows = projects.slice(0, 12).map(project => { const rows = fuelHistory.filter(item => item.obra_id === project.id); return { obra_id: project.id, obra: project.nome, quantidade: rows.length, litros: rows.reduce((sum, item) => sum + item.litros, 0), valor: rows.reduce((sum, item) => sum + item.valor_total, 0), percentual_litros: totalLiters ? rows.reduce((sum, item) => sum + item.litros, 0) / totalLiters * 100 : 0 } }).filter(item => item.quantidade)
  const fleetRows = fleets.slice(0, 20).map(fleet => { const rows = fuelHistory.filter(item => item.frota_id === fleet.id); return { frota_id: fleet.id, frota: fleet.codigo, placa: `DEMO-${String(fleet.numero).padStart(4, '0')}`, quantidade: rows.length, litros: rows.reduce((sum, item) => sum + item.litros, 0), valor: rows.reduce((sum, item) => sum + item.valor_total, 0) } }).filter(item => item.quantidade)
  const thirdRows = demoThirdParties.map(third => { const rows = fuelHistory.filter(item => item.terceiro_id === third.id); return { terceiro_id: third.id, terceiro: third.nome, quantidade: rows.length, litros: rows.reduce((sum, item) => sum + item.litros, 0), valor: rows.reduce((sum, item) => sum + item.valor_total, 0) } }).filter(item => item.quantidade)
  const specialRows = demoSpecialDestinations.map(destination => { const rows = fuelHistory.filter(item => item.destinacao_especial_id === destination.id); return { destinacao: destination.nome, quantidade: rows.length, litros: rows.reduce((sum, item) => sum + item.litros, 0), valor: rows.reduce((sum, item) => sum + item.valor_total, 0) } }).filter(item => item.quantidade)
  const evolution = Object.values(fuelHistory.reduce<Record<string, { data: string; quantidade: number; litros: number; valor: number }>>((acc, item) => { const day = item.data_hora.slice(0, 7); acc[day] ||= { data: day, quantidade: 0, litros: 0, valor: 0 }; acc[day].quantidade += 1; acc[day].litros += item.litros; acc[day].valor += item.valor_total; return acc }, {})).sort((a, b) => a.data.localeCompare(b.data))
  return { summary: { quantidade: fuelHistory.length, litros: totalLiters, valor: totalValue, destinatarios: new Set(fuelHistory.map(item => item.destinatario)).size }, por_produto: productRows, por_obra: workRows, por_frota: fleetRows, por_terceiro: thirdRows, especiais: specialRows, evolucao: evolution }
}

const normalizeCategory = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase()

const buildDashboard = (filters: Record<string, string | number | undefined> = {}) => {
  const selectedProjectCode = filters.obra_id ? projects.find(project => project.id === String(filters.obra_id))?.codigo : undefined
  const scopedOrders = orders.filter(order => (!filters.data_inicio || order.data_abertura >= String(filters.data_inicio)) && (!filters.data_fim || order.data_abertura <= String(filters.data_fim)) && (!selectedProjectCode || order.obra_codigo === selectedProjectCode) && (!filters.frota_codigo || order.frota_codigo.toLowerCase().includes(String(filters.frota_codigo).toLowerCase())) && (!filters.status || order.status === String(filters.status)) && (!filters.natureza_os || order.natureza === String(filters.natureza_os)) && (!filters.categoria_servico || normalizeCategory(order.categoria_servico || '') === normalizeCategory(String(filters.categoria_servico))))
  const activeOrders = scopedOrders.filter(order => order.status !== 'CANCELADA')
  const totalProducts = activeOrders.reduce((sum, order) => sum + Number(order.total_produtos || 0), 0)
  const totalServices = activeOrders.reduce((sum, order) => sum + Number(order.total_servicos || 0), 0)
  const statuses = scopedOrders.reduce<Record<string, number>>((acc, order) => { acc[order.status] = (acc[order.status] || 0) + 1; return acc }, {})
  const naturezas = ['INTERNA', 'MATERIAL', 'TERCEIRO'].map(natureza => { const rows = activeOrders.filter(order => order.natureza === natureza); return { natureza, quantidade: rows.length, gasto: rows.reduce((sum, order) => sum + Number(order.valor_total || 0), 0) } })
  const days = Object.values(scopedOrders.reduce<Record<string, { data: string; quantidade: number }>>((acc, order) => { acc[order.data_abertura] ||= { data: order.data_abertura, quantidade: 0 }; acc[order.data_abertura].quantidade += 1; return acc }, {})).sort((a, b) => a.data.localeCompare(b.data))
  const categories = Array.from(activeOrders.filter(order => order.natureza === 'INTERNA').reduce<Map<string, number>>((acc, order) => { const category = normalizeCategory(order.categoria_servico || 'OUTROS'); acc.set(category, (acc.get(category) || 0) + 1); return acc }, new Map())).map(([categoria, quantidade]) => ({ categoria, quantidade })).sort((a, b) => b.quantidade - a.quantidade || a.categoria.localeCompare(b.categoria)).slice(0, 5)
  const ranking = (key: 'obra_codigo' | 'frota_codigo') => Array.from(activeOrders.reduce<Map<string, { quantidade_os: number; gasto: number }>>((acc, order) => { const name = order[key]; const row = acc.get(name) || { quantidade_os: 0, gasto: 0 }; row.quantidade_os += 1; row.gasto += Math.max(0, Number(order.valor_total || 0)); acc.set(name, row); return acc }, new Map())).map(([name, row]) => ({ [key === 'obra_codigo' ? 'codigo' : 'frota']: name, nome: key === 'obra_codigo' ? projects.find(project => project.codigo === name)?.nome || name : undefined, quantidade_os: row.quantidade_os, gasto: row.gasto })).sort((a, b) => b.gasto - a.gasto || b.quantidade_os - a.quantidade_os).slice(0, 10)
  return { ...dashboard, periodo: { data_inicio: filters.data_inicio ? String(filters.data_inicio) : demoDate(365), data_fim: filters.data_fim ? String(filters.data_fim) : '2026-10-20' }, resumo: { ...dashboard.resumo, total_os: scopedOrders.length, gasto_total: activeOrders.reduce((sum, order) => sum + Math.max(0, Number(order.valor_total || 0)), 0), produtos: totalProducts, servicos: totalServices, interna: naturezas[0].gasto, terceiros: naturezas[2].gasto, produtos_os: naturezas[1].quantidade, interna_os: naturezas[0].quantidade, terceiros_os: naturezas[2].quantidade, os_com_custo: activeOrders.filter(order => Number(order.valor_total) > 0).length, os_sem_custo: activeOrders.filter(order => !Number(order.valor_total)).length }, status: statuses, naturezas, os_por_dia: days, categorias: categories, top_obras: ranking('obra_codigo'), top_frotas: ranking('frota_codigo') }
}

export function demoAdapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  const url = String(config.url || '').split('?')[0]
  const method = config.method?.toLowerCase() || 'get'
  const query = (config.params || {}) as Record<string, string | number | undefined>
  const body = typeof config.data === 'string' ? (() => { try { return JSON.parse(config.data) as Record<string, unknown> } catch { return {} } })() : ((config.data || {}) as Record<string, unknown>)
  let data: unknown = []
  if (url === '/dashboard/resumo') data = buildDashboard(query)
  else if (url === '/admin/usuarios' && method === 'get') {
    const items = demoUsers.filter(user => (!query.username || user.username.toLowerCase().includes(String(query.username).toLowerCase())) && (!query.role || user.role === String(query.role)) && (!query.status || user.status === String(query.status)))
    data = { items, total: items.length }
  }
  else if (url === '/admin/usuarios' && method === 'post') {
    const now = '2026-10-20T10:00:00Z'
    const user = { id: `demo-user-${Date.now()}`, username: String(body.username || 'novo.usuario'), email: String(body.email || 'novo.usuario@osgestor.local'), role: String(body.role || 'OPERADOR'), status: String(body.status || 'ATIVO'), created_at: now, updated_at: now, last_login_at: null, must_change_password: true }
    demoUsers.push(user)
    data = user
  }
  else if (url.startsWith('/admin/usuarios/') && method === 'patch' && url.endsWith('/status')) {
    const id = url.split('/')[3]
    const user = demoUsers.find(item => item.id === id)
    if (user) { user.status = String(body.status || user.status); user.updated_at = '2026-10-20T10:00:00Z' }
    data = user || null
  }
  else if (url.startsWith('/admin/usuarios/') && method === 'patch') {
    const id = url.split('/')[3]
    const user = demoUsers.find(item => item.id === id)
    if (user) { if (body.username) user.username = String(body.username); if (body.email) user.email = String(body.email); if (body.role) user.role = String(body.role); user.updated_at = '2026-10-20T10:00:00Z' }
    data = user || null
  }
  else if (url.startsWith('/admin/usuarios/') && method === 'post' && url.endsWith('/reset-password')) {
    const id = url.split('/')[3]
    const user = demoUsers.find(item => item.id === id)
    if (user) { user.must_change_password = true; user.updated_at = '2026-10-20T10:00:00Z' }
    data = null
  }
  else if (url === '/relatorios/terceiros-categorias') data = thirdParty
  else if (url === '/relatorios/resumo') data = { quantidade_os: 48, os_abertas: 12, os_em_andamento: 9, os_aguardando_peca: 4, os_finalizadas: 22, os_canceladas: 1, total_mao_obra_interna: 35960, total_servicos_terceiros: 52100, total_produtos: 38420, total_gasto: 126480 }
  else if (url.startsWith('/obras')) data = url.endsWith('proximo-codigo') ? { codigo: 'OB-2403' } : projects
  else if (url.startsWith('/frotas')) data = fleets
  else if (url.startsWith('/funcionarios')) data = employees
  else if (url.startsWith('/ordens-servico')) data = url === '/ordens-servico' ? orders : orders[0]
  else if (url.startsWith('/prefixos-frota')) data = fleets.map(f => ({ id: f.id, prefixo: f.codigo, numero: f.numero, frota_id: f.id }))
  else if (url === '/abastecimento/relatorios') data = buildFuelReport()
  else if (url.startsWith('/abastecimento/relatorios/')) data = { total_litros: 18420, total_valor: 112680, quantidade: 126, items: [], entradas: [], por_frota: [] }
  else if (url === '/abastecimento/entradas' && method === 'post') {
    const product = fuelProducts.find(item => item.id === body.produto_id) || fuelProducts[0]
    const entry = { ...fuelEntries[0], id: `demo-entrada-${Date.now()}`, data_entrada: String(body.data_entrada || new Date().toISOString().slice(0, 10)), numero_nf: String(body.numero_nf || 'NF-DEMO-NOVA'), produto_id: product.id, produto: product, litros_nf: Number(body.litros_nf || 0), valor_total_nf: Number(body.valor_total_nf || 0), total_distribuido: 0, destinos: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    fuelEntries.unshift(entry)
    data = entry
  }
  else if (url === '/abastecimento/entradas' && method === 'get') {
    const items = fuelEntries.filter(entry => (!query.produto_id || entry.produto_id === query.produto_id) && (!query.numero_nf || entry.numero_nf.includes(String(query.numero_nf))) && (!query.ponto_id || entry.destinos.some(destination => destination.ponto_id === query.ponto_id)))
    data = { items, pagination: { page: Number(query.page || 1), limit: 20, total: items.length, total_pages: Math.max(1, Math.ceil(items.length / 20)) } }
  }
  else if (url.startsWith('/abastecimento/entradas/') && ['put', 'patch'].includes(method)) {
    const entry = fuelEntries.find(item => url.endsWith(item.id)) || fuelEntries[0]
    Object.assign(entry, { numero_nf: body.numero_nf ? String(body.numero_nf) : entry.numero_nf, litros_nf: body.litros_nf ? Number(body.litros_nf) : entry.litros_nf, valor_total_nf: body.valor_total_nf ? Number(body.valor_total_nf) : entry.valor_total_nf, updated_at: new Date().toISOString() })
    data = entry
  }
  else if (url.startsWith('/abastecimento/entradas/') && method === 'delete') {
    const index = fuelEntries.findIndex(item => url.endsWith(item.id))
    if (index >= 0) fuelEntries.splice(index, 1)
    data = null
  }
  else if (url.startsWith('/abastecimento/entradas/') && method === 'get') data = fuelEntries.find(entry => url.endsWith(entry.id)) || fuelEntries[0]
  else if (url === '/abastecimento/produtos') data = fuelProducts
  else if (url === '/abastecimento/pontos') data = fuelPoints
  else if (url === '/abastecimento/terceiros') data = demoThirdParties
  else if (url === '/abastecimento/destinacoes-especiais') data = demoSpecialDestinations
  else if (url.match(/^\/abastecimento\/pontos\/[^/]+\/produtos$/)) data = fuelProducts
  else if (url === '/abastecimento/historico/bicos') data = ['B01', 'B02']
  else if (url === '/abastecimento/historico' && method === 'get') {
    const items = fuelHistory.filter(item => (!query.produto || item.produto_codigo === query.produto) && (!query.tipo_destinatario || item.tipo_destinatario === query.tipo_destinatario) && (!query.bico || item.bico_codigo_original === query.bico) && (!query.busca || `${item.destinatario} ${item.identificacao_original} ${item.frota_id}`.toLowerCase().includes(String(query.busca).toLowerCase())))
    data = historyResponse(items, Number(query.page || 1), Number(query.limit || 50))
  }
  else if (url.startsWith('/abastecimento/historico/') && ['patch', 'put'].includes(method)) {
    const item = fuelHistory.find(entry => url.endsWith(entry.id)) || fuelHistory[0]
    Object.assign(item, { litros: body.litros ? Number(body.litros) : item.litros, valor_total: body.valor_total ? Number(body.valor_total) : item.valor_total, identificacao_original: body.identificacao_original ? String(body.identificacao_original) : item.identificacao_original })
    data = item
  }
  else if (url === '/abastecimento/abastecimentos/manual' && method === 'post') {
    const item = { ...fuelHistory[0], id: `demo-abast-${Date.now()}`, identificador_externo: `DEMO-AB-${Date.now()}`, litros: Number(body.litros || 0), valor_total: Number(body.valor_total || 0) }
    fuelHistory.unshift(item)
    data = item
  }
  else if (url.startsWith('/abastecimento/historico/') && method === 'get') data = historyResponse(fuelHistory.filter(item => url.endsWith(item.id)))
  else if (url.includes('/abastecimento')) data = []
  else if (method !== 'get') data = config.data || {}
  return Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config, request: {} })
}
