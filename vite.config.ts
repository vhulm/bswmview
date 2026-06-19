import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    tailwindcss(),
  ],
  server: {
    host: host || '0.0.0.0',
    port: 5173,
    strictPort: true,
    hmr: host ? { protocol: 'ws', host, port: 5174 } : undefined,
  },
  clearScreen: false,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // 前端构建产物输出到 dist/
    outDir: 'dist',
    // ELK.js 体积大（~1.4MB），已拆分为独立 chunk 缓存，抑制其 chunk 大小警告
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('elkjs')) return 'elk'
          if (id.includes('@vue-flow')) return 'vueflow'
        },
      },
    },
  },
})
