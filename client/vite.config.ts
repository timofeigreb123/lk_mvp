import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev-сервер проксирует API и WebSocket на бэкенд — cookie работают как на одном домене.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    host: true, // слушать и IPv4 (127.0.0.1), и IPv6 (::1) — иначе на Windows localhost может не открыться
    proxy: {
      '/api': 'http://127.0.0.1:4000',
      '/socket.io': { target: 'http://127.0.0.1:4000', ws: true },
    },
  },
});
