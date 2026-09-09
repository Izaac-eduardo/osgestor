import {api} from './api'
import type{FleetPrefixOption,OrderFilters,ProjectOption,ServiceOrder,ServiceOrderDetails}from'../types/orders'
const params=(filters:OrderFilters):Record<string,string>=>Object.fromEntries(Object.entries(filters).filter((entry):entry is[string,string]=>Boolean(entry[1])))
export async function getServiceOrders(filters:OrderFilters={},signal?:AbortSignal){const{data}=await api.get<ServiceOrder[]>('/ordens-servico',{params:params(filters),signal});return data}
export async function getServiceOrder(id:string,signal?:AbortSignal){const{data}=await api.get<ServiceOrder>(`/ordens-servico/${id}`,{signal});return data}
export async function getServiceOrderDetails(id:string,signal?:AbortSignal){const{data}=await api.get<ServiceOrderDetails>(`/ordens-servico/${id}/detalhes`,{signal});return data}
export async function getProjects(signal?:AbortSignal){const{data}=await api.get<ProjectOption[]>('/obras',{signal});return data}
export async function getFleetPrefixes(signal?:AbortSignal){const{data}=await api.get<FleetPrefixOption[]>('/prefixos-frota',{signal});return data}
export async function createServiceOrder(payload:import('../types/orders').CreateOrderPayload){const{data}=await api.post<import('../types/orders').ServiceOrder>('/ordens-servico',payload);return data}
export async function updateServiceOrder(id:string,payload:import('../types/orders').UpdateOrderPayload){const{data}=await api.put<import('../types/orders').ServiceOrder>(`/ordens-servico/${id}`,payload);return data}
export async function getEmployees(){const{data}=await api.get<import('../types/orders').EmployeeOption[]>('/funcionarios');return data}
export async function addOrderEmployee(orderId:string,payload:import('../types/orders').EmployeeLinkPayload){const{data}=await api.post<import('../types/orders').OrderEmployee>(`/ordens-servico/${orderId}/funcionarios`,payload);return data}
export async function removeOrderEmployee(orderId:string,employeeId:string){await api.delete(`/ordens-servico/${orderId}/funcionarios/${employeeId}`)}
export async function createOrderService(orderId:string,payload:import('../types/orders').ServiceItemPayload){const{data}=await api.post<import('../types/orders').OrderService>(`/ordens-servico/${orderId}/servicos`,payload);return data}
export async function updateOrderService(orderId:string,itemId:string,payload:import('../types/orders').ServiceItemPayload){const{data}=await api.put<import('../types/orders').OrderService>(`/ordens-servico/${orderId}/servicos/${itemId}`,payload);return data}
export async function removeOrderService(orderId:string,itemId:string){await api.delete(`/ordens-servico/${orderId}/servicos/${itemId}`)}
export async function createServiceExecution(orderId:string,serviceId:string,payload:import('../types/orders').ServiceExecutionPayload){const{data}=await api.post<import('../types/orders').ServiceExecution>(`/ordens-servico/${orderId}/servicos/${serviceId}/execucoes`,payload);return data}
export async function updateServiceExecution(orderId:string,serviceId:string,executionId:string,payload:import('../types/orders').ServiceExecutionPayload){const{data}=await api.put<import('../types/orders').ServiceExecution>(`/ordens-servico/${orderId}/servicos/${serviceId}/execucoes/${executionId}`,payload);return data}
export async function removeServiceExecution(orderId:string,serviceId:string,executionId:string){await api.delete(`/ordens-servico/${orderId}/servicos/${serviceId}/execucoes/${executionId}`)}
export async function createOrderProduct(orderId:string,payload:import('../types/orders').ProductItemPayload){const{data}=await api.post<import('../types/orders').OrderProduct>(`/ordens-servico/${orderId}/produtos`,payload);return data}
export async function updateOrderProduct(orderId:string,itemId:string,payload:import('../types/orders').ProductItemPayload){const{data}=await api.put<import('../types/orders').OrderProduct>(`/ordens-servico/${orderId}/produtos/${itemId}`,payload);return data}
export async function removeOrderProduct(orderId:string,itemId:string){await api.delete(`/ordens-servico/${orderId}/produtos/${itemId}`)}
export async function deleteServiceOrder(id:string):Promise<void>{await api.delete(`/ordens-servico/${id}`)}
