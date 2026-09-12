# Open work

## Stat breakdown by source
`StatsSummary` shows totals and can toggle buffs/consumables, but does not break a stat down by
where it came from. The data is already there: `CharacterStatsSnapshot` carries base / gear /
talents / buffs / consumes vectors from the sim. They are **cumulative**, so a per-source
contribution is the difference between consecutive snapshots.

## `optimizeStats` type mismatch
`SolverConfig.ts:19` types it `Stat[]`, but it semantically holds weighted objectives, not stat
values. Needs its own type.

## Warrior/Druid tank support is stubbed, not wired
`src/data/classes.ts` has commented-out Warrior and Druid entries. Beyond data, the avoidance and
uncrit math in `SolverConfiguration.ts` is Paladin-specific (Holy Shield's block bonus is added by
hand, since an active aura is not a stat `computeStats` reports). Uncommenting the labels alone
would let a user pick a class with no matching math.

## Testing gaps
Listed with rationale in [docs/testing.md](docs/testing.md): the UI layer (0%),
`hooks/useSolverConfigs.ts`, `simWorkerPool.ts` dispatch, `fetchWasmModule.ts` gzip sniffing, and
CI (there is none).
