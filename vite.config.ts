import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron'
import { fileURLToPath, URL } from 'node:url'

// 仅在 ELECTRON=true 时激活 Electron 插件
// npm run dev → 浏览器模式（不加载 Electron）
// npm run dev:electron → Electron 模式
const isElectron = !!process.env.ELECTRON

export default defineConfig({
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
    chunkSizeWarningLimit: 3000,
  },
  plugins: [
    vue(),
    tailwindcss(),
    ...(isElectron
      ? [
          electron([
            {
              // 主进程入口
              entry: 'electron/main.ts',
              vite: {
                build: {
                  outDir: 'dist/electron',
                  emptyOutDir: true,
                },
              },
            },
            {
              // 预加载脚本
              entry: 'electron/preload.ts',
              onstart(args) {
                // 预加载脚本更新时重新加载渲染进程
                args.reload()
              },
              vite: {
                build: {
                  outDir: 'dist/electron',
                  emptyOutDir: false,
                },
              },
            },
          ]),
        ]
      : []),
  ],
  server: {
    host: '0.0.0.0',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
