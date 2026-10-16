import { Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import logo from '../assets/branding/itaipu-engenharia-logo-branca.png'
import { useAuth } from '../auth/AuthContext'
import { api } from '../services/api'

type Fields = { currentPassword: string; newPassword: string; confirmPassword: string }
export function ChangePasswordPage() {
  const { user, refresh, logout } = useAuth()
  const [fields, setFields] = useState<Fields>({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [visible, setVisible] = useState<Record<keyof Fields, boolean>>({ currentPassword: false, newPassword: false, confirmPassword: false })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()
  const update = (key: keyof Fields, value: string) => setFields(current => ({ ...current, [key]: value }))
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    if (fields.newPassword !== fields.confirmPassword) { setError('A confirmação da nova senha não confere.'); return }
    setBusy(true)
    try { await api.post('/auth/change-password', fields); await refresh(); setSuccess(true); setTimeout(() => navigate('/', { replace: true }), 500) }
    catch (caught) { setError(axios.isAxiosError<{ message?: string }>(caught) ? caught.response?.data?.message || 'Não foi possível alterar a senha.' : 'Não foi possível alterar a senha.') }
    finally { setBusy(false) }
  }
  const field = (key: keyof Fields, label: string, autocomplete: string) => <label className="auth-field">{label}<span className="auth-password"><input type={visible[key] ? 'text' : 'password'} autoComplete={autocomplete} value={fields[key]} onChange={event => update(key, event.target.value)} required /><button type="button" className="auth-password-toggle" aria-label={visible[key] ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`} onClick={() => setVisible(current => ({ ...current, [key]: !current[key] }))}>{visible[key] ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
  return <main className="auth-page"><section className="auth-panel" aria-labelledby="password-title"><img className="auth-logo" src={logo} alt="Itaipu Engenharia" /><span className="auth-accent" aria-hidden="true" /><p className="auth-subtitle">SISTEMA DE GESTÃO DE MANUTENÇÃO E ABASTECIMENTO</p><h1 id="password-title">Alterar senha</h1><p className="auth-help">A senha inicial precisa ser alterada antes de acessar o sistema.</p><p className="auth-user">{user?.username}</p><form onSubmit={submit}>{field('currentPassword', 'Senha atual', 'current-password')}{field('newPassword', 'Nova senha', 'new-password')}{field('confirmPassword', 'Confirmar nova senha', 'new-password')}<p className="auth-help">Use pelo menos 8 caracteres, com uma senha que você não utilize em outro serviço.</p>{(error || success) && <p className={success ? 'auth-success' : 'auth-error'} role="alert">{success ? 'Senha alterada com sucesso.' : error}</p>}<button className="auth-submit" type="submit" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17} />Salvando...</> : 'Alterar senha'}</button></form><button className="auth-logout-link" type="button" onClick={() => void logout()}>Sair</button></section></main>
}
