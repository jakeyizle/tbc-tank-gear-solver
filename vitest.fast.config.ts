import { mergeConfig } from 'vite'
import viteConfig from './vite.config'

// The suite minus the six files that load the real 37MB wasm sim.
//
// Those six are 50 of the full suite's 53 seconds; what remains is 290 tests in 3.7s. That gap
// is what makes mutation testing possible at all - Stryker re-runs the suite once per mutant, so
// a 53s suite is hopeless and a 3.7s one is routine.
//
// Defined here rather than as --exclude flags so the list lives in ONE place: `npm run test:fast`,
// `npm run test:coverage:fast` and stryker.config.json all point at this file. A slow test added
// later only has to be named once.
//
// This EXTENDS vite.config.ts rather than restating it, because the tests depend on three things
// from there that are easy to forget: the `glpk.js` -> `glpk.js/node` alias, `define`'s
// __APP_VERSION__, and the tsconfigPaths plugin that resolves `#/*`.
export const SLOW_WASM_TEST_FILES = [
  // Real wasm, loaded from disk and instantiated by hand (see each file's header).
  '**/src/sim/*.integration.test.ts',
  '**/src/sim/computeStatsGolden.test.ts',
  '**/src/sim/deriveLinearModel.test.ts',
  // Real wasm AND the real LP, end to end; also holds the 5 opt-in convergence tests.
  '**/src/sim/convergenceInvestigation.test.ts',
]

export default mergeConfig(
  viteConfig,
  {
    test: {
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.stryker-tmp/**',
        ...SLOW_WASM_TEST_FILES,
      ],
    },
  },
)
