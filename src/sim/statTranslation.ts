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

/**
 * Metrics where the raw sim value is "lower is better" (damage taken, danger). The solver's
 * objective is always maximized (see decomposedModel.ts's fixed GLP_MAX), so weights for
 * these metrics must be sign-flipped before use as an objectiveStats vector.
 */
export const LOWER_IS_BETTER_METRICS: ReadonlySet<string> = new Set([
	"dtps",
	"tmi",
]);
