// The last surviving fragment of the hand-written stat engine.
//
// Percent/skill conversion and the armor mitigation curve are gone - src/sim/deriveLinearModel.ts
// measures those from the simulator now, and src/data/mechanics.ts holds the few constants that
// still have to be stated. What remains is percent -> rating, which exists solely because
// src/data/talents.ts and src/data/abilities.ts author a handful of effects as percentages
// ("+5% dodge") while the rest of the pipeline works in rating.
//
// Both of those files are deleted by the config-model collapse (Phase 4), and this goes with
// them. Do not add callers.
import {
	BLOCK_RATING_PER_BLOCK_PERCENT,
	DEFENSE_RATING_PER_DEFENSE_LEVEL,
	DODGE_RATING_PER_DODGE_PERCENT,
	PARRY_RATING_PER_PARRY_PERCENT,
	RESILIENCE_RATING_PER_CRIT_REDUCTION_CHANCE,
	SPELL_CRIT_RATING_PER_CRIT_PERCENT,
	SPELL_HASTE_RATING_PER_HASTE_PERCENT,
	SPELL_HIT_RATING_PER_HIT_PERCENT,
} from "#/data/mechanics";
import type { Stat } from "#/solver/types";

type StatRatingName =
	| "Parry"
	| "Dodge"
	| "Block"
	| "Defense"
	| "Resilience"
	| "SpellCrit"
	| "SpellHit"
	| "SpellHaste"
	// Miss has no rating; the identity keeps callers from special-casing it.
	| "Miss";

const RATING_PER_POINT: Record<StatRatingName, number> = {
	Parry: PARRY_RATING_PER_PARRY_PERCENT,
	Dodge: DODGE_RATING_PER_DODGE_PERCENT,
	Block: BLOCK_RATING_PER_BLOCK_PERCENT,
	Defense: DEFENSE_RATING_PER_DEFENSE_LEVEL,
	Resilience: RESILIENCE_RATING_PER_CRIT_REDUCTION_CHANCE,
	SpellCrit: SPELL_CRIT_RATING_PER_CRIT_PERCENT,
	SpellHit: SPELL_HIT_RATING_PER_HIT_PERCENT,
	SpellHaste: SPELL_HASTE_RATING_PER_HASTE_PERCENT,
	Miss: 1,
};

export const convertStatToRating = (
	stat: Stat & { name: StatRatingName },
): number => stat.value * RATING_PER_POINT[stat.name];
