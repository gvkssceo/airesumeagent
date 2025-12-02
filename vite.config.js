import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/webhook': {
        target: 'https://gvkssjobs.n8n-wsk.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/webhook/, '/webhook/d48e6560-289b-450c-a612-d04bb2247440'),
        secure: true,
      }
    }
  }
})

