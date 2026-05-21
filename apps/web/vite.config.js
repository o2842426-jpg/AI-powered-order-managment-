import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
/** Workspace root or apps/web — npm may hoist react to either place */
const resolvePaths = [__dirname, path.resolve(__dirname, '../..')]

function resolveReactAliases() {
  const reactRoot = path.dirname(
    require.resolve('react/package.json', { paths: resolvePaths })
  )
  const domRoot = path.dirname(
    require.resolve('react-dom/package.json', { paths: resolvePaths })
  )
  return {
    react: reactRoot,
    'react-dom': domRoot,
    'react/jsx-runtime': require.resolve('react/jsx-runtime', { paths: resolvePaths }),
    'react/jsx-dev-runtime': require.resolve('react/jsx-dev-runtime', {
      paths: resolvePaths,
    }),
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: resolveReactAliases(),
  },
  optimizeDeps: {
    include: ['framer-motion', 'react', 'react-dom'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
