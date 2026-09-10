import axios from 'axios'
export const api = axios.create({baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',headers:{'Content-Type':'application/json'}})
api.interceptors.request.use(config=>{
  if(config.data instanceof FormData) config.headers.delete('Content-Type')
  return config
})
