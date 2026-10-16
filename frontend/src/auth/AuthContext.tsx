import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import axios from 'axios'
import { api } from '../services/api'

export type AuthRole = 'ADMIN' | 'OPERADOR' | 'GESTOR'
export type AuthUser = { id: string; username: string; email: string; role: AuthRole; status: 'ATIVO' | 'INATIVO'; must_change_password: boolean }

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<AuthUser>
  logout: () => Promise<void>
  refresh: () => Promise<AuthUser | null>
  clearError: () => void
  canWrite: boolean
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

function message(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    if (error.response?.status === 429) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
    if (error.response?.status === 401) return 'Usuário ou senha inválidos.'
    if (error.response?.status === 403) return error.response.data?.message || 'Acesso não autorizado.'
    if (error.response?.data?.message) return error.response.data.message
  }
  return fallback
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const response = await api.get<{ user: AuthUser }>('/auth/me')
      setUser(response.data.user)
      return response.data.user
    } catch (caught) {
      if (axios.isAxiosError(caught) && caught.response?.status === 401) setUser(null)
      else setError(message(caught, 'Não foi possível validar a sessão.'))
      return null
    }
  }, [])

  useEffect(() => {
    let active = true
    refresh().finally(() => { if (active) setLoading(false) })
    const handleUnauthorized = () => setUser(null)
    window.addEventListener('osgestor:unauthorized', handleUnauthorized)
    return () => { active = false; window.removeEventListener('osgestor:unauthorized', handleUnauthorized) }
  }, [refresh])

  const login = useCallback(async (username: string, password: string) => {
    setError(null)
    try {
      const response = await api.post<{ user: AuthUser }>('/auth/login', { username, password })
      setUser(response.data.user)
      return response.data.user
    } catch (caught) {
      const next = message(caught, 'Não foi possível conectar ao servidor.')
      setError(next)
      throw new Error(next)
    }
  }, [])

  const logout = useCallback(async () => {
    setError(null)
    try { await api.post('/auth/logout') } finally { setUser(null) }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({ user, loading, error, login, logout, refresh, clearError: () => setError(null), canWrite: user?.role !== 'GESTOR', isAdmin: user?.role === 'ADMIN' }), [user, loading, error, login, logout, refresh])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return context
}
