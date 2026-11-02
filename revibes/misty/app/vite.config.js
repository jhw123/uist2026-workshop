import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Model calls go to /llm, which is forwarded to the LLM bridge.
// BRIDGE_URL changes where the bridge is (default http://localhost:8787).
const BRIDGE = process.env.BRIDGE_URL || 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5180,
    proxy: {
      '/llm': { target: BRIDGE, changeOrigin: true, rewrite: (p) => p.replace(/^\/llm/, ''), timeout: 330000, proxyTimeout: 330000 },
    },
  },
});
