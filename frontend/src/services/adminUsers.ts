import { api } from './api'

export type AdminRole = 'ADMIN' | 'OPERADOR' | 'GESTOR'
export type AdminStatus = 'ATIVO' | 'INATIVO'
export type AdminUser = { id: string; username: string; email: string; role: AdminRole; status: AdminStatus; created_at: string; updated_at: string; last_login_at: string | null; must_change_password: boolean }
export type AdminUserInput = { username: string; email: string; password: string; role: AdminRole; status: AdminStatus }
export type AdminUserUpdate = { username: string; email: string; role: AdminRole; status?: AdminStatus }
export async function listAdminUsers(params: { username?: string; role?: string; status?: string; limit?: number; offset?: number } = {}) { return (await api.get<{ items: AdminUser[]; total: number }>('/admin/usuarios', { params })).data }
export async function createAdminUser(payload: AdminUserInput) { return (await api.post<AdminUser>('/admin/usuarios', payload)).data }
export async function updateAdminUser(id: string, payload: AdminUserUpdate) { return (await api.patch<AdminUser>(`/admin/usuarios/${id}`, payload)).data }
export async function updateAdminUserStatus(id: string, status: AdminStatus) { return (await api.patch<AdminUser>(`/admin/usuarios/${id}/status`, { status })).data }
export async function resetAdminUserPassword(id: string, password: string) { await api.post(`/admin/usuarios/${id}/reset-password`, { password }) }
