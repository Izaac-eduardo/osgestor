import{api}from'./api';import type{FleetPrefix,FleetPrefixPayload,FleetPrefixStatus}from'../types/fleetPrefixes'
export async function getFleetPrefixes(){const{data}=await api.get<FleetPrefix[]>('/prefixos-frota');return data}
export async function getFleetPrefixById(id:string){const{data}=await api.get<FleetPrefix>(`/prefixos-frota/${id}`);return data}
export async function createFleetPrefix(x:FleetPrefixPayload){const{data}=await api.post<FleetPrefix>('/prefixos-frota',x);return data}
export async function updateFleetPrefix(id:string,x:FleetPrefixPayload){const{data}=await api.put<FleetPrefix>(`/prefixos-frota/${id}`,x);return data}
export async function updateFleetPrefixStatus(id:string,status:FleetPrefixStatus){const{data}=await api.patch<FleetPrefix>(`/prefixos-frota/${id}/status`,{status});return data}
export async function deleteFleetPrefix(id:string){await api.delete(`/prefixos-frota/${id}`)}
