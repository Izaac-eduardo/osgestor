import type{OrderCategory,OrderNature,OrderStatus}from'../types/orders'
export const orderStatusLabels:Record<OrderStatus,string>={ABERTA:'Aberta',EM_ANDAMENTO:'Em andamento',AGUARDANDO_PECA:'Aguardando peça',FINALIZADA:'Finalizada',CANCELADA:'Cancelada'}
export const orderNatureLabels:Record<OrderNature,string>={INTERNA:'Interna',TERCEIRO:'Terceiro',MATERIAL:'Material'}
export const orderCategoryLabels:Record<OrderCategory,string>={MECANICA:'Mecânica',AUTO_ELETRICA:'Auto elétrica',BORRACHARIA:'Borracharia',LUBRIFICACAO:'Lubrificação',SOLDAGEM:'Soldagem',FUNILARIA:'Funilaria',HIDRAULICA:'Hidráulica',OUTROS:'Outros'}
