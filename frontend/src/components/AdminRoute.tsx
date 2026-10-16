import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function AdminRoute() {
  const { user, loading } = useAuth()
  if (loading) return <div className="auth-loading" role="status">Validando sessão...</div>
  if (!user) return <Navigate to="/login" replace />
  if (user.must_change_password) return <Navigate to="/alterar-senha" replace />
  if (user.role !== 'ADMIN') return <section className="access-denied" aria-labelledby="access-denied-title"><span>403</span><h1 id="access-denied-title">Acesso não autorizado</h1><p>Somente administradores podem gerenciar usuários.</p><a className="button button--primary" href="/">Voltar ao Dashboard</a></section>
  return <Outlet />
}
