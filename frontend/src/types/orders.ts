export const orderStatuses=['ABERTA','EM_ANDAMENTO','AGUARDANDO_PECA','FINALIZADA','CANCELADA'] as const
export const orderNatures=['INTERNA','TERCEIRO','MATERIAL'] as const
export const orderCategories=['MECANICA','AUTO_ELETRICA','BORRACHARIA','LUBRIFICACAO','SOLDAGEM','FUNILARIA','HIDRAULICA','OUTROS'] as const
export type OrderStatus=typeof orderStatuses[number]
export type OrderNature=typeof orderNatures[number]
export type OrderCategory=typeof orderCategories[number]
export interface ServiceOrder{id:string;numero_os:string;obra_id:string;obra_codigo:string;obra_nome:string;frota_id:string|null;prefixo_frota_id:string|null;frota_prefixo:string;frota_numero:number|null;frota_codigo:string;natureza_os:OrderNature;categoria_servico:OrderCategory|null;prestador_terceiro:string|null;data_abertura:string;data_fechamento:string|null;status:OrderStatus;observacoes:string|null;total_mao_obra_interna:string;total_servicos_terceiros:string;total_produtos:string;total_os:string;created_at:string;updated_at:string}
export interface OrderEmployee{id:string;nome:string;matricula:string|null;cargo:string|null;status:'ATIVO'|'INATIVO'}
export interface ServiceExecution{id:string;servico_os_id:string;funcionario_id:string;funcionario_nome:string;inicio:string;fim:string;duracao_minutos:number;created_at:string;updated_at:string}
export interface OrderService{id:string;ordem_servico_id:string;descricao:string;valor:number;execucoes:ServiceExecution[];created_at:string;updated_at:string}
export interface OrderProduct{id:string;ordem_servico_id:string;descricao:string;quantidade:number;unidade:string;valor_unitario:number;valor_total:number;created_at:string;updated_at:string}
export interface ServiceOrderDetails extends Omit<ServiceOrder,'total_mao_obra_interna'|'total_servicos_terceiros'|'total_produtos'|'total_os'>{funcionarios:OrderEmployee[];servicos:OrderService[];produtos:OrderProduct[];total_mao_obra_interna:number;total_servicos_terceiros:number;total_produtos:number;total_os:number}
export interface OrderFilters{numero_os?:string;frota_numero?:string;obra_id?:string;prefixo_frota_id?:string;status?:OrderStatus|'';natureza_os?:OrderNature|'';categoria_servico?:OrderCategory|'';data_inicio?:string;data_fim?:string}
export interface ProjectOption{id:string;codigo:string;nome:string;status:'ATIVA'|'INATIVA'}
export interface FleetPrefixOption{id:string;codigo:string;descricao:string|null;status:'ATIVO'|'INATIVO'}
export interface OrderPayload{numero_os:number;obra_id:string;frota_id:string|null;prefixo_frota_id:string|null;frota_numero:number|null;natureza_os:OrderNature;categoria_servico:OrderCategory|null;prestador_terceiro:string|null;data_abertura:string;data_fechamento:string|null;status:OrderStatus;observacoes:string|null}
export type CreateOrderPayload=Omit<OrderPayload,'status'>&{status?:OrderStatus}
export type UpdateOrderPayload=OrderPayload
export interface EmployeeLinkPayload{funcionario_id:string}
export interface ServiceItemPayload{descricao:string;valor:number}
export interface ServiceExecutionPayload{funcionario_id:string;inicio:string;fim:string}
export interface ProductItemPayload{descricao:string;quantidade:number;unidade:string;valor_unitario:number}
export interface EmployeeOption extends OrderEmployee{created_at:string;updated_at:string}
