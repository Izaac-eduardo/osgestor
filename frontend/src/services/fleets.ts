import { api } from './api'
import type { Fleet, FleetPayload, FleetStatus } from '../types/fleets'
export async function getFleets() { return (await api.get<Fleet[]>('/frotas')).data }
export async function getFleet(id: string) { return (await api.get<Fleet>('/frotas/' + id)).data }
export async function createFleet(payload: FleetPayload) { return (await api.post<Fleet>('/frotas', payload)).data }
export async function updateFleet(id: string, payload: FleetPayload) { return (await api.put<Fleet>('/frotas/' + id, payload)).data }
export async function updateFleetStatus(id: string, status: FleetStatus) { return (await api.patch<Fleet>('/frotas/' + id + '/status', { status })).data }
export async function deleteFleet(id: string) { await api.delete('/frotas/' + id) }