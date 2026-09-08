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

// Spell Power and Armor (see SIM_METRIC_REFERENCE_STAT) are always probed by statweight.go
// regardless of a config's `enabledCalibrationStats` selection - buildStatWeightRequests
// unconditionally seeds both EpReferenceStat and DTPSReferenceStat with a +/- perturbation
// (statweight.go:165-176), since every other stat's EP value is computed by dividing its own
// weight by one of these two, and a reference stat with no measured weight of its own makes that
// division impossible (calcEpResults bails out entirely - see TBC_EP_REFERENCE_STAT's own
// comment). So a config that "turns off" Spell Power or Armor doesn't actually skip calibrating
// them - it just hides a sim run the app pays for either way. UI stat-selection controls (see
// CalibrationStatsSection) should treat these two as always-on and non-interactive rather than
// implying they can be excluded.
export const ALWAYS_INCLUDED_CALIBRATION_STATS: ReadonlySet<StatName> = new Set(
	[SIM_METRIC_REFERENCE_STAT.tps, SIM_METRIC_REFERENCE_STAT.dtps],
);

// Canonical "which stats can be sim-calibrated" list - the keys of STAT_NAME_TO_TBC_STAT above,
// as a plain array, with the always-included stats (Spell Power, Armor) sorted first so UI
// listings (see CalibrationStatsSection) surface them up front rather than buried alphabetically/
// by declaration order. Lives here (a pure, dependency-free data module) rather than in
// solveSimMetric.ts/calibrateWeights.ts, so src/types/SolverConfig.ts and UI components can pull
// in "the full default stat list" (for a per-config on/off toggle - see
// SolverConfiguration.enabledCalibrationStats) without any wasm/proto sim code coming along for
// the ride.
export const SIM_CALIBRATION_STAT_NAMES = (
	Object.keys(STAT_NAME_TO_TBC_STAT) as StatName[]
).sort((a, b) => {
	const aFirst = ALWAYS_INCLUDED_CALIBRATION_STATS.has(a);
	const bFirst = ALWAYS_INCLUDED_CALIBRATION_STATS.has(b);
	if (aFirst === bFirst) return 0;
	return aFirst ? -1 : 1;
});

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

/**
 * Stats whose sim-calibrated weight is provably always exactly 0 for a given config, and so
 * should skip real sim perturbation entirely - the opposite case from
 * ALWAYS_INCLUDED_CALIBRATION_STATS (that's "always worth measuring"; this is "never worth
 * measuring"). Callers should still report these stats at an explicit 0 for every metric (not
 * omit them) rather than silently dropping them from a per-stat breakdown - see
 * calibrateWeights.ts's calibratePerMetricWeights, which keeps a dead stat in the *reported*
 * `statsToWeigh` list while excluding it from the actual sim request.
 *
 * Currently just Resilience, and only for `uncritabilitySetting === 2` (the "Lvl 73 · 5.6%"
 * setting - see ConstraintsSection's UNCRITABILITY_OPTIONS and avoidance.ts's
 * calculateUncritabilityTarget). This app's sims always run against a level-73 reference boss
 * (protPaladinEncounter.ts), which requires the full 5.6% to be truly crit-immune - the
 * `uncritabilitySetting === 1` ("Lvl 72 · 5.4%") floor is genuinely insufficient against that
 * boss, so a config left at that setting can still take real crits and Resilience keeps real
 * value there. Only the 5.6% floor actually guarantees zero crits taken against the boss this
 * app simulates.
 *
 * Resilience contributes to survivability only via calculateUncritability's `resilienceSkill`
 * term (helpers/stats.ts) - crit-chance reduction against a boss that, once the 5.6% floor is
 * met, can already never critically hit the tank at all. The LP's own `uncritable` constraint
 * (solveConfig.ts's makeUncritableConstraint - a `>=` floor, never an equality) guarantees every
 * candidate gear set the solver ever considers already sits at or above that threshold once this
 * setting is active. That means the boss's real crit-taken rate is always exactly 0% for every
 * feasible solution regardless of how much Resilience is in the gear, and Resilience has no
 * other modeled effect - unlike Defense, which also contributes avoidance (dodge/parry/block/
 * miss - see helpers/stats.ts's calculateDodge/calculateParry/calculateBlock/calculateMiss) on
 * top of uncritability, so Defense keeps real marginal value even once the crit floor is met.
 * Simming a perturbation for Resilience under these conditions can only ever measure sampling
 * noise around a true value of exactly zero, for TPS, DTPS, and TMI alike.
 */
export function deadCalibrationStats(
	uncritabilitySetting: number,
): ReadonlySet<StatName> {
	return uncritabilitySetting === 2
		? new Set<StatName>(["Resilience"])
		: new Set();
}

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
