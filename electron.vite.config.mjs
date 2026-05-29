import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.js')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.js')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    server: {
      host: '127.0.0.1'
    },
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src/renderer/main.html'),
          settings: resolve(__dirname, 'src/renderer/settings.html'),
          popup: resolve(__dirname, 'src/renderer/popup.html'),
          'sphere-settings': resolve(__dirname, 'src/renderer/sphere-settings.html'),
          trash: resolve(__dirname, 'src/renderer/trash.html'),
          backup: resolve(__dirname, 'src/renderer/backup.html'),
          'ai-export': resolve(__dirname, 'src/renderer/ai-export.html'),
          about: resolve(__dirname, 'src/renderer/about.html')
        }
      }
    },
    plugins: [react()]
  }
})