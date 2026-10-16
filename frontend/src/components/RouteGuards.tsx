import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="auth-loading" role="status" aria-live="polite">Validando sessão...</div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (user.must_change_password) return <Navigate to="/alterar-senha" replace />
  return <Outlet />
}

export function PasswordChangeRoute() {
  const { user, loading } = useAuth()
  if (loading) return <div className="auth-loading" role="status">Validando sessão...</div>
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

export function PublicRoute() {
  const { user, loading } = useAuth()
  if (loading) return <div className="auth-loading" role="status">Validando sessão...</div>
  if (!user) return <Outlet />
  return <Navigate to={user.must_change_password ? '/alterar-senha' : '/'} replace />
}
