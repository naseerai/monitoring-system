import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

// Keys that must NEVER reach the browser bundle.
const BACKEND_ONLY_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'APP_SECRET',
  // 'SUPABASE_ANON_KEY',  // only the VITE_ copy is needed frontend-side
];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  // ━━ Environment audit: abort the build if a backend secret leaks ━━━━━━━
  for (const key of BACKEND_ONLY_KEYS) {
    // loadEnv with prefix '' loads ALL vars — check if any VITE_ alias exists
    if (`VITE_${key}` in env) {
      throw new Error(
        `\n\n❌  SECURITY ERROR: "VITE_${key}" is defined in your environment.\n` +
        `   This would expose a backend secret to the browser bundle.\n` +
        `   Remove VITE_${key} from your .env file immediately.\n`
      );
    }
  }

  return {
    plugins: [react(), tailwindcss()],

    // Keep Vite’s cache outside node_modules to prevent tsx restarts on churn
    cacheDir: '.vite-cache',

    // Only expose explicitly safelisted VITE_* vars — no process.env passthrough
    define: {},

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    server: {
      port: 5173,

      // HMR is disabled in AI Studio via DISABLE_HMR env var
      hmr: process.env.DISABLE_HMR !== 'true',

      proxy: {
        // All /api calls are forwarded to the Express backend on port 3000
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        },

        // WebSocket traffic is proxied to the same backend
        '/ws': {
          target: 'ws://localhost:3000',
          ws: true,
          changeOrigin: true,
        },
      },
    },
  };
});