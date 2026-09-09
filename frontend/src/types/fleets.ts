export type FleetStatus = 'ATIVO' | 'INATIVO'
export interface FleetPayload {
  codigo: string
  descricao: string | null
  placa: string | null
  modelo: string | null
  ano: number | null
  status: FleetStatus
}
export interface Fleet extends FleetPayload {
  id: string
  prefixo_frota_id: string
  numero: string
  created_at: string
  updated_at: string
}