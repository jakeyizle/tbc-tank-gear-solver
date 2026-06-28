# wow-tank-gear-solver

A gear optimization tool for Protection Paladin tanks in World of Warcraft: The Burning Crusade (TBC). Players paste their gear pool, configure talents/buffs/constraints per gear set, and the solver selects the optimal item+enchant+gem combination using Linear Programming.

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
| Framework | React 19 + TanStack Start (Vite-based SSR/SPA) |
| Routing | TanStack Router (file-based, `src/routes/`) |
| UI | MUI v7 (preferred). Tailwind CSS v4 is present but largely leftover from the initial project template — prefer MUI components. |
| LP Solver | `glpk.js` (GLPK compiled to WASM) |
| Linting/Formatting | Biome (not ESLint/Prettier) |
| Testing | Vitest + jsdom |
| Path alias | `#/` → `src/` (also `@/` → `src/`) |

The LP solver runs inside a **Web Worker** (`src/solver/solver.worker.ts`) to avoid blocking the UI thread. The main thread posts `lpItems + targets` to the worker and receives chosen items back.

---

## Project Structure

```
src/
  data/           Static game data (items, enchants, gems, base stats, buffs, talents, abilities)
  solver/         Core LP pipeline (item generation, scoring, GLPK interface, Web Worker)
  helpers/     Stat calculation and conversion utilities (note: folder named with .ts extension)
  types/          UI-facing TypeScript interfaces (SolverConfig, SolveResult)
  components/     React UI components
  contexts/       React contexts
  hooks/          Custom React hooks
  routes/         TanStack Router file-based routes
tests/
  integration.test.ts   End-to-end solver test
```


---

## Domain Overview

### The Goal

Tanks must be **Uncrushable** (combined avoidance at or above a threshold) and/or **Uncrit-immune** (enough Defense/Resilience that enemies cannot critically strike), while maximizing threat stats (e.g. Spell Power, Spell Hit, Stamina). Different gear sets may be needed for different content (heroics vs. raids), hence multiple configs.

### Constraints

- **Uncrushable**: `Dodge% + Parry% + Block% + Miss% >= 102.4%`. Hard floor — gear must reach it.
- **Uncritability**:
  - `setting=1` → 5.4% required (Level 72 mobs / heroic dungeons)
  - `setting=2` → 5.6% required (Level 73 mobs / raid bosses)
  - Achieved via Defense Rating and/or Resilience. Each defense *skill point* contributes 0.04% crit reduction.

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

## Solver Pipeline

```
User input (item IDs / WowSims JSON)
  → parseItemInput()            [helpers/parseItemInput.ts]
  → InputItem[]

InputItem[] + SolveOptions
  → new SolverConfiguration()   [solver/SolverConfiguration.ts]
    - Merges talents + buffs + abilities into flatModifierSources / multiplierModifierSources
    - Calculates baseAvoidance and avoidanceTarget (102.4 - baseAvoidance)
    - Calculates baseUncritability and uncritabilityTarget (5.4 or 5.6 - baseUncritability)

  → getTransformedItems()       [solver/items.ts]
    - Looks up each item from items.json, applies itemOverride()
    - Generates every valid enchant × gem combination (ItemVariation[])
      - Locked items (already enchanted/gemmed) skip variation generation
      - Only phase-1, non-unique gems considered
      - Meta sockets handled separately from colored sockets
      - Socket bonus scored only if gem colors satisfy socket requirements
    - Scores each variation → LPItem (avoidanceScore, uncritabilityScore, objectiveScore)

  → solver.worker.ts (GLPK MIP)
    - Binary variable per LPItem (1 = selected, 0 = not)
    - Constraints: exactly 1 item per slot (2 for Finger/Trinket), max 1 per base item ID
    - Optional: sum(avoidanceScore) >= avoidanceTarget
    - Optional: sum(uncritabilityScore) >= uncritabilityTarget
    - Objective: maximize sum(objectiveScore)
    - Fallback if no optimal solution found: maximize avoidanceScore instead

  → Validation loop             [solver/index.ts]
    - Defense rating is floored to integer skill in-game; LP uses fractional values
    - Max possible error: 0.16% avoidance (1 defense skill × 4 stats × 0.04%)
    - After each solve, recalculates avoidance accurately; if target not met, steps target
      up by 0.08% and resolves
```

### Multi-Config Solve (`solveAll`)

Configs are solved sequentially. After each solve, selected items are locked with their chosen enchant and gem IDs. Subsequent configs only see those exact item+enchant+gem combinations — the LP cannot re-gem or re-enchant them. This reflects real-world cost: once an item is enchanted, future sets must use it as-is.

---

## Key Types

### Two things both named `SolverConfiguration` — they are different

| | Location | Purpose |
|---|---|---|
| `class SolverConfiguration` | `src/solver/SolverConfiguration.ts` | Internal solver object. Holds derived targets, separated modifier sources. Used by LP pipeline. |
| `interface SolverConfiguration` | `src/types/SolverConfig.ts` | UI-facing data shape in React state. Holds raw user settings (constraints, buffs, optimizeStats). |

Import path disambiguates which is which. The naming collision is a known issue.

### `SolveConfigContext`

Stores class/race/talents/abilities after a solve completes. Currently populated but not actively consumed — `StatsSummary` receives `baseConfig` and `solverConfig` as direct props from `SolveResult`, not from this context. Likely intended for future use (e.g. re-calculating stats without re-solving).

### Item type chain

| Type | Description |
|---|---|
| `InputItem` | Raw user input: id, optional enchant id, gem id array |
| `Item` | Full item data from items.json |
| `ItemVariation` | Item + specific enchant + specific gems + `uniqueId` + `locked` flag |
| `LPItem` | ItemVariation + three precomputed scores; `Weapon` with `weaponType === "Shield"` is remapped to `ProcessedItemType = "Shield"` |

### `ModifierSource` / `Buff`

`ModifierSource` is the base type for talents, abilities, and buffs. `Buff` extends it with a `checked: boolean` toggle. Stat values are multiplied by `rank` during calculation (`rank` defaults to 1 if absent).

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

## Known Issues & Intentional Limitations

- **Only Paladin (classId `"2"`) / Human (raceId `"1"`) supported.** Other classes/races have no data.
- **Base Health/Mana values are wrong** (too high) — `level_stats.json` data needs correction.
- **Some enchants missing** — e.g. block rating enchant for shields.
- **Armor DR formula** uses hardcoded level 73 attacker constant (`10557.5`). Differs against level 72 mobs.
- **Base dodge hardcoded** at 0.65% — varies by race/class in reality.
- **`optimizeStats` uses `Stat[]` type** but semantically represents weighted objectives, not stat values. Known type design issue.
- **`StatConverter`** mixes rating↔percent conversions with stat-to-derived-stat conversions (e.g. Agility→Dodge). Needs refactoring.
- **Elixirs/Flasks** UI placeholder exists but is not implemented.
- **Integration test is broken** — `tests/integration.test.ts` imports `getAvoidanceFromItems` from `helpers/getStatFromItem`, which does not exist. It also calls `solve()` expecting `result.items` but `solve()` returns `LPItem[]` directly.

---

## Conventions

- **MUI is the UI library of choice.** New components should use MUI. Tailwind may appear in older code but should not be added to new work.
- **Path alias `#/`** is used throughout for imports from `src/`. Prefer this over relative paths.
- **Stat values in data files are always ratings**, never percentages.
- **Class IDs**: Paladin = `"2"`. **Race IDs**: Human = `"1"`. These are strings, not numbers.
- **Biome** handles both linting and formatting. Run `npm run check` before committing.

