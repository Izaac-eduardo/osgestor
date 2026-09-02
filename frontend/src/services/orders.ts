import {api} from './api'
import type{FleetPrefixOption,OrderFilters,ProjectOption,ServiceOrder,ServiceOrderDetails}from'../types/orders'
const params=(filters:OrderFilters):Record<string,string>=>Object.fromEntries(Object.entries(filters).filter((entry):entry is[string,string]=>Boolean(entry[1])))
export async function getServiceOrders(filters:OrderFilters={},signal?:AbortSignal){const{data}=await api.get<ServiceOrder[]>('/ordens-servico',{params:params(filters),signal});return data}
export async function getServiceOrder(id:string,signal?:AbortSignal){const{data}=await api.get<ServiceOrder>(`/ordens-servico/${id}`,{signal});return data}
export async function getServiceOrderDetails(id:string,signal?:AbortSignal){const{data}=await api.get<ServiceOrderDetails>(`/ordens-servico/${id}/detalhes`,{signal});return data}
export async function getProjects(signal?:AbortSignal){const{data}=await api.get<ProjectOption[]>('/obras',{signal});return data}
export async function getFleetPrefixes(signal?:AbortSignal){const{data}=await api.get<FleetPrefixOption[]>('/prefixos-frota',{signal});return data}
