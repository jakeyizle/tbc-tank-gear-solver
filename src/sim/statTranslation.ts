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
	AttackPower: "StatAttackPower",
	MeleeHit: "StatMeleeHitRating",
	MeleeCrit: "StatMeleeCritRating",
	Expertise: "StatExpertiseRating",
	ArmorPenetration: "StatArmorPenetration",
	Defense: "StatDefenseRating",
	Block: "StatBlockRating",
	BlockValue: "StatBlockValue",
	Dodge: "StatDodgeRating",
	Parry: "StatParryRating",
	Resilience: "StatResilienceRating",
	Armor: "StatArmor",
};

export const TBC_STAT_TO_STAT_NAME: Partial<Record<string, StatName>> =
	Object.fromEntries(
		Object.entries(STAT_NAME_TO_TBC_STAT).map(([statName, tbcStat]) => [
			tbcStat,
			statName as StatName,
		]),
	);

/** tbc-new's own default EP/DTPS reference stat (stats.Armor — see statweight.go:15). */
export const TBC_EP_REFERENCE_STAT = "StatArmor";

/**
 * Metrics where the raw sim value is "lower is better" (damage taken, danger). The solver's
 * objective is always maximized (see decomposedModel.ts's fixed GLP_MAX), so weights for
 * these metrics must be sign-flipped before use as an objectiveStats vector.
 */
export const LOWER_IS_BETTER_METRICS: ReadonlySet<string> = new Set([
	"dtps",
	"tmi",
]);
