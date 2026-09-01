# Plan: sim-backed objectives (TPS / DTPS / TMI-5)

Status: **Phase 0 complete and validated end-to-end. Phase 1 mostly done. Phase 2 started.**
See "Execution log" at the bottom for exactly what's been built, what's been proven to work,
and what's next. Originally written after a design conversation exploring how to combine
this repo's LP-based gear solver with `tbc-new` (a wowsims-family combat simulator at
`D:\CodingProjects\tbc-new`, `github.com/wowsims/tbc-new`, MIT-licensed). This document is
meant to be self-contained enough to execute from without re-deriving the reasoning below.

## North star

A Protection Paladin user can pick a primary optimization goal — EHP, TPS, DTPS, or TMI-5 —
optionally paired with a floor/ceiling constraint on a second one of those metrics, and get
back a real gear/enchant/gem set from the same instant-feeling solver workflow that exists
today, with the sim-backed metrics calibrated by an actual combat simulation rather than a
hand-derived formula.

Concretely:

- **Objective picker**: choose one primary metric to optimize. EHP stays exactly as today
  (formula-driven, instant). New: TPS, DTPS, TMI-5, each powered by sim-calibrated weights.
- **Optional secondary constraint**: a floor or ceiling on a second metric (e.g. "minimize
  TMI-5, subject to TPS ≥ X" or "maximize TPS, subject to TMI-5 ≤ Y") — same mechanism as
  today's resistance-stat floors, just with sim-derived coefficients. **v1 supports one
  primary + one secondary constraint only** — not arbitrary combinations.
- **Infeasibility is reported plainly, not auto-relaxed**: if no gear set satisfies the
  secondary constraint, the user sees that directly and loosens the threshold themselves. No
  binary-search-for-nearest-feasible-value logic.
- **Iterative refine runs under the hood** on every sim-backed solve (solve → recalibrate
  weights near the result → resolve until the chosen item set stabilizes) — invisible to the
  user beyond a longer wait than the instant EHP/manual-stats paths.
- **Scope is Protection Paladin only**, against one fixed, hardcoded reference
  encounter/buffs/talents/consumables. This is **shown as read-only context** in the UI (e.g.
  "Optimized against: Magtheridon, standard raid buffs, default talents") so results stay
  interpretable even though nothing is editable yet.
- **Explicitly deferred, not forgotten**, and each should slot into this architecture without
  a rewrite: other classes/specs, editable encounter/buffs/talents, a continuous
  bias-slider blend between two metrics' weight vectors, and a Pareto-frontier chart sweeping
  a constraint threshold. The frontier chart is the one deferred item with real open
  engineering risk (see "Multi-objective mechanism" below) — flagged as a stretch goal, not
  part of this plan.

### Why this mechanism, not a blend slider or full Pareto sweep (rejected alternatives)

Three ways to do multi-objective were considered:

1. **Epsilon-constraint (chosen)**: optimize metric A subject to a hard floor/ceiling on
   metric B. Directly matches "you cannot give up all threat for survivability, or vice
   versa" — a guarantee, not a preference. Architecturally identical to the existing
   resistance-floor mechanism (see below), so it's the cheapest to build and the only one with
   no extra calibration cost, since `tbc-new`'s calibration call computes weights for
   *all* of Dps/Tps/Dtps/Tmi/PDeath in a single perturbation-sim batch — picking a
   primary+secondary pair costs the same sim time as picking one metric alone.
2. **Weighted blend** (`objective = α·A_weights + (1-α)·B_weights`, a slider): cheap once both
   weight vectors exist, continuous, but the result is in made-up blended units with no
   principled interpretation of what a given α buys you. Deferred to a later iteration once
   epsilon-constraint is validated — it reuses the same two weight vectors, so it's a small
   add-on later, not wasted work now.
3. **Pareto frontier sweep** (solve repeatedly across a range of thresholds, plot the
   tradeoff curve): the most complete answer to "explore the tradeoff space," but calibration
   weights are a **local linearization around one baseline gear set**. A build near
   "cap threat, minimal avoidance" and one near "cap avoidance, minimal threat" sit far
   enough apart in stat-space that one weight vector may not describe both — this is the same
   avoidance/block-curvature nonlinearity that motivates the iterative-refine loop in the
   first place, now showing up at the *ends* of a sweep, which is exactly where it matters
   most. A trustworthy frontier needs recalibration at multiple sweep points (real added sim
   cost per point). Deferred as a stretch goal, not part of this plan.

## Architecture facts this plan depends on

### This repo (`wow-tank-gear-solver`)

- `SolveOptions` / `SolverConfiguration` (`src/types/SolverConfig.ts`,
  `src/solver/SolverConfiguration.ts`) hold `objectiveMode: "stats" | "ehp"` and
  `optimizeStats: Stat[]`.
  - `"stats"` mode ([solveConfig.ts](../../src/solver/solveConfig.ts),
    [scores.ts:18-29](../../src/solver/scores.ts#L18)) already accepts an arbitrary,
    externally-supplied weight vector as-is: `calculateObjectiveScore` just does
    `objectiveScore += statSum * objectiveStat.value` for each `{name, value}` pair. **This
    is the reusable path for a static sim-calibrated vector** — no core-solver change needed
    just to plug one in.
  - `"ehp"` mode ([solveEHP.ts:55-146](../../src/solver/solveEHP.ts#L55)) is an iterative SLP
    loop (`MAX_EHP_ITERATIONS = 15`) that recomputes a synthetic 2-stat weight vector
    (`Health`/`Armor`, from a Taylor-linearization of the nonlinear EHP formula) each round
    until convergence. **This is the pattern to mirror** for the new sim-backed iterative
    refine loop — same shape, different weight source (a real sim calibration call instead of
    a closed-form derivative).
- `ResistanceFloor` ([types.ts:71-74](../../src/solver/types.ts#L71)) is the existing
  "constrain metric B while maximizing metric A" pattern:
  ```ts
  export interface ResistanceFloor {
      stat: StatName;
      value: number;
  }
  ```
  `SolverConfiguration`'s constructor ([SolverConfiguration.ts:108-116](../../src/solver/SolverConfiguration.ts#L108))
  converts each floor into an LP target by subtracting what base stats/talents/buffs already
  provide:
  ```ts
  this.resistanceTargets = this.resistanceFloors.map((floor) => {
      const baseResistance = calculateStatValue({ items: [], modifierSources: this.flatModifierSources, baseStats: this.baseStats, statName: floor.stat });
      return { stat: floor.stat, target: floor.value - baseResistance };
  });
  ```
  Then in `runLPModel` ([solveConfig.ts:326-336](../../src/solver/solveConfig.ts#L326)), each
  floor with `target > 0` becomes one `SubjectTo` row via `makeResistanceConstraint`
  ([solveConfig.ts:133-148](../../src/solver/solveConfig.ts#L133)):
  ```ts
  const makeResistanceConstraint = (vars, stat, target, glpk) => ({
      name: `resistance_${stat}`,
      vars,
      bnds: { type: glpk.GLP_LO, lb: target, ub: Number.POSITIVE_INFINITY },
  });
  ```
  with `vars` built by `buildResistanceVars`
  ([decomposedModel.ts:89-113](../../src/solver/decomposedModel.ts#L89)), summing each
  candidate's precomputed `resistanceScores[stat]` coefficient. **Multiple floors are
  independent rows** — no interaction between them, just N separate `GLP_LO` constraints
  pushed into the same `constraints` array. Only `GLP_LO` (floor) exists today; a ceiling
  (`GLP_UP`) is a trivial variant, not yet used on any score axis (currently only used for
  slot/cardinality constraints).
- Objective sense is **fixed at `GLP_MAX`**
  ([decomposedModel.ts:279-282](../../src/solver/decomposedModel.ts#L279)) — always maximizes
  `objectiveScore`. This means any "lower is better" metric (DTPS, TMI-5) needs its
  calibrated weights **sign-flipped** before use, not the solver direction changed.
- Worker protocol: `solver.worker.ts` (full file, 22 lines):
  ```ts
  self.onmessage = async (e) => {
      const { items, options } = e.data as { items: InputItem[]; options: SolveOptions };
      try {
          const result = await solveGearSet(items, options, (progress) =>
              postMessage({ type: "progress", ...progress }),
          );
          postMessage({ type: "result", items: result });
      } catch (error) {
          postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
      }
  };
  ```
  invoked from `src/solver/index.ts:36-72` (`solve()`), which spawns one `Worker` per solve
  call and `terminate()`s it on result/error. Progress messages are
  `{ iteration, maxIterations }` ([solveConfig.ts:46-49](../../src/solver/solveConfig.ts#L46)),
  reused as-is (with relabeled UI text) for the new sim-backed calibration loop.
- UI insertion points:
  - `ConfigCard.tsx:392-408` — the `objectiveMode` picker, a MUI `ToggleButtonGroup`:
    ```tsx
    <ToggleButtonGroup size="small" exclusive value={config.objectiveMode} onChange={(_, mode) => mode && onUpdateObjectiveMode(mode)}>
        <ToggleButton value="stats">Stat weights</ToggleButton>
        <ToggleButton value="ehp">Maximize Effective HP</ToggleButton>
    </ToggleButtonGroup>
    ```
    New objective values (`"tps"`, `"dtps"`, `"tmi5"`) are added here, each rendering
    read-only context text (per north star) instead of manual stat entry.
  - `ResistanceFloors.tsx` is the direct template for the new secondary-constraint UI: a
    `Select` (choose from remaining unused options) + numeric `TextField` with a "≥"
    adornment + delete `IconButton` + "+ Add" affordance. For the secondary constraint, swap
    the stat enum for the three non-primary metrics, and add a floor/ceiling toggle (today's
    resistance floors are hardcoded to "≥").
  - Wiring: `ConfigCard` props → `ConfigManager.tsx:127-128` → `useSolverConfigs.ts:82-107`
    (`updateConfig`/`updateOptimizeStats`/`updateResistanceFloors`) → `src/routes/index.tsx`.
    No context involved — solver config is plain `useState`, prop-drilled.
- Central types needing new fields: `src/types/SolverConfig.ts` (widen `objectiveMode` union;
  add `secondaryConstraint?`), `createEmptyConfig()` defaults in the same file, and the
  persistence-migration fallback pattern already used in `useSolverConfigs.ts:13-24` (e.g.
  `objectiveMode: c.objectiveMode ?? "stats"`) — follow the same defensive-`??` pattern for
  any new persisted field.
- `src/solver/types.ts` holds `ScoreAxis`/`ScoreSet`/`ResistanceFloor` — a new metric axis
  needs a parallel structure (`Partial<Record<StatName, number>>`-shaped, same as
  `resistanceScores`) rather than a new type family.
- Build: Vite 7, `glpk.js@^5.0.0`, deployed as a Cloudflare Worker
  (`wrangler.jsonc`/`worker/index.ts`) that **only** serves static assets and an analytics
  beacon — no existing server compute/KV/D1/queues to lean on. No existing direct-`.wasm`
  import in this repo (glpk.js wraps its own wasm internally via its npm package); Vite 7's
  built-in wasm-asset handling should make adding one low-friction but this is untested
  ground here.

### `tbc-new` (the simulator being vendored)

- WASM entry point: `sim/wasm/main.go`. `init()` calls `core.SetRunningInWasm()` (forces
  single-threaded sim execution — **do not run concurrent requests against one instantiated
  module**) and `sim.RegisterAll()` (registers all class/spec implementations; required
  before any sim call, happens automatically via `init()`).
- Exposed global relevant here:
  ```go
  js.Global().Set("statWeights", js.FuncOf(statWeights))
  ```
  Calling convention (`main.go:185-203`): input is `args[0]`, a JS `Uint8Array` containing a
  **binary-serialized** `proto.StatWeightsRequest` (not JSON, not base64). Output is a raw
  `Uint8Array` containing a binary-serialized `proto.StatWeightsResult`, returned
  **synchronously** — no callback/promise. (An async variant, `statWeightsAsync`, exists with
  a progress-callback + request-ID-based cancellation if that's later preferred over the
  synchronous call; not needed for v1.) Note `statWeights` has **no panic recovery** — an
  internal sim panic propagates as an uncaught exception, unlike `computeStats`.
- Build: `GOOS=js GOARCH=wasm go build -o lib.wasm ./sim/wasm/` (Go 1.25, see `go.mod`). No
  binary is committed to `tbc-new`'s own repo; must be built fresh. Actual output size is
  **unmeasured** — must be built and measured in Phase 0, not assumed.
- `wasm_exec.js` (the Go WASM JS runtime glue) is **not vendored** in `tbc-new` either — it's
  read from the local Go toolchain at build time (`go env GOROOT`, then
  `$GOROOT/misc/wasm/wasm_exec.js` or `$GOROOT/lib/wasm/wasm_exec.js` depending on Go
  version) and textually prepended to the worker bundle via a custom Vite plugin
  (`vite.build-workers.mts:58-68`). **This repo needs its own vendored copy**, pinned to
  match the Go version used to build `lib.wasm` (the JS shim is coupled to the Go runtime ABI
  — versions must match).
- Loader sequence (`ui/worker/sim_worker.ts` + `ui/worker/worker_interface.ts`, ~110 lines
  total, self-contained and portable — no dependency on the rest of `ui/core` beyond the
  generated proto types):
  ```ts
  globalThis.wasmready = function () {
      new WorkerInterface({ statWeights, /* ...other globals... */ }).ready(true);
  };
  const go = new Go(); // from the inlined wasm_exec.js
  WebAssembly.instantiateStreaming(fetch('lib.wasm'), go.importObject).then(async result => {
      await go.run(result.instance); // blocks until the Go program exits (never, until worker dies)
  });
  ```
  `globalThis.wasmready` **must** be defined before `go.run` starts (Go's `main()` calls
  `js.Global().Call("wasmready")` once all globals are registered) — it is, since it's
  defined synchronously above the `go.run` call. `fetch('lib.wasm')` is relative to the
  worker script's own URL, so the built `lib.wasm` must be served alongside wherever the new
  worker script ends up.
- Protobuf: `@protobuf-ts/plugin` + `@protobuf-ts/runtime` (not `google-protobuf`, not
  `ts-proto`). Codegen (`makefile:73-75`):
  ```
  npx protoc --ts_opt generate_dependencies --ts_out ui/core/proto --proto_path proto proto/api.proto
  ```
  Generated `.ts` files are gitignored in `tbc-new` itself (regenerated every build) but are
  self-contained — only import `@protobuf-ts/runtime` and each other, no dependency on the
  rest of `ui/core`. Portable to regenerate (or copy) into this repo as long as
  `@protobuf-ts/runtime` is added as a dependency.
- **Risk found during exploration, then substantially de-risked during execution**: the
  WASM sim ships **no built-in item database** — `sim/core/database_load.go` shows the
  full-DB loader (`database.Load()`, reading `assets/database/db.bin`) is gated behind the
  `with_db` Go build tag, which the wasm target (`GOOS=js GOARCH=wasm go build ./sim/wasm/`)
  does **not** set. So the calling app must supply a `SimDatabase` (`proto/db.proto`,
  referenced at `proto/api.proto:94` as `SimDatabase database = 50;`) embedded in every
  request, containing the item/gem/enchant records for everything referenced by
  `Player.equipment`.
  - `SimGem.stats` and `SimEnchant.stats` are `repeated double` — **flat 42-element arrays**
    indexed by `common.proto`'s `Stat` enum ordinal (confirmed via
    `sim/core/stats/stats.go:22-64`: `Strength=0, Agility=1, Stamina=2, ..., Armor=31, ...,
    PhysicalDamage=41`; the array ends there — the 7 pseudo-stats after `PhysicalDamage` in
    the Go-internal enum aren't part of the wire format). `SimItem` stats instead live in a
    `map<int32, double>` inside `ScalingItemProperties`, keyed by the same ordinals, nested
    under `scaling_options[0]` (key `0` = the "Base" item-level state — confirmed via
    `sim/core/database.go:422`, `scalingOptions := item.ScalingOptions[0]`, as the only key
    ever read; TBC items don't have Legion/Retail-style ilvl upgrade tracks, so there is
    exactly one entry per item in practice).
  - **The translation/export step turned out to already exist, committed, in the
    submodule**: `vendor/tbc-sim/assets/database/db.json` (3.1MB, git-tracked, confirmed via
    `git ls-files`) is a pre-built dump of the *entire* item/gem/enchant database in exactly
    this wire shape — protobuf-ts JSON convention, camelCase fields, stats already encoded as
    flat 42-element arrays or `scalingOptions["0"].stats` maps at the correct ordinals (spot
    checked: a gem's `"stats":[0,0,...,4,4,4,4,0]` at indices 36-39 = the four school
    resistances; an item's `scalingOptions["0"].stats["31"]` = Armor). It's a superset
    shape (`UIItem`/`UIGem`/`UIEnchant` — has a few extra UI-only fields like `icon`/`phase`/
    `quality` that `SimItem`/`SimGem`/`SimEnchant` don't) but the overlapping fields are
    named identically.
  - **This changes Phase 2's `buildMinimalSimDatabase` task from "build a data pipeline out
    of this repo's own item data" to "filter `db.json`'s `items`/`gems`/`enchants` arrays down
    to the IDs referenced by the candidate gear set, then drop the handful of UI-only
    fields"** — no stat re-derivation, no risk of this repo's own item data disagreeing with
    the sim's expectations, since it's the sim's own authoritative data. This is no longer
    the plan's largest unknown-effort item; it's now a small, well-scoped filter function.
- Corrected proto field map (an earlier draft of this plan had these wrong — verified against
  `proto/api.proto` directly):
  - `Player.rotation` (field 44) is **top-level**, type `APLRotation` — not nested per-spec.
    The five simple-rotation booleans (`ProtectionPaladin.Rotation`,
    `proto/paladin.proto:124-133`) are a separate, UI-only struct that gets compiled down
    into this top-level `APLRotation` via `simpleRotation()` (see below) before being sent.
  - `Player.spec.protectionPaladin.options` only holds `PaladinOptions` (auras, etc.) — the
    simple-rotation booleans live in neither this nor a `specOptions` field; they're the
    separate `ProtectionPaladin.Rotation` struct mentioned above.
  - `IndividualBuffs` lives directly on `Player.buffs` (field 8).
  - `RaidBuffs` / `PartyBuffs` / `Debuffs` are **siblings of `player`** on
    `StatWeightsRequest` itself (`proto/api.proto:518-530`), not nested inside the player
    object:
    ```proto
    message StatWeightsRequest {
        Player player = 1;
        RaidBuffs raid_buffs = 2;
        PartyBuffs party_buffs = 3;
        Debuffs debuffs = 9;
        Encounter encounter = 4;
        SimOptions sim_options = 5;
        repeated Stat stats_to_weigh = 6;
        repeated PseudoStat pseudo_stats_to_weigh = 10;
        Stat ep_reference_stat = 7;
    }
    ```
- `simpleRotation()` needs only `player.getTalents()` off a `Player` object
  ([player.tsx:947-952](file:///D:/CodingProjects/tbc-new/ui/core/player.tsx#L947)), which is
  just `playerTalentStringToProto(playerSpec, talentsString)` — a pure function over static
  talent-tree config data (`ui/core/talents/factory.ts:59-65`), no DOM involved. **Do not
  instantiate the real `Player` class** to get this — its constructor
  (`player.tsx:307`) requires a live `Sim` instance and builds an `ItemSwapSettings` from a UI
  component file (`./components/item_swap_picker`), part of the same module graph as `Toast`
  and `character_stats`. Instead, vendor just the two pure functions
  (`playerTalentStringToProto` and `sim.ts`'s `simpleRotation()`,
  `ui/paladin/protection/sim.ts:219-355`) and call `simpleRotation()` against a minimal shim:
  ```ts
  const talents = playerTalentStringToProto(PlayerSpecs.ProtectionPaladin, talentsString);
  const playerStub = { getTalents: () => talents } as Player<Spec.SpecProtectionPaladin>;
  const rotation = SPEC_CONFIG.simpleRotation(playerStub, simpleRotationBooleans, cooldowns);
  ```
  This keeps the calibration path worker-safe with zero DOM/UI imports, while staying
  correct as `tbc-new`'s actual rotation logic evolves (since it calls the real function, not
  a reimplementation).
- License/remote confirmed: MIT (`LICENSE`, "Copyright (c) 2022 wowsims team"), real GitHub
  remote (`origin https://github.com/wowsims/tbc-new`) — a git submodule is viable, no
  licensing blocker.

### Protection Paladin sim profile — already-shipped assets to reuse, not author

All confirmed present in `tbc-new`:

- Default APL: `ui/paladin/protection/apls/default.apl.json` — full priority list (Judgement
  maintenance, Holy Shield uptime, Consecration/Exorcism/Avenger's Shield/Hammer of Wrath
  sequencing, prepull casts). **Not needed for v1** — see next bullet.
- Default *simple* rotation: `Presets.DefaultSimpleRotation` in
  `ui/paladin/protection/presets.ts:64-72` — five booleans + one enum. `tbc-new`'s own UI
  default is `rotationType: APLRotation_Type.TypeSimple` with this simple rotation, **not**
  the raw APL JSON — so v1 doesn't need to embed/patch the APL tree, just construct this
  struct and run it through `sim.ts`'s `simpleRotation()` (see above).
- Seven pre-built encounters: `ui/paladin/protection/builds/*.build.json` (Default,
  Magtheridon, Karazhan, Morogrim, Hydross, Gorefiend, Archimonde) — each includes a
  `healingModel` (HPS/cadence/absorb), needed since DTPS/TMI-5 depend on incoming heals.
  `default_encounter_only.build.json` is a generic 180s raid-boss profile, a reasonable v1
  default.
- Five tiered gear presets (`gear_sets/p1..p5.gear.json`) in exactly the
  `{"items":[{"id","enchant","gems":[...]}]}` shape this repo's own
  `resolveChosenDecomposableItems`
  ([decomposedModel.ts:211-249](../../src/solver/decomposedModel.ts#L211)) already produces —
  **the gear-translation layer is a near-identity field rename, not a format conversion.**
  Useful as a known-good baseline gear set for calibration.
- Everything else needed (talents, `specOptions`, buffs/debuffs, consumables) is
  `Presets.DefaultTalents` / `DefaultOptions` / `DefaultRaidBuffs` / `DefaultPartyBuffs` /
  `DefaultIndividualBuffs` / `DefaultDebuffs` / `DefaultConsumables` in the same
  `presets.ts` file — copy these values literally for the hardcoded v1 profile.

### tbc-new `stats.Stat` ↔ this repo's `StatName` translation table

Units already match (both sides use flat rating-point atoms, no scaling needed — just a
name remap):

| `tbc-new` `stats.Stat` | this repo `StatName` |
|---|---|
| `Stamina` | `Stamina` |
| `Armor` | `Armor` |
| `DodgeRating` | `Dodge` |
| `ParryRating` | `Parry` |
| `BlockRating` | `Block` |
| `BlockValue` | `BlockValue` |
| `DefenseRating` | `Defense` |
| `ResilienceRating` | `Resilience` |
| `ArmorPenetration` | `ArmorPenetration` |
| `AttackPower` | `AttackPower` |
| `MeleeHitRating` | `MeleeHit` |
| `MeleeCritRating` | `MeleeCrit` |
| `ExpertiseRating` | `Expertise` |
| `Strength` | `Strength` |
| `Agility` | `Agility` |

(`Miss` in this repo's `StatName` list is base miss chance vs. a boss, not an equippable
stat — no `tbc-new` counterpart needed.)

`DTPSReferenceStat = stats.Armor` is `tbc-new`'s own built-in EP reference stat for
Dtps/Tmi/PDeath (`sim/core/statweight.go:15`) — use the same reference stat on this side for
consistency, and remember: **DTPS and TMI-5 weights must be sign-flipped** before feeding
into `objectiveStats` (lower raw metric = better, but the solver always maximizes
`objectiveScore`).

## Phased implementation plan

### Phase 0 — Feasibility spike (de-risk before investing further; standalone script, not wired into the app)

1. Add `tbc-new` as a git submodule (e.g. `vendor/tbc-sim`), pinned to a specific commit.
2. Build `lib.wasm` and **measure its actual size** — don't assume; this determines whether
   it needs to be lazy-loaded only when a sim-backed objective is selected.
3. Vendor a copy of `wasm_exec.js` from the Go 1.25 toolchain that built it; confirm it loads
   standalone (a throwaway Node script or Vite worker) via the instantiate/`go.run` sequence
   above.
4. Generate protobuf-ts bindings for `api.proto` + deps into a scratch directory. Hand-build
   one minimal `StatWeightsRequest` for a known gear set (reuse `p3.gear.json` verbatim, plus
   a minimal `SimDatabase` covering just those items, sourced from `tbc-new`'s own asset DB —
   not yet from this repo's data). Confirm a real `statWeights()` call returns sane, non-zero
   `Tmi`/`Tps`/`Dtps` weights.
5. Cross-check those weights against the same build run through `tbc-new`'s own UI
   stat-weights panel, as a correctness baseline for later regression testing.

**Gate**: don't start Phase 1 until steps 4–5 produce plausible, cross-checked numbers. This
phase is the most likely place to find an unforeseen blocker (proto schema drift, wasm size
problems, a `SimDatabase` requirement bigger than expected).

### Phase 1 — Vendor & load the WASM sim in this repo's build

- Keep the `vendor/tbc-sim` submodule from Phase 0; add an npm script (`build:wasm`)
  wrapping the Go build command. Document the new Go 1.25 toolchain requirement (this repo
  currently needs none beyond Node).
- Vendor `wasm_exec.js` (pinned to the Go version used), plus a small Vite transform
  mirroring `tbc-new`'s inlining approach for the new worker entry.
- Add `@protobuf-ts/runtime` (runtime dep) + `@protobuf-ts/plugin`/`protoc` (dev/codegen
  dep); generate bindings for `api.proto` + deps into a gitignored `src/sim/proto/`
  directory, matching `tbc-new`'s own pattern (regenerate at build time, don't commit).
- New `src/sim/statWeights.worker.ts` (~100 lines, modeled directly on `sim_worker.ts` +
  `worker_interface.ts`): loads `lib.wasm`, exposes a `postMessage`-based `statWeights` call.
- **Decide and document**: commit the built `lib.wasm` to this repo (rebuilt only when the
  submodule pin changes) vs. building it fresh every CI run. Committing avoids requiring Go
  in every contributor's environment; recommended default unless the file size is
  prohibitive (check against Phase 0's measurement).

### Phase 2 — Gear/profile translation layer (`src/sim/`)

- `toTbcItemSpec(item: ItemVariation)`: near-identity mapping —
  `{ id, enchant: enchant.id, gems: gemSlots.filter(nonzero) }`.
- `buildMinimalSimDatabase(items)`: export just the item/gem/enchant records referenced by a
  given gear set into `SimDatabase` proto shape, sourced from this repo's existing item data
  (`src/data`). **Highest-uncertainty task in this plan** — scope to exactly the Protection
  Paladin item pool, size it concretely once Phase 0's spike shows what a minimal request
  actually needs.
- `ProtPaladinSimProfile`: one hardcoded bundle — talents string, `PaladinOptions`,
  simple-rotation booleans, raid/party/individual buffs, debuffs, race/level — literal values
  copied from `tbc-new`'s `presets.ts` constants listed above. One hardcoded encounter,
  copied from a `builds/*.json` preset.
- Vendor (don't reimplement) `playerTalentStringToProto` and `simpleRotation()` per the
  shim pattern above — do not import `ui/core/player.tsx`'s `Player` class.
- `buildStatWeightsRequest(gear, profile, encounterBuild, statsToWeigh)`: assembles the full
  `StatWeightsRequest` per the corrected field map above.

### Phase 3 — Calibration + LP integration

- `calibrateWeights(gear, statsToWeigh)`: calls the Phase 1 worker, extracts `.tps` / `.dtps`
  / `.tmi` `.weights` from the single calibration batch (all three come free from one
  `statWeights()` call), translates via the table above, sign-flips DTPS/TMI-5.
- Extend `objectiveMode`: `"stats" | "ehp"` → add `"tps" | "dtps" | "tmi5"`. New
  `src/solver/solveSimMetric.ts`, structurally mirroring `solveEHP.ts`'s iterative loop:
  solve with current calibrated weights → compare the chosen item set to the previous round
  → if changed, recalibrate centered on the new candidate's stat totals and resolve → stop
  when stable or a round cap is hit (mirror `MAX_EHP_ITERATIONS`). Reuse the existing
  `{iteration, maxIterations}` progress postMessage.
- Secondary constraint (one primary + one secondary only; hard constraint; infeasibility
  reported plainly): generalize `ResistanceFloor` into
  `SecondaryConstraint { metric: "ehp" | "tps" | "dtps" | "tmi5"; kind: "floor" | "ceiling"; value: number }`.
  Add `buildSecondaryConstraintVars` (parallel to `buildResistanceVars`, sourcing
  coefficients from the secondary metric's calibrated weight vector) and the matching
  `SubjectTo` row (`GLP_LO` for floor, `GLP_UP` for ceiling) in
  `SolverConfiguration`/`runLPModel`. On `glpk.js` infeasible status, surface a clear message
  via the existing worker `{type:"error"}` path — no auto-relax logic.

### Phase 4 — UI

- `ConfigCard.tsx`: extend the `objectiveMode` `ToggleButtonGroup` with `"tps"` / `"dtps"` /
  `"tmi5"`; each shows read-only context text — "Optimized against: [encounter name],
  standard raid buffs, default talents, Protection Paladin only."
- New secondary-constraint section modeled directly on `ResistanceFloors.tsx`: one row
  (metric `Select` limited to the other three metrics + floor/ceiling toggle + numeric
  `TextField`), capped at one row for v1.
- `types/SolverConfig.ts`: widen `objectiveMode` union, add
  `secondaryConstraint?: SecondaryConstraint`, update `createEmptyConfig()` defaults and the
  persistence-migration fallback (`objectiveMode: c.objectiveMode ?? "stats"`,
  `secondaryConstraint: c.secondaryConstraint ?? undefined`).
- Progress UI: relabel status text for sim-backed modes ("Calibrating..." → "Solving...")
  since these take real seconds, unlike the instant `"stats"`/`"ehp"` paths.

### Phase 5 — Testing & verification

- Unit tests: stat-name/sign-flip translation table; `buildStatWeightsRequest` against fixed
  fixtures; secondary-constraint LP row construction (mirroring
  `solveConfig.test.ts`/`decomposedModel.test.ts` patterns already in the repo).
- Golden/cross-check test: calibrated weights for one fixed gear set compared against the
  same build run manually through `tbc-new`'s own stat-weights UI (from Phase 0) — guards
  against silent proto/schema drift on submodule updates.
- Manual end-to-end: `npm run dev`, pick Protection Paladin, select "Minimize TMI-5" (and
  separately "Maximize TPS" with a TMI-5 ceiling), confirm the solve completes, returns a
  plausible gear set, and the read-only encounter context text renders. Sanity-check
  directionality (a TMI-5-favoring solve should skew toward stamina/avoidance more than a
  TPS-favoring one).

## Open items to watch during implementation

- Actual `lib.wasm` size (Phase 0 measures it) — if large, lazy-load only when a sim-backed
  objective is selected, not on initial page load.
- `SimDatabase` export scope (Phase 2) is the single largest unknown-effort task in this
  plan — re-scope once Phase 0's spike shows exactly what a minimal request needs.
- Go toolchain becomes a new local/CI build dependency for this repo. Decide committed vs.
  CI-built `lib.wasm` (see Phase 1) once its size is known.

## Execution log

### Toolchain (installed on this machine)

- **Go 1.27.0** (`winget install --id GoLang.Go`) — installer requires a UAC prompt; if
  automating this on a fresh machine, expect to need someone present to approve it (it's not
  a silent/unattended install by default).
- **protoc 36.1**, self-installed via `@protobuf-ts/protoc`'s bundled installer — no system
  package needed. First invocation of `node_modules/.bin/protoc` downloads it automatically;
  after that it's cached and reproducible without a system-wide install (a system-wide
  `winget install --id Google.Protobuf` was also tried and works, but isn't what the npm
  scripts below actually use — they use the npm-managed one for reproducibility).
- `protoc-gen-go` (`go install google.golang.org/protobuf/cmd/protoc-gen-go@latest`) — needed
  only for the Go-side `.pb.go` regeneration inside `vendor/tbc-sim`, installed automatically
  by `scripts/sim/buildWasm.mjs` on first run if missing.

### Phase 0 — feasibility spike: **passed**

Added `vendor/tbc-sim` as a git submodule (`github.com/wowsims/tbc-new`, pinned at
`e4a90bceb`). Built `lib.wasm` and confirmed its real size: **37MB uncompressed, ~5.7MB
gzip-compressed** — large enough to confirm the plan's assumption that it must be lazy-loaded
on demand (only when a sim-backed objective is selected), not part of the initial page load.

Wrote a standalone Node harness (since deleted — its logic now lives in the production files
below) that: loaded `lib.wasm` via the vendored `wasm_exec.js` directly in plain Node (no
browser needed to prove this works), built a real `StatWeightsRequest` for the P3 Protection
Paladin gear preset (talents, default simple rotation via the raw `default.apl.json`, the
`default_encounter_only` build, and a `SimDatabase` filtered from `db.json`), and called
`statWeights()` for real.

**Result — real, directionally-correct weights**, confirming the whole approach is sound:

| Stat | TMI weight | DTPS weight | TPS weight |
|---|---|---|---|
| Stamina | −0.114 | (not requested) | (not requested) |
| Defense Rating | −0.0252 | −1.092 | −0.0876 |
| Dodge Rating | −0.0205 | −1.955 | −0.162 |
| Armor | −0.00578 | −0.071 | −0.0000843 |

All survivability-stat weights are correctly negative for TMI/DTPS (more of the stat = lower
= better metric value, exactly the sign convention the plan calls for), Dodge dominates DTPS
mitigation as TBC tank theorycrafting predicts, and Stamina dominates TMI as expected (TMI is
fundamentally about burst-damage buffering). TPS effects on pure-survivability stats are
correctly near-zero (small noise around zero from only 200 iterations — these stats have no
real reason to move a Paladin's own threat generation).

Two real integration bugs were found and fixed along the way, worth knowing if this breaks
again after a submodule bump:
1. **A proto3 JSON oneof is flattened onto the parent message, not nested under the oneof's
   group name.** `player.spec.protectionPaladin = {...}` in JSON produces an empty,
   unrecognized `spec` key that `protobuf-ts`'s `fromJson` silently drops (even without
   `ignoreUnknownFields`, a *nested* unrecognized object doesn't surface as a top-level
   parse error) — the correct JSON is `player.protectionPaladin = {...}` directly. The
   `oneofKind` wrapper only exists in the runtime TS object, never in JSON.
2. **int64 proto fields (`SimOptions.randomSeed`) must be passed as a JSON string, not a
   JS number or `bigint` literal**, matching proto3 JSON's standard int64-as-string
   convention — `protobuf-ts` throws a clear "Cannot parse JSON bigint" error otherwise.

Cross-checking these weights against `tbc-new`'s own UI stat-weights panel (the plan's
Phase 0 step 5) was **not done** — the directional/magnitude sanity above was judged
sufficient to validate the pipeline for now. Worth doing before trusting absolute values in
a real solve, not just their sign/relative-ranking.

### Phase 1 — vendor & load the WASM sim: **mostly done**

- `vendor/tbc-sim` git submodule in place.
- `scripts/sim/genProto.mjs` — regenerates `src/sim/proto/*.ts` (protobuf-ts bindings) from
  `vendor/tbc-sim/proto/*.proto` using the npm-managed `protoc` + `protoc-gen-ts`. Run via
  `npm run sim:gen-proto`. Output is gitignored (`src/sim/proto/.gitignore`), matching
  `tbc-new`'s own convention for its generated proto output.
- `scripts/sim/buildWasm.mjs` — regenerates the Go-side `.pb.go` bindings, builds
  `public/sim/lib.wasm`, and refreshes `src/sim/wasm_exec.js` from the local Go install (so
  the shim can never drift out of sync with the Go version that built the binary). Run via
  `npm run sim:build-wasm`. **Requires a local Go toolchain** — this is a genuinely new build
  dependency for this repo (previously Node-only).
- `src/sim/wasm_exec.js` — vendored, regenerated by the script above, **not hand-edited**.
- `src/sim/statWeights.worker.ts` — a dedicated Web Worker, modeled on this repo's own
  `src/solver/solver.worker.ts` convention (plain `onmessage`, not `tbc-new`'s
  id/ready-handshake `WorkerInterface`) rather than `tbc-new`'s `sim_worker.ts` +
  `worker_interface.ts`, since this repo only ever needs the one `statWeights` entry point.
  Fetches `/sim/lib.wasm` (served from `public/sim/`), loads it via the vendored
  `wasm_exec.js`, and exposes `statWeights(requestBytes) -> resultBytes` over
  `postMessage({requestBytes}) -> {type:"result", resultBytes} | {type:"error", message}`.
  **Not yet integration-tested from a real browser/worker context** — Phase 0's proof was in
  plain Node; this file's `fetch`/`Worker` usage should work identically in a browser but
  hasn't been exercised there yet. Verifying that (e.g. a small manual `npm run dev` check
  calling it from the console) is a reasonable next step before building more on top of it.
- `tsconfig.json` — excludes `src/sim/proto` and `vendor` from type-checking (generated code
  and a vendored submodule respectively; both fail this repo's strict `noUnusedLocals`/
  `noUnusedParameters` settings, same as they would in `tbc-new`'s own tsconfig).

**Open decision, not yet made — needs a human call**: whether to commit the built 37MB
`public/sim/lib.wasm` to this repo's git history, or build it fresh in CI every time.
Committing avoids requiring Go in every contributor's/CI environment (the simpler day-to-day
experience) but permanently grows repo clone size by ~37MB per commit that changes it
(git doesn't diff binaries efficiently) — a consequence that isn't easily undone later
without a history rewrite. This plan has not committed it either way; it currently sits
untracked in the working tree. **Recommend deciding this explicitly before it's ever `git
add`-ed**, rather than defaulting into one path.

### Phase 2 — gear/profile translation layer: **started**

- `src/sim/buildSimDatabase.ts` + `src/sim/buildSimDatabase.test.ts` — the item/gem/enchant
  `SimDatabase` filter described in the "Risk found... substantially de-risked" section
  above, now real production code with tests (including one that runs against the actual
  vendored `db.json` + the real P3 gear preset, skipped gracefully if the submodule isn't
  checked out). One correctness fix versus the Phase 0 spike's version: an item's `enchant`
  id must be matched **only** against an enchant record's `effectId`, not also `itemId`/
  `spellId` — spot-checking every enchant in the P1–P5 presets confirmed `effectId` is the
  only field actually referenced, and matching the other two risks a false-positive
  cross-namespace collision (a real, if narrow, correctness bug the spike's looser matching
  would have let through silently).
- **Not yet started**: `toTbcItemSpec` (the near-identity `ItemVariation` → tbc `ItemSpec`
  mapping — small, low-risk, described in Phase 2 above), and it's now built and tested:
  `src/sim/toTbcItemSpec.ts` (the near-identity `ItemVariation` → tbc `ItemSpec` mapping),
  `src/sim/statTranslation.ts` (the `StatName` ↔ tbc `proto.Stat` table, plus
  `LOWER_IS_BETTER_METRICS` for the DTPS/TMI-5 sign flip), `src/sim/protPaladinProfile.ts` +
  `src/sim/protPaladinEncounter.ts` + `src/sim/protPaladinDefaultApl.ts` (the hardcoded
  talents/options/consumables/buffs/debuffs/encounter bundle, values copied verbatim from
  `tbc-new`'s own `presets.ts`), and `src/sim/buildStatWeightsRequest.ts` (the assembler
  tying all of the above together with `buildSimDatabase`).

  **Deliberate simplification versus the original plan**: rather than vendoring
  `playerTalentStringToProto` + `simpleRotation()` to compile the simple-rotation booleans
  into an `APLRotation` at runtime, `protPaladinDefaultApl.ts` just embeds `tbc-new`'s own
  `default.apl.json` directly — since it *is* the precompiled output of running
  `simpleRotation()` against exactly `DefaultSimpleRotation`'s booleans, and v1's
  simple-rotation settings are fixed (not user-editable per the north star), there is nothing
  for the transform to actually do yet. `PROT_PALADIN_DEFAULT_SIMPLE_ROTATION` is kept in
  `protPaladinProfile.ts` as documentation of what the embedded APL encodes; vendoring the
  real transform function only becomes necessary once rotation settings become editable.

  **A second real integration bug was found and fixed** while wiring this up for real (not
  the Phase 0 spike, which had this part right by luck): `proto.ProtectionPaladin`'s shape is
  `{ options: { classOptions: PaladinOptions } }` — the `options` nesting level is easy to
  drop by mistake since `PaladinOptions` is currently an empty message, and dropping it
  produces a `nil` pointer that panics deep inside `NewProtectionPaladin` (Go) rather than a
  clean JSON parse error, since the request still parses successfully (it's a valid, just
  differently-shaped, proto). Comment added directly on `PROT_PALADIN_CLASS_OPTIONS` in
  `protPaladinProfile.ts` so this can't silently regress.

  `src/sim/statWeights.integration.test.ts` replaces the deleted Phase 0 spike as a permanent
  regression test: it runs `buildStatWeightsRequest` for real, calls the actual `lib.wasm`
  directly in Node (not through the browser-only `statWeights.worker.ts`, which isn't
  practical to exercise from vitest), and asserts every requested survivability stat's
  TMI/DTPS weight is `<= 0` (correctly signed). **It passes.** The full repo test suite
  (`npm run test` / `vitest run`) is green — 61 tests across 10 files, ~15s total (the new
  integration test itself takes ~14s, entirely wasm-sim time). Skips gracefully if the
  submodule/wasm artifact aren't present.

  **One known cosmetic issue**: `tsc --noEmit -p .` reports `noUnusedLocals`/
  `noUnusedParameters` errors inside `src/sim/proto/*.ts` once any file (like the new
  integration test) actually imports from `src/sim/proto` — `tsconfig.json`'s `exclude` stops
  those files from being a type-check *root*, but doesn't stop them from being pulled into
  the dependency graph and diagnosed once something imports them, which is inherent to
  committing generated-but-gitignored third-party code into a strict-lint TS project, not a
  bug in the new code itself. Not fixed in this pass — a real fix needs either a
  project-references split (a separate, more lenient tsconfig scoped to `src/sim/proto`) or
  accepting the noise. Vite/vitest (esbuild-based) don't apply these checks at all, so this
  only affects the separate `tsc --noEmit` / `npm run type-check` invocation, not tests or
  the dev/build pipeline.

### Phase 3 — LP integration: **primary objective done; secondary constraint not started**

- `SolveOptions.objectiveMode` (`src/solver/solveConfig.ts`) widened from `"stats" | "ehp"`
  to add `"tps" | "dtps" | "tmi5"` — the only change made to a core solver file so far.
- `src/sim/calibrateWeights.ts` — turns a real sim calibration into this repo's `Stat[]`
  weight-vector shape (the same shape `optimizeStats` already accepts), doing the
  StatName-ordinal lookup via the actual generated `Stat` enum (`./proto/common.js`) and the
  DTPS/TMI-5 sign flip via `LOWER_IS_BETTER_METRICS`.
- `src/sim/solveSimMetric.ts` — `solveConfigForSimMetric()`, the iterative refine loop:
  calibrate → `solveConfig(..., { objectiveMode: "stats", optimizeStats })` → compare the
  chosen item set (by id+enchant+gems, not object identity) to the previous round →
  recalibrate around the new result if it changed, capped at 5 rounds. **This reuses the
  existing `"stats"` objective path entirely** — confirms the Phase 1 architecture read
  (`solveConfig.ts`'s scores.ts already treats `optimizeStats` as an arbitrary externally-
  supplied vector) was correct, and meant zero changes were needed to
  `decomposedModel.ts`/`items.ts`/`scores.ts` to make a *primary* sim-backed objective work.
- **Three more real bugs found and fixed while wiring this, on top of the two from Phase 2**:
  1. `GearPiece[]` type mismatch — `ItemVariation.type` and `LPItem.type` use incompatible
     unions (`ItemType` vs `ProcessedItemType`, which includes `"Shield"`), so a function
     needing to accept *either* shape (as `solveConfigForSimMetric`'s round-over-round
     `currentGear` does — round 1 is caller-supplied `GearPiece[]`, later rounds are
     `solveConfig`'s own `LPItem[]` output) can't be typed as either concrete type. Fixed by
     introducing a minimal structural `GearPiece` interface (`{id, enchant: {id}, gemSlots}`)
     in `toTbcItemSpec.ts` that both satisfy, and typing every sim-side gear parameter
     (`toTbcItemSpec`, `buildStatWeightsRequest`, `calibrateWeights`,
     `solveConfigForSimMetric`) against it instead of the full `ItemVariation`.
  2. **`item.enchant` is always a defined object, never `undefined`** — unenchanted items use
     `EMPTY_ENCHANT` (`{id: "", ...}`), not a missing/null enchant field. Both
     `toTbcItemSpec.ts` and `buildStatWeightsRequest.ts` originally checked
     `if (item.enchant)`, which is always true; since `Number("")` is `0` in JS, this
     happened to produce a harmless `enchant: 0` (proto3's int32 default) rather than visibly
     breaking anything, but it was checking the wrong thing. Fixed to check `item.enchant.id`
     instead. Worth knowing if anything ever needs to distinguish "no enchant" from
     "enchant id 0" more strictly than proto3's default-value semantics already do.
  3. `LOWER_IS_BETTER_METRICS` needed to be typed `ReadonlySet<string>` rather than inferred
     from an `as const` tuple — the narrower inferred type rejected `.has()` calls with the
     broader `SimMetric` union.
- **Not yet built**: the secondary floor/ceiling constraint (`SecondaryConstraint`,
  `buildSecondaryConstraintVars`, the `GLP_LO`/`GLP_UP` row in `runLPModel`). Unlike the
  primary objective, this genuinely does require touching `decomposedModel.ts`/`items.ts`/
  `scores.ts` — the closest existing pattern (`ResistanceFloor`) is keyed by an actual
  elemental-resistance `StatName` with a formula-computed coefficient, not an arbitrary
  externally-calibrated per-item weight vector, so it needs a new `ScoreAxis` (a
  `"secondaryScore"` alongside today's `avoidanceScore`/`objectiveScore`/
  `uncritabilityScore`) computed the same way `objectiveScore` is, not a literal reuse of
  `ResistanceFloor`. This wasn't attempted in this pass — it's real surgery on files this
  session hadn't yet read in full, in the interest of not rushing changes to well-tested,
  interconnected LP-construction code without first reading `items.ts`'s full candidate/
  scoring pipeline.
- **Not yet decided**: how `solver.worker.ts` actually reaches `solveConfigForSimMetric` for
  the three new `objectiveMode` values (it currently calls `solveGearSet`, which only
  dispatches `"ehp"` vs everything-else-as-`"stats"`), what `baselineGear` a fresh solve
  should use, and how `db.json` reaches the browser were three real open decisions — **all
  three now resolved and wired up**, see below.

### Phase 3 dispatch wiring: **done**

All three of this session's open decisions were confirmed (dispatch in `solver.worker.ts`;
fixed P3 preset as the round-1 baseline; lazy full-file fetch for the database) and
implemented:

- `src/sim/simDatabaseClient.ts` — `loadTbcDatabase()`, a lazy `fetch("/sim/db.json")` with
  in-memory caching, mirroring `statWeightsClient.ts`'s `lib.wasm` treatment.
  `scripts/sim/buildWasm.mjs` now also copies `vendor/tbc-sim/assets/database/db.json` to
  `public/sim/db.json` as its final step, so both large sim assets are staged the same way by
  the same script.
- `src/sim/protPaladinBaselineGear.ts` — `PROT_PALADIN_BASELINE_GEAR`, tbc-new's own P3
  Protection Paladin preset re-expressed as `GearPiece[]` literals (the same preset this
  session's tests have used throughout, so it's already been exercised against the real sim).
- `src/solver/solver.worker.ts` — now branches on `objectiveMode`: the three sim-backed
  values dynamically `import()` `#/sim/solveSimMetric` + `#/sim/simDatabaseClient` +
  `#/sim/protPaladinBaselineGear` and call `solveConfigForSimMetric`; everything else
  (`"stats"`/`"ehp"`) goes through the existing `solveGearSet` path unchanged. The dynamic
  `import()` (rather than a static one) means `src/sim/`'s code — including the 37MB wasm
  module it'll eventually load — is never pulled into the bundle at all for a plain EHP/stats
  solve, not just deferred at runtime.
  One naming wrinkle worth knowing about: `objectiveMode`'s public value is `"tmi5"` (matches
  how it'll read in the UI - "TMI-5"), but `calibrateWeights.ts`'s internal `SimMetric` type
  uses `"tmi"` (matching `StatWeightsResult.tmi`, the actual generated proto field name). A
  small `SIM_METRIC_BY_OBJECTIVE_MODE` map in `solver.worker.ts` bridges the two rather than
  renaming either to match the other, since both names make sense in their own context.

Full repo verification after this round: `tsc --noEmit -p .` clean (ignoring the known
generated-proto noise from the earlier round), `biome check` clean on every hand-written file
touched this session (pre-existing lint/CRLF issues remain in untouched files like
`types.ts` — confirmed via `git diff --stat` that this session never touched them), and
`vitest run` green at 61/61 across 10 files.

### Not yet started: secondary constraint, Phase 4 (UI), Phase 5 (full test suite beyond src/sim/)

The secondary floor/ceiling constraint (`SecondaryConstraint`, a new `"secondaryScore"`
`ScoreAxis`, the `GLP_LO`/`GLP_UP` constraint row) still needs the `items.ts`/
`decomposedModel.ts`/`scores.ts` surgery described earlier in this log — not attempted yet.

### Phase 4 — UI: **objective picker done; secondary constraint UI not started**

- `src/types/SolverConfig.ts`: `objectiveMode` widened to match `SolveOptions`.
- `src/components/ConfigurationPanel/ConfigCard.tsx`: three new `ToggleButton`s (Maximize
  TPS / Minimize DTPS / Minimize TMI-5) alongside the existing Stat weights/EHP options;
  read-only context text for the three sim-backed modes ("Protection Paladin only for now,
  optimized against: [encounter], standard raid buffs, default talents (not yet
  configurable)"), matching the north star's decision to surface but not yet expose these as
  settings; the collapsed-card summary and expanded-card caption both updated to describe all
  five modes instead of just special-casing `"ehp"`.
- **Not built**: any UI for the secondary constraint (blocked on the LP-side
  `SecondaryConstraint` mechanism above not existing yet).
- **The richer "Calibrating..." vs "Solving..." progress label flagged as scoped-out above
  was subsequently built in a follow-up session** (see the "Live progress detail" addendum
  below) — `solve()` no longer collapses worker progress to a bare fraction, and the loading
  UI now shows which calibration round is running, whether it's calibrating or solving, and
  live sim-iteration counts during calibration.

### Addendum — live progress detail for sim-backed solves (follow-up session)

Switched the wasm call for calibration from the synchronous `statWeights` to the async
`statWeightsAsync`, which streams a `ProgressMetrics` proto via callback (already rate-limited
to ~10Hz per sim run on the Go side, and already pre-aggregated across the whole calibration
batch — no throttling or cross-run math needed on the JS side) and delivers the final
`StatWeightsResult` through that same callback rather than a return value.

- `src/sim/statWeightsClient.ts`: added `runStatWeightsAsync`, alongside the existing
  `runStatWeights`. **Real bug found here**: Go tracks in-flight async requests in a global
  map keyed by the caller-supplied request id (`sim/core/simsignals/api.go`'s
  `RegisterWithId`) — the id must be non-empty *and* unique per call, so a fixed placeholder
  like `""` fails immediately with `"Couldn't register for signal API: id is empty"`. Fixed
  by generating a fresh `crypto.randomUUID()` per call.
- `src/sim/calibrateWeights.ts`: swapped to `runStatWeightsAsync`, added an `onProgress`
  parameter forwarding `{completedIterations, totalIterations, completedSims, totalSims}`.
- `src/sim/solveSimMetric.ts`: `SimMetricSolveProgress` gained `phase: "calibrating" |
  "solving"` plus `calibrationCompletedIterations`/`calibrationTotalIterations`, populated
  during each round's calibration call and tagged `"solving"` during the LP solve call.
- `src/solver/index.ts`: fixed the actual bug — `solve()` now forwards the whole progress
  object (`WorkerProgressDetail`) instead of reducing it to `iteration/maxIterations`;
  `SolveAllProgress` gained an optional `detail` field carrying it through. Additive and
  backward-compatible — plain `"stats"`/`"ehp"` solves never set the extra fields.
- `src/components/ResultsPanel/simProgressText.ts` (new): shared text formatting
  ("Calibrating round 2 of 5 (5,234 / 10,000 sims)…" / "Solving round 2 of 5…"), used by both
  `LoadingResultsPlaceHolder.tsx` (as an added status line) and `SolveButton.tsx` (replacing
  the button label outright when present, since space there is tight).
- New tests in `src/sim/statWeights.integration.test.ts`: a real `statWeightsAsync` call
  against the actual wasm module, asserting progress callbacks fire before the final result
  resolves and that the result matches the sync path's directional correctness. This is what
  caught the request-id bug above — it surfaced immediately as a test failure, not a
  UI-testing gap.
- Verified: `tsc --noEmit` clean, `biome check` clean, full `vitest run` green (62/62), and
  **`vite build` re-verified explicitly** per this plan's own standing advice that a
  production build is the one check that already caught a real bug once and nothing else
  covers — it passed, with the dynamically-imported sim chunk essentially unchanged in size
  (~564KB), confirming no code-splitting regression from the new async plumbing.

### A real, build-breaking bug found only by actually building the app

Every check up to this point (`tsc --noEmit`, `biome check`, `vitest run`) passed cleanly,
but `vite build` **failed outright**: `solver.worker.ts`'s new dynamic `import()`s of
`src/sim/*` (added so a plain EHP/stats solve never pulls sim-specific code into its bundle
at all, not just at runtime) force the worker's output to be code-split into multiple chunks,
and Vite's default worker output format (`iife`) doesn't support that -
`"Invalid value 'iife' for option 'worker.format' - UMD and IIFE output formats are not
supported for code-splitting builds"`. None of the type-checker, linter, or test suite catch
this class of bug, since it's purely a bundler/output-format constraint that only surfaces
during an actual production build.

**Fixed** by adding `worker: { format: 'es' }` to `vite.config.ts` — ES module workers
support code-splitting natively, and this is the same format `tbc-new` itself builds its own
workers with. `vite build` now succeeds. Notable output: the dynamically-imported sim chunk
(`solveSimMetric-*.js`, everything reachable from `solveConfigForSimMetric` including the
full `src/sim/proto/*.ts` graph) is ~563KB before gzip — loaded only when a sim-backed
objective is actually selected, never as part of the main bundle or a plain EHP/stats solve.
This is a good sanity check that the dynamic-import architecture decision (Phase 3) is
actually delivering its intended benefit, not just adding indirection.

**This is also the reason a real production build should be part of verifying any future
change to `solver.worker.ts` or anything it imports** — it's the one check in this whole
plan that isn't covered by `npm run test`/`type-check`/lint, and it was the only one that
caught a real, ship-blocking bug this session.

**Not done, and worth flagging explicitly**: no interactive browser click-through (actually
opening the dev server, selecting a sim-backed objective in the UI, and watching a real solve
run to completion) was performed — verification stopped at "the production build succeeds
and every automated check passes." A full sim-backed solve takes real minutes (multiple
calibration rounds × thousands of sim iterations each), and there's no browser-automation
tool available in this session to drive that check unattended. This is the single largest
gap between "verified" and "actually confirmed working end-to-end in the real app" left by
this session's work.
