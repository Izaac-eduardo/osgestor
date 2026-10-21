import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { Header } from '../components/Header'
import { useAuth } from '../auth/AuthContext'
import { isDemoMode } from '../services/api'
import { getPageTitle } from '../utils/pageTitles'

export function AppLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <div className="app-shell" data-auth-role={user?.role}>
      <Sidebar open={open} onClose={() => setOpen(false)} user={user} onLogout={() => void logout()} />
      <div className="app-shell__main">
        {isDemoMode && <div className="demo-banner" role="status">Versão Demonstrativa · dados fictícios</div>}
        <Header title={getPageTitle(location.pathname)} onOpenMenu={() => setOpen(true)} />
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
