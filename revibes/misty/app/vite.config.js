import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Misty's "backend" is this dev server: it serves the app and forwards /llm/* to the
// workshop's LLM bridge (llm-bridge/bridge.py), so the browser never needs an API key.
const BRIDGE = process.env.MISTY_BRIDGE_URL || "http://localhost:8787";
const PORT = Number(process.env.MISTY_PORT || 5180);

export default defineConfig({
  plugins: [react()],
  server: {
    port: PORT,
    strictPort: false,
    proxy: {
      "/llm": {
        target: BRIDGE,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/llm/, ""),
        timeout: 400000,
        proxyTimeout: 400000,
      },
    },
  },
  define: { __BRIDGE_URL__: JSON.stringify(BRIDGE) },
});
