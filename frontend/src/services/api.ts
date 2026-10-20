import axios from 'axios'
import { demoAdapter } from './demo-data'

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim()

export const isDemoMode = import.meta.env.MODE === 'demo'
export const api = axios.create({baseURL: isDemoMode ? undefined : (configuredApiUrl || undefined),withCredentials:true,headers:{'Content-Type':'application/json'}, ...(isDemoMode ? { adapter: demoAdapter } : {})})
api.interceptors.request.use(config=>{
  if(config.data instanceof FormData) config.headers.delete('Content-Type')
  return config
})
api.interceptors.response.use(response => response, error => {
  const requestUrl = typeof error.config?.url === 'string' ? error.config.url : ''
  const isPasswordChange = requestUrl === '/auth/change-password' || requestUrl.endsWith('/auth/change-password')
  if (error.response?.status === 401 && !isPasswordChange && typeof window !== 'undefined') window.dispatchEvent(new Event('osgestor:unauthorized'))
  return Promise.reject(error)
})
