# Things that need doing

## Stat breakdown by source
`StatsSummary` shows stat totals (and can toggle buffs/consumables in/out) but doesn't break a
stat down by where it came from (items vs. talents vs. base stats). Would help players see which
gear/talent choices are actually moving the needle.

## Fill in consumable `wowheadId`s
Every entry in `src/data/consumables.ts` has `wowheadId: 0` as a placeholder. Result rows link out
via `helpers/wowhead.ts` using that id, so every consumable link currently resolves to
`wowhead.com/tbc/item=0` instead of the real item page.

# Problems that need fixing

## Base stats need a correctness pass against authoritative TBC data
`level_stats.json` stores a flat Health (3377) / Mana (2953) baseline shared by all Paladin races,
with race variance coming through separately via each race's Stamina/Intellect (converted to bonus
Health/Mana at display time — see `calculateResource` in `src/helpers/stats.ts`). The mechanism is
correct; whether the actual numbers match real TBC level-70 values hasn't been verified here.
(Earlier note in this file claiming race variance was missing entirely was wrong — it's applied
via Stamina/Intellect, not stored directly on Health/Mana.)

## Armor DR formula assumes level 73 attacker
Hardcoded constant (`10557.5`) in the armor conversion doesn't adjust for level 72 (heroic) mobs.

## `optimizeStats` type mismatch
Uses the `Stat[]` type but semantically represents weighted objectives, not stat values. Needs its
own type.

## Warrior/Druid tank support is stubbed but not wired up
`src/data/classes.ts` already has commented-out `"1": "Warrior"` and `"11": "Druid"` entries in
`CLASS_LABELS`, but there's no corresponding talent/ability data, and the avoidance/uncrit
constraint math in `SolverConfiguration.ts` is Paladin-specific (e.g. Holy Shield's Block bonus).
Uncommenting the labels alone would let users pick a class with no matching data.

---

# Resolved (kept for history — remove once stale)

- ~~Implement Talents & Abilities in UI~~ — talents are fully editable (`CharacterSection` /
  `TalentSection`). Abilities turned out not to need UI: Paladin's only ability (Holy Shield) is a
  fixed passive with no configurable rank, auto-applied by class.
- ~~Tests~~ — 8 test files now exist, colocated next to source
  (`baseStats.test.ts`, `avoidance.test.ts`, `decomposedModel.test.ts`, `socketBonus.test.ts`,
  `solveConfig.test.ts`, `solveEHP.test.ts`, `parseItemInput.test.ts`, `stats.test.ts`).
- ~~Missing block rating enchant for shields~~ — `enchants.json` has "Enchant Shield - Shield
  Block" (+15 Block rating).
- ~~Two similarly-named solver config contexts~~ — there's now only one context
  (`CharacterConfigContext`); solver configs are managed by a plain `useState` hook
  (`useSolverConfigs`), not a second context.
- ~~Dead code~~ — removed the unused `convertStat()` switch function, the empty
  `ElixirFlaskSection/` placeholder directory, `getTalent()`, `EquipmentSummary`/
  `summarizeEquipment()`, the orphan `formatStats.ts`, and the unused `lucide-react`
  dependency. Several file-local-only exports (`ChangelogEntry`, `HeadlineStat`, etc.) had
  their unnecessary `export` keyword stripped rather than being deleted, since they're still
  used within their own files.
