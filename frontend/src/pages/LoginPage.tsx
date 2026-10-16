import { Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import logo from '../assets/branding/itaipu-engenharia-logo-branca.png'
import { useAuth } from '../auth/AuthContext'

export function LoginPage() {
  const { login, error, clearError } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !username.trim() || !password) return
    setBusy(true); clearError()
    try {
      const loggedUser = await login(username, password)
      navigate(loggedUser.must_change_password ? '/alterar-senha' : ((location.state as { from?: string } | null)?.from || '/'), { replace: true })
    } catch { /* mensagem já disponibilizada pelo contexto */ } finally { setBusy(false) }
  }
  return <main className="auth-page"><section className="auth-panel" aria-labelledby="login-title"><img className="auth-logo" src={logo} alt="Itaipu Engenharia" /><span className="auth-accent" aria-hidden="true" /><p className="auth-subtitle">SISTEMA DE GESTÃO DE MANUTENÇÃO E ABASTECIMENTO</p><h1 id="login-title">Acesso ao sistema</h1><form onSubmit={submit} noValidate><label className="auth-field">Usuário<input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required /></label><label className="auth-field">Senha<span className="auth-password"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /><button type="button" className="auth-password-toggle" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} title={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>{error && <p className="auth-error" role="alert">{error}</p>}<button className="auth-submit" type="submit" disabled={busy || !username.trim() || !password}>{busy ? <><LoaderCircle className="spin" size={17} />Entrando...</> : 'Entrar'}</button></form></section></main>
}
