// Translation between this repo's StatName and tbc-new's proto.Stat enum, for the subset of
// stats a Protection Paladin calibration cares about. Units already match on both sides
// (flat rating-point atoms) — this is a pure name remap, not a scaling conversion. See
// docs/plans/sim-backed-objectives.md's "tbc-new stats.Stat <-> StatName translation table".
import type { StatName } from "#/solver/types";

// tbc-new proto.Stat JSON enum names (src/sim/proto/common.ts), keyed by this repo's
// StatName, for exactly the stats relevant to a Protection Paladin survivability/threat
// calibration.
export const STAT_NAME_TO_TBC_STAT: Partial<Record<StatName, string>> = {
	Strength: "StatStrength",
	Agility: "StatAgility",
	Stamina: "StatStamina",
	MeleeHit: "StatMeleeHitRating",
	Expertise: "StatExpertiseRating",
	Defense: "StatDefenseRating",
	Block: "StatBlockRating",
	BlockValue: "StatBlockValue",
	Dodge: "StatDodgeRating",
	Parry: "StatParryRating",
	Resilience: "StatResilienceRating",
	Armor: "StatArmor",
	// Health is usually derived from Stamina (see helpers/stats.ts's calculateResource), but it
	// also appears as its own independent itemization axis - e.g. enchants.json's "+150 Health"
	// chest enchant carries a raw Health stat, not Stamina. Without this, that enchant (and any
	// other flat-Health source) contributes nothing to the sim-calibrated Survivability
	// objective, even though more health straightforwardly helps TMI-5 the same way Stamina does.
	Health: "StatHealth",
	// This spec's simple rotation (Judgement, Consecration, Exorcism, Hammer of Wrath - see
	// protPaladinSimpleRotation.ts) is Holy-school spell damage, not physical melee - these three
	// were missing from this list entirely until an investigation into a balance-slider anomaly
	// (100% Threat scoring *lower* TPS than 100% Survivability) traced it here: the "pure TPS"
	// solve was structurally blind to the stats that actually drive most of this spec's threat,
	// able to express a preference only through the secondary physical stats above.
	SpellPower: "StatSpellDamage",
	SpellHit: "StatSpellHitRating",
	SpellCrit: "StatSpellCritRating",
};

// Canonical "which stats can be sim-calibrated" list - the keys of STAT_NAME_TO_TBC_STAT above,
// as a plain array. Lives here (a pure, dependency-free data module) rather than in
// solveSimMetric.ts/calibrateWeights.ts, so src/types/SolverConfig.ts and UI components can pull
// in "the full default stat list" (for a per-config on/off toggle - see
// SolverConfiguration.enabledCalibrationStats) without any wasm/proto sim code coming along for
// the ride.
export const SIM_CALIBRATION_STAT_NAMES = Object.keys(
	STAT_NAME_TO_TBC_STAT,
) as StatName[];

/**
 * Resolves a per-config `enabledCalibrationStats` selection (see SolverConfiguration) down to
 * the actual list of stats a calibration round should perturb - falling back to the full
 * default (`SIM_CALIBRATION_STAT_NAMES`) when `enabled` is undefined/empty, or when every entry
 * in it turns out to be stale/invalid after filtering (e.g. a stat this build no longer
 * translates). Shared by solveSimMetric.ts (the actual calibration call) and
 * solver/index.ts (round1WeightsCache.ts's cache key, which must resolve identically so a
 * config left at its default and a config that explicitly re-selects every stat hit the same
 * cache entry) so the two can never drift out of sync.
 */
export function resolveCalibrationStats(
	enabled: StatName[] | undefined,
): StatName[] {
	if (!enabled?.length) return SIM_CALIBRATION_STAT_NAMES;
	const filtered = enabled.filter((s) =>
		SIM_CALIBRATION_STAT_NAMES.includes(s),
	);
	return filtered.length > 0 ? filtered : SIM_CALIBRATION_STAT_NAMES;
}

export const TBC_STAT_TO_STAT_NAME: Partial<Record<string, StatName>> =
	Object.fromEntries(
		Object.entries(STAT_NAME_TO_TBC_STAT).map(([statName, tbcStat]) => [
			tbcStat,
			statName as StatName,
		]),
	);

// The reference stat used to normalize Dps/Hps/Tps EP values (statweight.go's calcEpResults
// call for those three uses `swcr.EpReferenceStat`, i.e. whatever this repo sends here — Dtps/
// Tmi/PDeath instead always normalize against the hardcoded DTPSReferenceStat = stats.Armor,
// see statweight.go:15/368-370, regardless of this value, and that's left as-is: Armor is a
// good DTPS/TMI reference precisely because it's ubiquitous - present on nearly every gear
// slot - and this spec's reference encounter (protPaladinEncounter.ts) is a pure melee-swing
// boss, so Armor's own marginal DTPS/TMI effect is real and stable, not near-zero).
//
// Armor is tbc-new's own upstream default for the Tps/Dps/Hps side too, but it's a poor choice
// for a tank's Tps EP specifically: armor has ~zero direct effect on threat, so its own raw Tps
// weight comes back ~0, and calcEpResults bails out entirely when the reference stat's own
// weight is 0 (statweight.go:356-358) — leaving every stat's Tps EP at 0, silently making a
// nonzero "tps" ratio in solveSimMetric.ts's Weighted-Sim-Metrics blend a no-op.
//
// Spell Damage (this repo's "SpellPower") is the better choice for a Protection Paladin: its
// simple-rotation threat sources (Judgement, Consecration, Exorcism, Hammer of Wrath - see
// protPaladinSimpleRotation.ts) are all Holy-school spells that scale off spell damage, giving a
// reliably nonzero, threat-relevant marginal weight, unlike Attack Power (whose contribution to
// this spec's threat is comparatively minor and, on a low-AP gear point, can itself flirt with
// the same near-zero problem).
export const TBC_EP_REFERENCE_STAT = "StatSpellDamage";

// Which stat each metric's EP values are normalized against - see the reference-stat comment
// above. Single source of truth for UI labels like "relative to Spell Power"/"relative to Armor"
// (see StatWeightTabs.tsx) - literal "tps"|"dtps"|"tmi" keys rather than importing SimMetric from
// calibrateWeights.ts, to avoid a circular import (calibrateWeights.ts already imports from this
// file).
export const SIM_METRIC_REFERENCE_STAT: Record<
	"tps" | "dtps" | "tmi",
	StatName
> = {
	tps: TBC_STAT_TO_STAT_NAME[TBC_EP_REFERENCE_STAT] as StatName,
	dtps: "Armor",
	tmi: "Armor",
};

// Stats whose calibration perturbation is one-sided (no negative/"low" probe branch) - see
// buildStatWeightRequests in vendor/tbc-sim/sim/core/statweight.go, which zeroes statModsLow for
// exactly these three ratings (their hit/expertise-cap formulas floor at 0%, so a negative probe
// would often be degenerate). Keep this in sync with that Go code if it ever changes.
export const ONE_SIDED_CALIBRATION_STATS: ReadonlySet<StatName> = new Set([
	"MeleeHit",
	"SpellHit",
	"Expertise",
]);

/**
 * The actual number of paired-difference samples a calibration batch's per-stat weight/stdev is
 * derived from - see statweight.go's calcWeightResults: two-sided stats pool the low+high
 * branches (iterations/2 each, iterations total); one-sided stats (ONE_SIDED_CALIBRATION_STATS)
 * only ever run the high branch (iterations/2). `iterations` here is the pre-halving value this
 * app sends as profile.calibration.iterations (see buildStatWeightsRequest.ts) - the Go side
 * halves it itself before running either branch.
 *
 * This matters because the Go sim's own `WeightsStdev`/`EpValuesStdev` (aggregator.
 * meanAndStdDev(), see utils.go) is the raw *population* standard deviation of the individual
 * per-iteration values, not a standard error - it does not shrink with more samples on its own.
 * Converting it into an actual standard error of the mean weight (population stdev / sqrt(n))
 * requires knowing this effective n - see blendMetricEpValueStdevs.
 */
export function effectiveCalibrationSampleSize(
	statName: StatName,
	iterations: number,
): number {
	return ONE_SIDED_CALIBRATION_STATS.has(statName)
		? iterations / 2
		: iterations;
}
