import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    cors: {
      origin: ['http://localhost:5173', 'http://192.168.53.100:5173'],
      credentials: true,
    },
    proxy: mode === 'demo' ? undefined : {
      '/auth': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
      '/admin': 'http://localhost:3000',
      '/auditoria': 'http://localhost:3000',
      '/obras': 'http://localhost:3000',
      '/funcionarios': 'http://localhost:3000',
      '/ordens-servico': 'http://localhost:3000',
      '/prefixos-frota': 'http://localhost:3000',
      '/frotas': 'http://localhost:3000',
      '/relatorios': 'http://localhost:3000',
      '/dashboard': 'http://localhost:3000',
      '/importacoes-os': 'http://localhost:3000',
      '/abastecimento': 'http://localhost:3000',
    },
  },
}))
