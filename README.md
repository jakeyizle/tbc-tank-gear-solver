# wow-tank-gear-solver

A gear optimization tool for Protection Paladin tanks in World of Warcraft: The Burning Crusade (TBC). Players paste their gear pool, configure talents/buffs/constraints per gear set, and the solver selects the optimal item+enchant+gem combination using Linear Programming.

This is an unofficial fan-made tool, not affiliated with or endorsed by Blizzard Entertainment. Licensed under [GPL-3.0-or-later](LICENSE) (required by the `glpk.js` solver dependency) — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for dependency and game-data attributions.

## Quick Start

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
npm run test
npm run check    # Biome lint + format
```

---

## Tech Stack

| Concern | Library |
|---|---|
| Framework | React 19 + Vite (client-side SPA, no SSR) |
| Routing | TanStack Router (file-based, `src/routes/`) |
| UI | MUI v7 (preferred). Tailwind CSS v4 is present but largely leftover from the initial project template — prefer MUI components. |
| LP Solver | `glpk.js` (GLPK compiled to WASM) |
| Linting/Formatting | Biome (not ESLint/Prettier) |
| Testing | Vitest + jsdom |
| Path alias | `#/` → `src/` (also `@/` → `src/`) |

The LP solver runs inside a **Web Worker** (`src/solver/solver.worker.ts`) to avoid blocking the UI thread.

---

## Project Structure

```
src/
  data/           Static game data (items, enchants, gems, base stats, buffs, talents, abilities)
  solver/         Core LP pipeline (item generation, scoring, GLPK interface, Web Worker)
  helpers/        Stat calculation and conversion utilities
  types/          UI-facing TypeScript interfaces (SolverConfig, SolveResult)
  components/     React UI components
  contexts/       React contexts
  hooks/          Custom React hooks
  routes/         TanStack Router file-based routes
```

Tests are colocated next to the code they cover (`*.test.ts` beside the module), not in a separate `tests/` directory — e.g. `src/data/baseStats.test.ts`, `src/solver/avoidance.test.ts`, `src/helpers/stats.test.ts`.

---

## Domain Overview

### The Goal

Tanks must be **Uncrushable** (combined avoidance at or above a threshold) and/or **Uncrit-immune** (enough Defense/Resilience that enemies cannot critically strike), while maximizing threat stats (e.g. Spell Power, Spell Hit, Stamina). Different gear sets may be needed for different content (heroics vs. raids), hence multiple configs.

### Constraints

- **Uncrushable**: `Dodge% + Parry% + Block% + Miss% >= 102.4%`. Hard floor — gear must reach it.
- **Illidan Shear**: `Dodge% + Parry% + Block% >= 101.8%` (Miss does not count). Mutually exclusive alternative to Uncrushable.
- **Uncritability**:
  - `setting=1` → 5.4% required (Level 72 mobs / heroic dungeons)
  - `setting=2` → 5.6% required (Level 73 mobs / raid bosses)
  - Achieved via Defense Rating and/or Resilience. Each defense *skill point* contributes 0.04% crit reduction.
- **Resistance Floors**: optional per-stat minimums (e.g. a Fire Resistance floor for a specific encounter), configured per gear set and enforced as additional LP constraints alongside avoidance/uncrit.

### Stats: Ratings vs. Percentages

All stats are stored and summed as **ratings** (raw values from item tooltips). Conversion to percentages only happens at display time or when computing avoidance targets. Key conversion rates (TBC level 70):

| Stat | Rating → % |
|---|---|
| Dodge | ÷ 18.9231 |
| Parry | ÷ 23.6538 |
| Block | ÷ 7.8846 |
| Defense | ÷ 2.3654 → defense skill points |
| Resilience | ÷ 39.4231 |
| Spell Hit | ÷ 12.6 |
| Spell Crit | ÷ 22.1 |
| Armor | `armor / (armor + 10557.5)` (assumes level 73 attacker) |

### Derived Stats (not stored on items)

- **Defense skill → avoidance**: Each skill point adds 0.04% to each of Dodge, Parry, Block, and Miss (0.16% total avoidance per skill point).
- **Agility → Dodge**: 25 Agility = 1% dodge (Paladin).
- **Agility → Armor**: 1 Agility = 2 Armor.
- **Stamina → Health**: First 20 Stamina = 1 HP each; remaining = 10 HP each (accurate formula used for `TotalHealth`; simplified `Stamina × 10` used for the `Health` display stat).
- **Intellect → Mana**: 1 Intellect = 15 Mana.

### Flat vs. Multiplier Stats

`Stat.type` is either `"flat"` or `"multiplier"`. The combined calculation is:

```
total = (sum of all flat values) × product(1 + each multiplier value)
```

Examples: Kings (`Stamina +10%`) → `{ value: 0.1, type: "multiplier" }`. Toughness talent (`Armor +2%/rank`) is a multiplier. Most gear stats are flat.

**Multiplier modifier sources** (buffs/talents) are applied when scoring items — they scale what gear contributes.  
**Flat modifier sources** are applied to base stats — they reduce how much gear needs to contribute to hit constraint targets.

---

## Multiple Gear Sets

Each gear-set tab is solved independently but sequentially. After a config solves, its selected items are locked to their chosen enchant and gems before the next config solves — so later configs can't re-gem or re-enchant an item a prior config already claimed. This mirrors real-world cost: once an item is enchanted, every set has to use it as-is.

For the actual solving mechanics (how gear/enchants/gems get modeled as an LP problem, the EHP objective mode, avoidance/uncrit convergence), read `src/solver/` directly — it's commented at the points that need it (start with `solveConfig.ts` and `items.ts`) and is a better source of truth than a description here, which will drift as the solver evolves.

---

## Data Files (`src/data/`)

| File | Contents |
|---|---|
| `items.json` | All equippable items with stats, sockets, socketBonus, type, handType, weaponType |
| `enchants.json` | Enchants with stats, applicable item type, optional `enchantType` (`"Shield"` or `"TwoHand"`) |
| `gems.json` | Gems with color, phase, stats, optional `isUnique` flag |
| `level_stats.json` | Base stats (Str/Agi/Sta/Int/Spi/Health/Mana) per race+class combo |
| `item-tooltips.json` | Maps item ID → icon name, used to display item icons (fetched from `wow.zamimg.com`) |
| `buffs.ts` | Raid/party buffs as `ModifierSource[]` |
| `talents.ts` | Paladin tank talents (Toughness, Anticipation, Sacred Duty, Combat Expertise, Deflection) |
| `abilities.ts` | Class abilities always active (Holy Shield: +30% Block for Paladins) |
| `consumables.ts` | Flasks, elixirs (battle/guardian), and food as `ConsumableItem[]` |

Item and enchant lookups are by string ID. Enchants can be found by either `id` or `effectID` (both exist due to WowSims export format variations).

`itemOverride.ts` hard-codes stat overrides for items whose in-game effect cannot be represented as a static stat (e.g. Paladin librams with conditional/proc effects). Applied immediately after item fetch.

---

## Item Input Formats

The gear pool textarea accepts two formats:

**WowSims Exporter addon JSON:**
```json
{"items":[{"id":28825,"enchant":2673,"gems":[24033]}]}
```
Also handles the nested `{"gear":{"items":[...]}}` variant.

**Comma-separated item IDs** (no enchants/gems):
```
28825, 29011, 28749
```

The item input text is persisted to `localStorage`. All other UI state resets on page reload.

---

## Scope

Only Paladin (classId `"2"`) is supported, for the four TBC-valid races: Human, Dwarf, Draenei, and Blood Elf. Other classes/races have no data. This is a deliberate scope limit, not a bug — see TODO.md for what it would take to extend it.

For open bugs, gaps, and cleanup work, see [TODO.md](TODO.md) rather than this file — that's the doc that's meant to track things that need doing, so it's the one to check (and update) as work happens.

---

## Conventions

- **MUI is the UI library of choice.** New components should use MUI. Tailwind may appear in older code but should not be added to new work.
- **Path alias `#/`** is used throughout for imports from `src/`. Prefer this over relative paths.
- **Stat values in data files are always ratings**, never percentages.
- **Class IDs**: Paladin = `"2"`. **Race IDs**: Human = `"1"`. These are strings, not numbers.
- **Biome** handles both linting and formatting. Run `npm run check` before committing.

