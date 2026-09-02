export interface DashboardSummary {
  quantidade_os: number
  os_abertas: number
  os_em_andamento: number
  os_aguardando_peca: number
  os_finalizadas: number
  os_canceladas: number
  total_mao_obra_interna: number
  total_servicos_terceiros: number
  total_produtos: number
  total_gasto: number
}

export interface ExpensesByProject {
  obra_id: string
  obra_codigo: string
  obra_nome: string
  total_mao_obra_interna: number
  total_servicos_terceiros: number
  total_produtos: number
  total_gasto: number
  quantidade_os: number
}

export interface OrdersByWeek {
  ano: number
  semana: number
  data_inicio_semana: string
  quantidade_os: number
}