export type FleetPrefixStatus='ATIVO'|'INATIVO'
export interface FleetPrefix{id:string;codigo:string;descricao:string|null;status:FleetPrefixStatus;created_at:string;updated_at:string}
export interface FleetPrefixPayload{codigo:string;descricao:string|null;status:FleetPrefixStatus}
export interface UpdateFleetPrefixStatusPayload{status:FleetPrefixStatus}
