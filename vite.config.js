import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub project pages live at /<repo>/; Actions sets VITE_BASE_PATH.
// Local `vite` / `vite preview` keep the default root "/".
function pagesBase() {
  const raw = process.env.VITE_BASE_PATH
  if (!raw || raw === '/') return '/'
  return raw.endsWith('/') ? raw : `${raw}/`
}

export default defineConfig({
  base: pagesBase(),
  plugins: [react()],
  assetsInclude: ['**/*.glb'],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
})
