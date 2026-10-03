import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Reuse the same self-signed cert as the Express server so the phone sees
// one consistent HTTPS origin. Generate with: npm run gen:cert (in server/).
// Without the cert files Vite stays on plain HTTP (current behaviour).
const keyPath =
  process.env.SSL_KEY_PATH || path.join(__dirname, '..', 'server', 'certs', 'key.pem')
const certPath =
  process.env.SSL_CERT_PATH || path.join(__dirname, '..', 'server', 'certs', 'cert.pem')
const httpsFlag = (process.env.HTTPS || 'auto').toLowerCase()
const hasCert = fs.existsSync(keyPath) && fs.existsSync(certPath)
if (httpsFlag === '1' && !hasCert) {
  throw new Error(`HTTPS=1 but cert not found (${keyPath}, ${certPath}). Run gen:cert in server/ first.`)
}
const useHttps = httpsFlag === '1' || (httpsFlag === 'auto' && hasCert)
// Backend speaks HTTPS too when the cert exists; the proxy must not reject
// our self-signed cert, otherwise every /api call fails in dev.
const backend = process.env.BACKEND || (useHttps ? 'https://localhost:3000' : 'http://localhost:3000')

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    ...(useHttps ? { https: { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) } } : {}),
    proxy: {
      '/api': { target: backend, secure: false, changeOrigin: true },
      '/uploads': { target: backend, secure: false, changeOrigin: true },
      '/barcodes': { target: backend, secure: false, changeOrigin: true },
    },
  },
})
