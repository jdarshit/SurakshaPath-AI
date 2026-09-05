import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // 0.0.0.0 so devices on the same LAN (e.g. a phone) can reach the dev
    // server, not just this machine's loopback interface.
    host: '0.0.0.0',
    port: 5173,
  },
});