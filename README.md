# wow-tank-gear-solver

A gear optimization tool for Protection Paladin tanks in World of Warcraft: The Burning Crusade.
Players paste their gear pool, set constraints per gear set, and a Linear Program picks the
optimal item + enchant + gem combination.

Unofficial fan-made tool, not affiliated with Blizzard. Licensed under
[GPL-3.0-or-later](LICENSE) (required by `glpk.js`) — see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attributions.

## Quick start

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # required gate for solver.worker.ts changes - see docs/testing.md
npm run check    # Biome lint + format
npm test
```

Testing and verification commands: [docs/testing.md](docs/testing.md).

## Tech stack

| Concern | Library |
|---|---|
| Framework | React 19 + Vite (client-side SPA, no SSR) |
| Routing | TanStack Router (file-based, `src/routes/`) |
| UI | MUI v7. Tailwind v4 is leftover template; prefer MUI for new work. |
| LP solver | `glpk.js` (GLPK compiled to wasm) |
| Game math | the vendored WoWSims TBC sim, compiled to wasm |
| Lint/format | Biome (not ESLint/Prettier) |
| Testing | Vitest + jsdom |
| Path alias | `#/` → `src/` |

## Architecture

**The vendored sim is the single source of truth for game math.** The app does not model stats,
buffs, talents or avoidance itself — it calls the sim's `computeStats` and derives a linear stat
model from measured deltas. Read
[docs/architecture/sim-integration.md](docs/architecture/sim-integration.md) before touching
anything in `src/sim/` or `src/solver/`; the traps there are not guessable.

```
src/
  data/        Game data adapters (db.json -> app types), talent strings, mechanics constants
  sim/         Everything that talks to the sim wasm: profile, proto requests, stat model
  solver/      LP pipeline (candidate generation, scoring, GLPK, Worker) + the solver Worker
  types/       Shared interfaces. May not import src/sim or src/solver.
  helpers/     Parsing, persistence, formatting
  components/ contexts/ hooks/ routes/   React UI
```

Item, gem and enchant data is read from the sim's own `db.json` at runtime;
`src/data/itemSupplement.ts` adds the ~30 records it lacks. `src/data/consumables.ts` is the only
hand-written game data left (db.json carries no consumable icons) and is drift-tested against
db.json.

Tests are colocated (`*.test.ts` beside the module).

## Domain

Tanks must be **uncrushable** (`Dodge + Parry + Block + Miss >= 102.4%`) and/or **uncrit-immune**
(5.4% vs level 72, 5.6% vs level 73), while maximizing threat or survivability stats. Different
content needs different sets, hence multiple configs. `src/data/mechanics.ts` holds the constants,
each linked to the Go line it came from.

Optional per-config resistance floors become extra LP constraints.

**Multiple gear sets solve sequentially, not independently.** After a config solves, its items are
locked with their chosen gems and enchant before the next config runs — an item is one physical
object, and config order is a priority order. A later config scoring below its standalone optimum
is expected, not a bug.

For solving mechanics (EHP mode, avoidance convergence, the decomposed LP), read `src/solver/`
directly — start with `solveConfig.ts` and `items.ts`.

## Item input

The gear pool textarea accepts WowSims Exporter JSON
(`{"items":[{"id":28825,"enchant":2673,"gems":[24033]}]}`, and the nested `{"gear":{...}}`
variant) or bare comma-separated item ids. Item input persists to `localStorage`.

## Scope

Paladin only (classId `"2"`), for the four TBC-valid races. A deliberate limit: the constraint
math in `SolverConfiguration.ts` is Paladin-specific. See [TODO.md](TODO.md).

## Conventions

- MUI for new components; `#/` imports over relative paths.
- Stat values are **ratings**, never percentages.
- Class and race ids are strings (`"2"` = Paladin).
- `src/solver/` may not import `src/sim/` — enforced by a Biome rule, with `index.ts` and the
  Worker exempt. See the boundary section of the architecture doc.
- Run `npm run check` before committing.
