import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

export default defineConfig({
  base: './',
  plugins: [react()],
  // Версія береться з package.json і підставляється в код під час збірки,
  // тому показник в інтерфейсі не може розійтися з файлом.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { open: true },
})