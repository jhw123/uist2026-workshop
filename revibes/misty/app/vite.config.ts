import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// Dev-only endpoint: the app POSTs recorded LLM responses here and they are
// written to src/fixtures/<key>.json, which the cached (golden path) mode replays.
function fixtureRecorder(): Plugin {
  return {
    name: 'misty-fixture-recorder',
    configureServer(server) {
      server.middlewares.use('/__fixtures', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          try {
            const fx = JSON.parse(body)
            const dir = path.resolve(__dirname, 'src/fixtures')
            fs.mkdirSync(dir, { recursive: true })
            const file = path.join(dir, `${fx.key}.json`)
            fs.writeFileSync(file, JSON.stringify(fx, null, 2))
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, file }))
          } catch (e) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: String(e) }))
          }
        })
      })
    },
  }
}

const BRIDGE = process.env.BRIDGE_URL || 'http://localhost:8787'

export default defineConfig({
  plugins: [react(), fixtureRecorder()],
  server: {
    port: 5180,
    proxy: {
      // The browser talks to /llm/...; Vite forwards it to the LLM bridge.
      '/llm': { target: BRIDGE, changeOrigin: true, rewrite: (p) => p.replace(/^\/llm/, '') },
    },
  },
})
