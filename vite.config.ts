import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // The API base URL. In production it is injected at build time through
  // VITE_API_BASE_URL (the BFF / API Gateway URL). In development the dev
  // server proxies to the local backend, so an empty value works too.
  const apiBaseUrl = env.VITE_API_BASE_URL ?? ''
  const localBackend = env.VITE_DEV_BACKEND_URL ?? 'http://localhost:8000'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      proxy: apiBaseUrl
        ? undefined
        : {
            '/api': { target: localBackend, changeOrigin: true },
            '/auth': { target: localBackend, changeOrigin: true },
            '/health': { target: localBackend, changeOrigin: true },
          },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  }
})
