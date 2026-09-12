# Architecture: the vendored sim as the single source of truth

This app has one job the vendored simulator does not do: **choose which items to equip.**
Everything else about the game — what a stat is worth, what a buff does, what a character's
avoidance actually is — comes from `vendor/tbc-sim`, a vendored copy of the WoWSims TBC
simulator compiled to WebAssembly.

That division is the whole architecture. This document describes how it is arranged and which
parts are load-bearing.

> **History.** This file replaced `docs/plans/sim-backed-objectives.md`, which was the plan and
> execution log for the original sim integration, and was later cited from ~18 source files as
> though it were an architecture reference. The plan and its execution log remain in git
> history; what was still true has been folded in here. Code comments should cite sections of
> *this* file.

## North star

A Protection Paladin user pastes a gear pool, picks an optimization goal, and gets back a real
gear/enchant/gem set — with every number behind that choice produced by the same simulator
wowsims.net runs, not by a hand-written formula that drifts away from it.

Objective modes (`SolverConfig.ts`'s `objectiveMode`):

- **`stats`** — maximize a user-weighted sum of stats.
- **`ehp`** — maximize effective HP, accounting for the nonlinear armor damage-reduction curve.
- **`hardAvoidance`** — maximize avoidance subject to uncrushable/uncrittable thresholds.
- **`tps` / `dtps` / `tmi`** — maximize threat, or minimize damage taken / Theck-Meloree Index,
  using stat weights calibrated by running the actual sim.
- **`balanced`** — a continuous blend between `tps` and one survivability metric, driven by the
  UI's balance slider (`metricRatiosForBalance` in `calibrateWeights.ts`).

The encounter, buffs, talents, and consumables are user-editable through the raid profile, and
are shown on the character surface rather than buried in an "advanced" accordion — they shape
every solve, not just the sim-backed ones.

## The two halves, and the boundary between them

| | `src/solver/` | `src/sim/` |
|---|---|---|
| Owns | the LP: item/gem/enchant selection under constraints | everything about game mechanics |
| Knows about | a `LinearStatModel` handed to it | wasm, protos, the raid profile, the encounter |
| Must not | import `src/sim/` | — |

`src/data/tbcDatabase.ts` is the **neutral layer** between them: it owns the single fetch of
`db.json` and adapts those records into this repo's domain types. It imports neither side, so
both may import it.

### The `src/solver/ ↛ src/sim/` boundary

The LP core is generic over its stat model: it optimizes a dot product against coefficients
someone else measured. Keeping it that way is what makes the solver testable without a 37MB
wasm instance, and it is why `SimMetricsSnapshot` and `CharacterStatsSnapshot` live in
`src/types/` rather than `src/sim/` — the solver and the UI need to *name* those shapes without
pulling in the sim's module graph.

This is enforced by **biome's `noRestrictedImports`**, scoped to `src/solver/` in `biome.json`.
Two files are exempt because they *are* the seam rather than the core:

- `src/solver/solver.worker.ts` — builds the stat model and the item pool, then solves.
- `src/solver/index.ts` — the main-thread orchestrator, which owns the `localStorage`-backed
  round-1 weights cache and the calibration-stat translation.

It used to be enforced instead by `import()`-ing `src/sim/` dynamically inside the worker. That
expressed an architectural constraint as a bundling trick, and bought nothing at runtime: every
one of those imports was awaited unconditionally at the top of `onmessage`, so the split chunk
was always fetched immediately after the worker booted.

## How a solve runs

```
main thread                          shared solver Worker
-----------                          --------------------
warmSolverWorker()  ───warm───▶      loadWasm() + loadTbcDomainDatabase()
                    ◀──warmed──
solveAll()
  per config:
    solve()         ───solve───▶     deriveLinearModel(db, profile)   ← ~25 computeStats probes
                    ◀─progress──       indexItemDatabase(...)
                    ◀─progress──       solveGearSet(...)              ← the LP
                    ◀──result───       measureCharacterStats(...)
```

### One Worker for the session

`solve()` used to construct a Worker and terminate it on every exit path. A Worker is its own
realm, so all the module-level memoization the sim depends on died with it — `wasmCoordinator`'s
Go instance, `tbcDatabase`'s fetch+adapt caches, `computeStatsClient`'s LRU. Every config of
every solve re-gunzipped 5.7MB → 37MB of wasm, re-instantiated it, re-ran `go.run`, and
re-parsed the 3.1MB database before any LP work began.

There is now one Worker for the session, which makes all of that once-per-session and makes
warming meaningful. Note that warming has to happen *in the Worker*: the main thread has no sim
consumer at all, so warming there would build a 37MB instance in a realm that never reads it.

Two things this arrangement has to get right, both previously automatic:

- **Request correlation.** Every request carries an id and every reply echoes it, so a late
  message from an abandoned request cannot be routed to its successor.
- **Error recovery.** Termination *was* the recovery path, so it is now explicit: any error
  recycles the Worker. A Go panic leaves the runtime dead, and nothing in the message
  distinguishes that from a clean user-facing throw.

### The stat model is the handoff

`deriveLinearModel` (`src/sim/deriveLinearModel.ts`) is where "what the game does" becomes "what
the LP optimizes". Everything the solver knows about race, talents, buffs, debuffs, consumables
and stat conversions arrives in that one object.

It is measured, not written down: `computeStats` is called once with no equipment for the base,
then once per probe stat with `Player.bonus_stats = {stat: 1000}`, and each coefficient is the
difference divided by 1000. A delta of 1000 is deliberate — `FloorGameStats()` quantizes, so a
small delta differences badly.

`computeStats` runs **zero sim iterations** — it is what powers wowsims' character panel updating
instantly on item swap — so this costs wasm startup, not simulation time.

Three things this measurement cannot do, each handled explicitly:

- **Defense is analytic, not probed.** `GetDefenseReduction()` floors
  (`floor(rating / 2.365385) * 0.04 / 100`), so a finite difference would measure the wrong
  slope. See the invariant below.
- **Base block chance needs a shield.** `GetPseudoStatsProto` zeroes `BlockPercent` unless one is
  equipped, so the base is measured a second time wearing a reference shield, whose known
  contribution is then subtracted back out.
- **Holy Shield is invisible.** It is an active aura, not a build-phase stat, so its +30% block
  appears in no stat vector. `deriveLinearModel` adds it by hand, the same way wowsims' own panel
  does. Without it every avoidance floor is 30 points out of reach.

> **INVARIANT — per-item coefficients must use UNROUNDED defense.**
> Defense skill is `floor(totalRating / 2.365385)`, and `floor(a+b) ≠ floor(a)+floor(b)`. Rounding
> baked into a per-item coefficient discards each candidate's fractional remainder instead of
> letting it combine with its neighbours', which breaks the additivity the entire LP rests on.
>
> The rounding is *relocated*, not ignored: `runLPModelWithAvoidanceConvergence` re-checks the
> assembled set's real rounded avoidance and tightens the target when rounding leaves it short.
> That loop is the designed home for this nonlinearity.

## Talking to the wasm

### Two execution paths, for two different cost profiles

- **The coordinator** (`wasmCoordinator.ts`) — one shared Go instance for every cheap, non-
  iteration-bound call: `computeStats`, `statWeightRequests`, `statWeightCompute`. Two modules
  each running their own `go.run` would mean two 37MB instances and two sets of globals
  clobbering each other on `globalThis`.
- **The worker pool** (`simWorkerPool.ts` + `simExecutor.worker.ts`) — dedicated wasm-only
  Workers for iteration-bound sims, fed by `simJobQueue.ts` as a pipelined job queue.

Default pool size mirrors wowsims' own `Math.min(4, hardwareConcurrency / 2)`; measurement on
real hardware showed ~3.4x speedup at that count with negligible gain past it. It is overridable
via the profile's `calibration.workerCount`.

**Why a job queue rather than splitting each request across the pool**: splitting was measured to
add ~0% total CPU overhead, so there was no per-chunk setup cost to amortize. The real win is
letting independent requests — most importantly `calibrateWeights`' independent *replicates* —
run concurrently instead of barrier-waiting.

### The wasm is shipped gzipped

`lib.wasm` is ~37MB raw, over Cloudflare Workers assets' 25MiB per-file deploy limit, so it ships
as `lib.wasm.gz`. Whether the fetched bytes are still compressed on arrival is server-dependent
(Vite's dev server transparently decompresses; Cloudflare's asset server does not), so
`fetchWasmModule` checks the gzip magic number rather than assuming either way.

`index.html` carries a `rel="prefetch"` for it so the fetch starts during HTML parse, at a
priority that yields to the app's own bundle.

### The proto field map

The generated protos are the easiest place to be quietly wrong, because a misplaced field is
silently dropped rather than rejected:

- **`Player.rotation` is top-level.** A oneof like `protectionPaladin` is flattened onto its
  parent message in proto3 JSON, not nested under a `spec` key.
- **Party buffs go on `Party.buffs`, not `Raid.buffs`.** Getting this wrong silently drops ~8
  buffs.
- **Item stats are a sparse map** (`scalingOptions["0"].stats`, `{statIndex: value}`) while
  **`socketBonus` is a dense 42-array.** Getting this split wrong is a silent failure.
- **An enchant's class restriction lives on the item that applies it**, not on the enchant, so
  `toEnchant` needs a join through `items[].classAllowlist`.

`buildSimPlayer.ts` is the single place a player is assembled, so the `computeStats` and
`statWeights` request builders cannot drift apart.

### App enum ids vs proto enum ids

App class ids **do** match proto `Class` (ClassWarrior=1, ClassPaladin=2). App race ids **do
not** match proto `Race` — app Human=1, proto Human=5, proto 1=BloodElf, and only Dwarf
coincides at 3. `src/data/races.ts` owns the mapping in both directions; nothing else may assume
the id spaces line up.

### The SimDatabase

A sim request carries its own database of just the records it references. Building one is a
filter-by-id + drop-UI-fields operation over `db.json`, not a data pipeline of our own
(`buildSimDatabase.ts`).

Several arrays in the protos are **positional, index-matched to `common.proto`'s `Stat` enum
ordinals** rather than keyed — for example an encounter target's stats, where index 17 is Armor,
index 31 the boss's own Armor, index 33 Health. `src/data/mechanicsEnums` and `statTranslation.ts`
own these mappings so no call site hardcodes an ordinal.

**A SimDatabase must carry consumables.** Flask/food/potion ids do nothing without their
database records — they are silently ignored, which skews every calibration.

### Stat translation

Units already match on both sides (flat rating-point atoms), so `statTranslation.ts` is a name
remap, not a conversion. Two things that are not mechanical:

- `Miss` in this repo's `StatName` list is base miss chance vs. a boss, not an equippable stat.
- **DTPS and TMI-5 weights must be sign-flipped** before being fed to `objectiveStats`: lower raw
  metric is better, but the solver always maximizes.

## Calibration (the sim-backed objective modes)

`calibrateWeights.ts` returns stat weights in the same `Stat[]` shape `optimizeStats` already
accepts, so calibrated weights feed straight into the existing `stats` solve path with no solver
changes at all. `solveSimMetric.ts` wraps that in the refine loop: calibrate → solve → recalibrate
near the result → resolve, until the chosen item set stabilizes.

- One batch computes tps/dtps/tmi together — they come from the same sim run.
- **Round 1 always calibrates around the same fixed baseline gear**, so its result depends only
  on the profile and the metric blend, never on the item pool. That makes it cacheable across
  solves (`round1WeightsCache.ts`, main thread only — the Worker has no `localStorage`).
- `replicates` averages N independent batches to shrink Monte Carlo noise by √N, a brute-force
  variance reduction for noisy metrics like TMI-5.

The shipped defaults (200 iterations, 20 rounds) come from a real convergence investigation, not
a guess: 4000 iterations bought no reliable benefit over 200 at 20x the cost, while the old
5-round cap never let the loop converge at all. Below ~200 iterations noise gets amplified
non-linearly by the LP choosing among many simultaneously-noisy weights.

## The Prot Paladin profile

Scope is Protection Paladin against one reference encounter derived from the vendored sim's own
`default_encounter_only.build.json`. The APL is used as **precompiled output**
(`protPaladinDefaultApl.ts`) rather than recompiled here.

The profile's defaults are chosen so an unedited profile reproduces the original hardcoded v1
calibration request exactly. Two deliberate departures, both documented at their definitions:
`useAvengersShield`/`precastAvengersShield` default to `false` (matching the vendored UI, and
because precasting structurally changes the compiled APL), and `race` defaults to `RaceHuman`
(the UI's own default — the old hardcoded `RaceDraenei` meant the sim and the UI disagreed about
who the character was).

## Local patches to the vendored sim

`vendor/tbc-sim` is **patched**, so its DTPS/TMI output intentionally differs from wowsims.net.
See `vendor/tbc-sim/sim/core/unit.go` (defense → miss). Any comparison against the public site
has to account for this.

Two avoidance conventions that look wrong and are not:

- The base 5/5/5/0.65 + 102.4% uncrushable threshold is **correct**; do not "fix" it to the 4.4%
  boss combat values.
- TBC avoidance is exactly **linear in rating space** (`unit.go`): dodge/parry/block are
  `rating / constant / 100` with no diminishing returns. The only nonlinearity in the whole
  avoidance path is the defense floor above, which is why the LP's constraint rows can be exact
  rather than approximate.

## Known sharp edges

- **A Paladin solve that selects 2+ pieces of another class's tier set crashes the sim.**
  `applyItemSetBonusEffects` runs the Warrior set-bonus closure against a `*ProtectionPaladin`
  and panics. Mitigated by filtering class-restricted items out of the candidate pool
  (`prepareItemCandidates`), not by guarding the vendored sim.
- **Dependent configs freeze gems across sets, by design.** An item is one physical object with
  one set of gems; config order is a priority order. A later config scoring below its standalone
  optimum is the honest price of being second in line, not a defect.
- **A `stats` config with no weighted stats has an identically zero objective**, so every
  feasible set ties and the solver returns an arbitrary one. `assertObjectiveIsWeighted` rejects
  this rather than letting it silently dictate gemming for every config after it.

## Verifying a change

`tsc --noEmit`, `biome lint`, and `vitest run` do not cover everything here.

**`vite build` is a required gate for any change to `solver.worker.ts` or its imports.** This is
not a formality: an earlier session shipped a worker change that passed the type-checker, the
linter, and the full test suite, and failed the production build outright — Vite's default worker
output format could not code-split (fixed by `worker: { format: 'es' }` in `vite.config.ts`).
Bundler/output-format constraints only surface during a real build.

For anything touching the stat model, the correctness claim is an equality, and it is worth
asserting directly: for a random gear set,

```
base_axis + Σ_items scoreStats(item.stats, model)[axis] === computeStats(profile, gearSet).axis
```

within 1e-6, for avoidance, uncrit, and each resistance. That single check catches the three
quiet failure modes at once — party-buff placement, sparse-vs-dense stat arrays, and
differencing across the defense floor.
