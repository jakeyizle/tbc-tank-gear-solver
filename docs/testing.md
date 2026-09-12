# Testing and verification

| Command | What it does |
|---|---|
| `npm test` | Full suite, including six real-wasm files (~53s) |
| `npm run test:fast` | Everything except those six (~4s) |
| `npm run test:coverage` / `:fast` | Coverage over the full / fast suite |
| `npm run test:mutate` | Mutation testing (~8-13 min); report in `reports/mutation/` |
| `npm run verify:solver-worker` | Browser harness for Worker and wasm lifetime |
| `npx vite build` | **Required gate** for `solver.worker.ts` changes |

`vitest.fast.config.ts` owns the slow-file list in one place, so `test:fast`, `test:coverage:fast`
and Stryker all agree on what "fast" means.

`verify:solver-worker` needs `npx playwright install chromium`, and Playwright pins a browser build
per release — bumping that devDependency means running the install again.

## The two gates unit tests cannot replace

**`vite build`** — a worker change once passed tsc, Biome and the full suite and failed the
production build outright. Bundler and output-format constraints only surface in a real build.

**`verify:solver-worker`** — asserts one solver Worker per session, one Go instance per stats-mode
session, and no wasm or database refetch on a second solve. Every unit test passes whether the
Worker is shared or rebuilt per solve; the difference is network traffic and process lifetime, not
behaviour. It found a duplicate 37MB wasm coordinator on its first run.

Note that Playwright does not surface Web Worker console output, so a Worker-side failure is only
visible through UI state.

## Mutation testing scope

Stryker grades tests, so anything it cannot grade is excluded from `mutate` rather than left in to
drag the score down (see `stryker.config.json`):

- **wasm-backed modules** (`deriveLinearModel`, `computeStatsClient`, `wasmCoordinator`,
  `measureCharacterStats`, `fetchWasmModule`, `simExecutor.worker`) — reachable only through the
  slow files Stryker does not run. The fast-vs-full coverage diff quantifies this blind spot.
- **Worker/wasm plumbing** (`statWeightsClient`, `simWorkerPool`) — the tested halves are small.
- **Pure data tables** (`protPaladinDefaultApl`, `itemSupplement`, `consumables`, `types`) — their
  only possible test is a snapshot of the constant.

Provably-equivalent survivors are marked `// Stryker disable next-line all` **with the reason**, so
they do not retrain everyone to ignore the report.

Baseline (no `thresholds.break` set, deliberately): coverage **51.1% statements / 82.9% branches**
full-suite, statements dominated by the untested UI layer; mutation score **64.1%** over the scoped
set. Remaining survivors concentrate in `solveConfig.ts`, `items.ts`, `calibrateWeights.ts`,
`solveSimMetric.ts` and `solver/index.ts` — the obvious next target.

## Known gaps

UI layer (41 components, 4 routes, 0%; `@testing-library/react` and jsdom are installed but
imported by nothing), `hooks/useSolverConfigs.ts` (its one pure risky piece, the legacy-config
patch, is not exported), `simWorkerPool.ts` dispatch, `fetchWasmModule.ts` gzip sniffing, and CI.

`testLinearModel.ts` is validated only by `deriveLinearModel.test.ts`, which needs the real sim and
is outside the mutation set. It fails on drift unless `UPDATE_LINEAR_MODEL_FIXTURE=1` is set, so
the risk is someone setting that env var to make a red test green.
