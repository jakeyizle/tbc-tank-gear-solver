# Verification pass: is this test suite worth trusting?

Phases 0-5 of the sim-as-source-of-truth refactor rewrote the app's stat engine, item data source,
config model and Worker architecture across 20 commits. Every one of them was signed off by the
same green suite. Nothing had ever checked whether that suite constrains behaviour.

This pass answered two questions: **what is untested**, and **are the tests that exist vacuous**.

It found that the second question mattered far more than the first.

## How to re-run any of this

| Command | What it does |
|---|---|
| `npm test` | The full suite, including the six real-wasm files (~53s) |
| `npm run test:fast` | Everything except those six (290 tests, ~4s) |
| `npm run test:coverage` | Line/branch coverage, full suite |
| `npm run test:coverage:fast` | Coverage over the fast subset only |
| `npm run test:mutate` | Mutation testing (~13 min); HTML report in `reports/mutation/` |
| `npm run verify:solver-worker` | Browser harness for Worker/wasm lifetime |

`vitest.fast.config.ts` owns the list of slow files, in one place, so `test:fast`,
`test:coverage:fast` and Stryker all agree on what "fast" means.

## Finding 1: the solver suite could not detect two deleted guards

This is the headline, and it is the answer to "are the tests vacuous".

`src/solver/__test-helpers__/validateSolution.ts` is what the solver suite checks its solutions
against — 21 call sites across four test files, which is the repo's entire solver-correctness
surface. It describes itself as independently recomputing what a gear set achieves. It is not
independent: line 3 imports `scoreItemSet` from `scores.ts` and line 46 calls it.

It is *not* wholly circular, and the distinction matters. The LP feeds GLPK per-item **unrounded**
coefficients and lets GLPK sum them, while the validator re-scores the **assembled set** with
`roundDefense: true`. Those are genuinely different aggregation paths, so the helper does catch
model and constraint bugs — which is most of what it was written for.

What it cannot catch is a bug *inside* `axisTotals`, because both sides of every assertion inherit
it identically.

**Measured, not argued.** Running Stryker against `scores.ts` with and without the new direct test
gives the counterfactual:

| | survivors in `scores.ts` |
|---|---|
| The suite as it stood before this pass | **8** |
| With `src/solver/scores.test.ts` added | **5** |

The three newly-killed mutants are at lines 55 (x2) and 61 — exactly:

- `if (stat.type === "multiplier") continue;` — deleting this double-applies buff and talent
  multipliers, which are already baked into the measured coefficients.
- `if (!coefficients) continue;` — deleting this lets a stat the model never measured produce
  `NaN`, poisoning an entire objective axis.

Both are silent corruptions of every score the solver computes, and before this pass the whole
solver suite ran through `scoreItemSet` constantly without being able to notice either.

**The fix was not to rewrite the helper.** A second scoring implementation inside
`validateSolution` would drift, and then there would be two things to maintain and still no
oracle. Instead `scores.test.ts` hand-computes every expected value against a tiny literal model —
deliberately *not* `TEST_LINEAR_MODEL`, since importing the real fixture would reintroduce the
coupling the test exists to break. The helper keeps doing the structural job it is good at (slot
counts, duplicate ids, unique gems, flask/elixir exclusivity, two-hander vs shield), which was
always genuinely independent.

## Finding 2: coverage would never have found this

Every module this pass targeted as "riskiest" was already at or near 100% **statement** coverage:

| module | statements before | direct assertions before |
|---|---|---|
| `solver/scores.ts` | 100% | none |
| `data/talentString.ts` | 100% | none |
| `sim/stableHash.ts` | 100% | none |
| `sim/buildSimPlayer.ts` | 100% | none |
| `solver/itemSlots.ts` | 100% | none |
| `solver/items.ts` | 97% | four cases |

They are executed constantly by tests aimed at something else. Coverage measures whether a line
ran, and every one of those lines ran.

This also corrected the premise this pass started from. An inventory by "does a file have a test
file named after it" flagged `solveAll`, `items.ts` and `buildSimPlayer.ts` as untested; all three
are in fact directly exercised (`solveConfig.test.ts` drives `solveAll` through an injected
`solveFn` in three scenarios, and calls `prepareItemCandidates` directly at four sites). Coverage
is the right tool for finding the genuinely-zero files, and it found those too — `helpers/resultStats.ts`
at 0% was the real gap of that kind.

## Finding 3: an asymmetry in enchant deduping, found by writing the test

Writing `itemDatabase.test.ts` turned up a rule nothing had written down. `indexItemDatabase`
dedupes the *supplement* against the database on `effectID`, but two enchants the **database
itself** carries may legitimately share one — five do, being the same effect on a different slot
("Bracer - Fortitude" and "Boots - Fortitude" are both effectID 2649). Both must survive, or that
slot becomes un-enchantable.

So the array invariant is asymmetric: no duplicate **item** ids (that is the GLPK "duplicate
indices" crash), but duplicate enchant effectIDs are expected and fine, because LP variables are
named from `varName`, not `effectID`. My first version of the test asserted the wrong thing and
failed; the assertion now encodes the real contract, with the reasoning.

## Baseline numbers

Coverage, full suite: **51.1% statements / 82.9% branches**. The statement figure is dominated by
the UI layer, which is out of scope for this pass — 41 components and 4 routes at 0%.

Mutation score over the scoped set (see "Blind spots"): **57.6%** before this pass's tests,
from 3,445 mutants. Worst offenders by surviving mutant count were `solveConfig.ts` (131),
`items.ts` (147), `calibrateWeights.ts` (53+75), `solveSimMetric.ts` (92) and `index.ts` (55).

No `thresholds.break` is set. Picking a bar before knowing the baseline invents an argument; the
number is recorded here so a future commit can ratchet from it deliberately.

## Tests added

| file | what it pins |
|---|---|
| `src/solver/scores.test.ts` | The dot product, against a hand-built model. Includes the LP's load-bearing invariant stated directly: unrounded defense scores are additive, rounded ones are not. |
| `src/data/talentString.test.ts` | Every mapped talent index, asserted against `vendor/.../paladin.json`, so a submodule bump that shifts one fails here instead of silently corrupting Improved Righteous Fury and every EHP solve. |
| `src/helpers/resultStats.test.ts` | The four numbers the compare view shows. Was 0% covered. |
| `src/sim/stableHash.test.ts` | Key order must not matter; array order and values must. |
| `src/solver/itemDatabase.test.ts` | The supplement merge and the asymmetry in Finding 3. |
| `src/solver/itemSlots.test.ts` | `SLOT_ORDER` as a literal — it is a positional contract with the Lua exporter, so pinning it is the point. |
| `src/solver/solveAllInheritance.test.ts` | `inheritedItemIds` and the `tracksInheritance` gate, via a fake `solveFn`. This is the reporting that exists because the cross-config locking once cost days of misdiagnosis. |
| `src/sim/buildStatWeightsRequest.test.ts` (extended) | The proto traps: `protectionPaladin` flattened not nested, `rotation` top-level, profile race overriding the baseline default, and `toGearRefs` dropping empty gem sockets. |

One of these came straight from a surviving mutant: forcing `if (totals.Defense !== undefined)`
to `true` survived, because nothing checked that an axis nobody requested stays *out* of the
result vector. That is now asserted.

## Blind spots, stated plainly

**Mutation testing does not cover the wasm-backed code.** Stryker runs against the fast subset, so
anything only the six real-wasm files reach gets no mutation signal and is excluded from `mutate`
so it cannot inflate the score: `deriveLinearModel.ts`, `computeStatsClient.ts`,
`buildComputeStatsRequest.ts`, `measureCharacterStats.ts`, `wasmCoordinator.ts`,
`fetchWasmModule.ts`, `simExecutor.worker.ts`. The fast-vs-full coverage diff quantifies it — e.g.
`buildComputeStatsRequest.ts` is 100% covered by the full suite and 13% by the fast one.

An honest score over a known scope beats a meaningless one over an unknown scope, which is why
those files are excluded rather than left in to look bad.

**`statWeightsClient.ts` and `simWorkerPool.ts` are also excluded** — their tested halves are small
and their untested halves are wasm/Worker plumbing, so mutating them measures the blind spot rather
than the tests.

**Pure data tables are excluded** (`protPaladinDefaultApl.ts`, `itemSupplement.ts`,
`data/consumables.ts`, `solver/types.ts`). Mutating a 421-line APL literal or a label table
produces hundreds of survivors whose only possible test is a snapshot of the constant. Stryker is
here to grade tests.

**Nothing in this pass validates `testLinearModel.ts`.** Its drift detector is
`deriveLinearModel.test.ts`, which needs the real sim and is therefore outside the mutation set.
The detector is sound — it fails on drift unless `UPDATE_LINEAR_MODEL_FIXTURE=1` is set — so the
risk is social (someone sets the env var to make a red test green), not structural.

## Deliberately not done

- **The UI layer.** 41 components, 4 routes, `routes/index.tsx` at 350 lines, all at 0%.
  `@testing-library/react` and `jsdom` are installed but imported by exactly zero files, so this is
  a new surface rather than an extension of an existing one.
- **`hooks/useSolverConfigs.ts`** (198 lines, 0%). It calls `useState`/`useCallback` at the top
  level, so testing it needs `renderHook` and jsdom — the machinery above. Its one pure, genuinely
  risky piece is the legacy-config patch, which is not currently exported. **Highest-value
  UI-adjacent gap**; exporting that function and testing it alone would be cheap.
- **`simWorkerPool.ts`'s dispatch.** A real gap, needing a fake `Worker` plus timers.
  `solverWorkerClient.test.ts`'s `FakeWorker` shows the pattern if a later pass wants it.
- **`fetchWasmModule.ts`'s gzip sniffing.** Both branches are cheap to test in Node 22 and it is
  the clearest case of "only reachable by a test that is skipped by default".
- **CI.** There is none (`.github/` does not exist). The scripts are committed and CI-ready; wiring
  a pipeline was not in scope.
