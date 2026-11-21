import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(),    tailwindcss(),],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: '../src/hacknation_2026/static',
    emptyOutDir: true,
  },
  server: {
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    environment: 'node',
  },
})
