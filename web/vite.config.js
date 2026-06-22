import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // base '/' ensures assets load from /assets/... when served by the Go binary via go:embed.
  // BrowserRouter works because the Go server falls back to index.html for all non-asset paths.
  base: '/',
  // A10: read shared root .env / .env.dev; only VITE_* are exposed to the browser
  envDir: '..',
  plugins: [
    tailwindcss(),
    react(),
  ],
  build: {
    // Route-splitting (React.lazy in App.jsx) keeps the entry chunk small;
    // bump the warning ceiling so legitimately-grouped vendor code is quiet.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Group the stable React/router runtime into one long-cached vendor
        // chunk, separate from per-route app code that changes frequently.
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) {
            return 'react-vendor'
          }
        },
      },
    },
  },
  // Dev: the frontend uses relative API paths; proxy them to the Go backend on :8080
  // so there's no cross-origin/CORS concern in `npm run dev` / `dev:full`.
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
      '/auth': 'http://localhost:8080',
      '/admin': 'http://localhost:8080',
      '/healthz': 'http://localhost:8080',
    },
  },
})
