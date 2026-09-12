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
    // Both Workers are constructed with `{ type: "module" }` (see src/solver/index.ts and
    // src/sim/simWorkerPool.ts), so they are ES module workers and this keeps the output format
    // matching. It is also what tbc-new builds its own workers with.
    //
    // This was originally here for a different and now-obsolete reason: solver.worker.ts used to
    // dynamically import() src/sim/*, which forced its bundle to code-split, and the default
    // 'iife' format cannot emit multiple chunks - it failed the production build outright. Phase 5
    // made those imports static, so a build with 'iife' now succeeds (verified). The setting stays
    // because the format should match how the Workers are actually constructed, not because
    // code-splitting still requires it.
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
    // Stryker copies the whole project into .stryker-tmp/sandbox-*/ to run mutants. Without
    // this, a plain `vitest run` during a mutation run discovers the sandbox's copy of every
    // test file and runs the suite twice - against instrumented sources.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.stryker-tmp/**'],
    coverage: {
      provider: 'v8',
      // `text` for the terminal, `json-summary` so a script can diff two runs (see
      // test:coverage vs test:coverage:fast in package.json - the gap between them is
      // precisely the code only the slow real-wasm tests reach, which is also the code
      // mutation testing is blind to).
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      // Report on every source file, not just the ones a test happened to import - otherwise
      // an entirely untested module is invisible rather than 0%.
      all: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // Generated: protobuf-ts output and the TanStack route tree.
        'src/sim/proto/**',
        'src/routeTree.gen.ts',
        // Vendored verbatim from the Go toolchain.
        'src/sim/wasm_exec.js',
        // Test scaffolding is not the subject under test.
        'src/**/*.test.{ts,tsx}',
        'src/**/__fixtures__/**',
        'src/**/__test-helpers__/**',
        'src/sim/testFixtures/**',
        // Entry points and type-only modules: nothing to assert, and they drag the
        // denominator around without ever telling us anything.
        'src/main.tsx',
        'src/router.tsx',
        'src/vite-env.d.ts',
        'src/**/*.d.ts',
      ],
      // Deliberately no `thresholds.break` yet. Picking a bar before measuring the baseline
      // invents an argument; record the number first, then decide whether to ratchet.
    },
  },
})

export default config
