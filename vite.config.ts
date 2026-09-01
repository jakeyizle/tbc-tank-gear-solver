import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

const config = defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  worker: {
    // solver.worker.ts dynamically import()s src/sim/* modules for sim-backed objectives, so
    // its bundle needs code-splitting support - the default 'iife' worker format doesn't
    // support multiple chunks and fails the production build outright.
    format: 'es',
  },
  plugins: [
    devtools(),
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    viteReact(),
  ],
  test: {
    // glpk.js's default export uses a browser Web Worker; solveConfig.ts is shared with the real
    // worker (which needs that build) and with vitest (plain Node, no Worker global) - swap in
    // glpk.js's Node-native synchronous build for tests only, same API shape, prod build untouched.
    alias: {
      'glpk.js': 'glpk.js/node',
    },
  },
})

export default config
