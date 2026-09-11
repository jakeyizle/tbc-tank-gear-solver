// Character-stat shapes returned by the sim's computeStats call.
//
// These live in src/types/ rather than src/sim/ for the same reason SimMetricsSnapshot does:
// src/solver/ and the UI need to name them, but neither may pull in the sim module graph.
// See docs/plans/sim-backed-objectives.md's note on the src/solver -> src/sim boundary.

/** One snapshot of a character's stats: raw stat array plus derived pseudo-stats. */
export interface UnitStatsView {
	/** Indexed by proto.Stat - see src/data/tbcDatabase.ts's STAT_INDEX_TO_NAME. */
	stats: number[];
	/** Indexed by proto.PseudoStat - dodge 4, parry 5, block 16, crit-taken 26. */
	pseudoStats: number[];
}

/**
 * The build-phase breakdown from vendor/tbc-sim/sim/core/character.go's applyAllEffects.
 *
 * IMPORTANT: these are CUMULATIVE, not per-source deltas. `gear` is base+gear, `talents` is
 * base+gear+talents, and so on. Show a per-source contribution as the difference between
 * consecutive snapshots.
 */
export interface CharacterStatsBreakdown {
	base: UnitStatsView;
	gear: UnitStatsView;
	talents: UnitStatsView;
	buffs: UnitStatsView;
	consumes: UnitStatsView;
	final: UnitStatsView;
}

export interface CharacterStatsSnapshot {
	/** Everything the profile enables: gear, talents, buffs, debuffs, consumables. */
	buffed: CharacterStatsBreakdown;
	/** Gear and talents only - every buff, debuff and consumable stripped. */
	unbuffed: CharacterStatsBreakdown;
}
