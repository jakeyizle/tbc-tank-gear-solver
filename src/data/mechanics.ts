// TBC combat-math constants, transcribed from the vendored sim so there is exactly one
// place in this repo that states a game constant, each with the Go source line it came from.
//
// Deliberately lives in src/data/ rather than src/sim/: src/solver/ may not statically
// import src/sim/ (it would pull the sim chunk into plain solves - see solver.worker.ts),
// but both sides need these numbers, and a constants module has no runtime dependencies.
//
// NOTE ON UNITS: the sim stores base avoidance chances as FRACTIONS (0.044 = 4.4%), while
// this repo's stat pipeline works in percentage points. Helpers below return fractions,
// matching the Go source; convert at the call site.

/** vendor/tbc-sim/sim/core/constants.go - the level this sim is built for. */
export const CHARACTER_LEVEL = 70;

// Rating -> percent divisors, from vendor/tbc-sim/sim/core/base_stats_auto_gen.go:12-22.
//
// helpers/convertStat.ts carries rounded copies of these, which Phase 2 deletes:
//   Parry 23.6538 / Dodge 18.9231 / Block 7.8846  - truncated, ~2e-6 relative error
//   SpellCrit 22.1 / SpellHit 12.6 / SpellHaste 15.8 - rounded to 3 s.f., up to 0.2% off
//   Defense 2.3654 - truncated, and the one that can actually bite: defense SKILL is
//     floor(rating / divisor), so a divisor that is slightly too large can drop the skill
//     by a whole point at an exact breakpoint, which in turn moves avoidance by 0.04%.
export const DEFENSE_RATING_PER_DEFENSE_LEVEL = 2.365385;
export const DODGE_RATING_PER_DODGE_PERCENT = 18.923079;
export const PARRY_RATING_PER_PARRY_PERCENT = 23.653847;
export const BLOCK_RATING_PER_BLOCK_PERCENT = 7.884615;
export const PHYSICAL_HIT_RATING_PER_HIT_PERCENT = 15.769233;
export const SPELL_HIT_RATING_PER_HIT_PERCENT = 12.615385;
export const PHYSICAL_CRIT_RATING_PER_CRIT_PERCENT = 22.076923;
export const SPELL_CRIT_RATING_PER_CRIT_PERCENT = 22.076923;
export const PHYSICAL_HASTE_RATING_PER_HASTE_PERCENT = 15.769233;
export const SPELL_HASTE_RATING_PER_HASTE_PERCENT = 15.76923;
export const EXPERTISE_PER_QUARTER_PERCENT_REDUCTION = 3.942308;

// vendor/tbc-sim/sim/core/constants.go:25-26
/** Percentage points of miss/dodge/parry/block/crit-reduction per point of defense SKILL. */
export const MISS_DODGE_PARRY_BLOCK_CRIT_CHANCE_PER_DEFENSE = 0.04;
export const RESILIENCE_RATING_PER_CRIT_REDUCTION_CHANCE = 39.4231;

/**
 * Mirrors vendor/tbc-sim/sim/core/utils.go:154-166 `UnitLevelFloat64`. Values are selected
 * by the ATTACKER's level relative to the level-70 character: anything at or above
 * CHARACTER_LEVEL+3 (i.e. a raid boss) falls into the last bucket.
 */
export function unitLevelValue(
	attackerLevel: number,
	minus2: number,
	plus0: number,
	plus1: number,
	plus2: number,
	plus3: number,
): number {
	if (attackerLevel === CHARACTER_LEVEL - 2) return minus2;
	if (attackerLevel === CHARACTER_LEVEL) return plus0;
	if (attackerLevel === CHARACTER_LEVEL + 1) return plus1;
	if (attackerLevel === CHARACTER_LEVEL + 2) return plus2;
	return plus3;
}

/** The canonical raid-boss attacker level (CHARACTER_LEVEL + 3). */
export const BOSS_LEVEL = CHARACTER_LEVEL + 3;

// Base avoidance chances against an attacker of the given level, as FRACTIONS.
// vendor/tbc-sim/sim/core/target.go:406-412.
//
// THESE ARE COMBAT VALUES, NOT DISPLAY VALUES - do not use them to compute the avoidance
// figure shown to the user, and do not "correct" src/data/baseStats.ts to match them.
//
// A level-73 boss makes each of miss/dodge/parry/block exactly 0.6 percentage points less
// effective (5% -> 4.4%, and dodge 0% -> -0.6%). There are two self-consistent conventions
// for expressing that, and TBC tanking uses the second:
//   1. subtract the level adjustment and compare against a 100% uncrushable threshold
//   2. ignore it and compare against 100 + 0.6*4 = 102.4%   <- what everyone actually uses
// wowsims' own character panel is convention 2: player.tsx's getMissChanceInfo hardcodes
// `base: 5`, and the dodge/parry/block pseudo-stats carry the CLASS base chance without the
// attack table's level term. baseStats.ts's 5 / 5 / 5 / 0.65 and avoidance.ts's 102.4
// target are therefore correct and agree with wowsims.
//
// The functions below exist for combat-accurate math (and the armor constant beside them);
// the attack table applies them at swing time.
export const baseMissChance = (attackerLevel: number) =>
	unitLevelValue(attackerLevel, 0.054, 0.05, 0.048, 0.046, 0.044);
export const baseBlockChance = (attackerLevel: number) =>
	unitLevelValue(attackerLevel, 0.054, 0.05, 0.048, 0.046, 0.044);
export const baseParryChance = (attackerLevel: number) =>
	unitLevelValue(attackerLevel, 0.054, 0.05, 0.048, 0.046, 0.044);
export const baseDodgeChance = (attackerLevel: number) =>
	unitLevelValue(attackerLevel, 0.004, 0, -0.002, -0.004, -0.006);
export const baseCrushChance = (attackerLevel: number) =>
	unitLevelValue(attackerLevel, 0, 0, 0, 0, 0.15);

/**
 * Armor mitigation constant K in `DR = armor / (armor + K)`.
 * vendor/tbc-sim/sim/core/spell_resistances.go:133.
 *
 * Depends on the ATTACKER's level, which is why a single hardcoded constant is wrong:
 * 11960 at level 73 (a boss) but 11492.5 at level 72 - the discrepancy TODO.md records
 * against helpers/convertStat.ts:48.
 */
export const armorConstant = (attackerLevel: number) =>
	attackerLevel * 467.5 - 22167.5;

/** Fraction of physical damage mitigated by `armor` against an attacker of that level. */
export function armorDamageReduction(
	armor: number,
	attackerLevel: number = BOSS_LEVEL,
): number {
	const effectiveArmor = Math.max(armor, 0);
	return effectiveArmor / (effectiveArmor + armorConstant(attackerLevel));
}
