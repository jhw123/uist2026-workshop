import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The browser calls the LLM bridge through /llm, so the bridge's port can change
// without touching the app: MISTY_BRIDGE_URL=http://localhost:8788 npm run dev
const BRIDGE = process.env.MISTY_BRIDGE_URL || "http://localhost:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.MISTY_PORT || 5317),
    proxy: {
      "/llm": {
        target: BRIDGE,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/llm/, ""),
        timeout: 600000,
        proxyTimeout: 600000,
      },
    },
  },
});
