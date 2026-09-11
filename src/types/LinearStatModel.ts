// The LP's view of the game: a base vector plus one additive coefficient per stat.
//
// Everything the solver needs to score a candidate item lives here, and NOTHING in this shape
// is game knowledge the app computes for itself - src/sim/deriveLinearModel.ts measures it all
// by asking the vendored sim (computeStats) what a character's stats actually are. That is the
// whole point of the sim-as-source-of-truth refactor: the solver keeps the linear algebra, the
// sim keeps the mechanics.
//
// Deliberately lives in src/types/ (same reasoning as CharacterStats.ts): src/solver/ may not
// import src/sim/, so the shape they agree on has to be neutral ground.
import type { StatName } from "#/solver/types";

/**
 * An output the LP can constrain or maximize. Raw `StatName`s are the sim's own final-stat
 * values (so `Armor` already includes armor-from-agility, `Health` already includes
 * health-from-stamina, and so on); the three derived axes are this app's tanking quantities.
 */
export type LinearAxis =
	| StatName
	| "Avoidance"
	| "ShearAvoidance"
	| "Uncritability";

export type AxisVector = Partial<Record<LinearAxis, number>>;

/**
 * A stat whose in-game effect is quantized: the game converts `ratingPerPoint` rating into one
 * whole point of something, discarding the remainder.
 *
 * These are held separately from `coefficients` because the flooring cannot be baked into a
 * per-item coefficient - see the INVARIANT on LinearStatModel below.
 */
export interface FlooredStatRate {
	/** Rating required for one whole point (e.g. 2.365385 defense rating per defense skill). */
	ratingPerPoint: number;
	/** Axis deltas contributed by one whole point. */
	perPoint: AxisVector;
	/**
	 * Rating the character already has before any gear (Blessing of Sanctuary grants defense
	 * rating, for instance). Its effect is ALREADY counted in `base`, so this exists only so
	 * that a set-level rounded score can floor the combined total the way the game does:
	 * `floor((baseRating + gearRating) / ratingPerPoint) - floor(baseRating / ratingPerPoint)`.
	 * Adding it to a per-item score would give every candidate the base's points over again.
	 */
	baseRating: number;
}

export interface LinearStatModel {
	/**
	 * Axis values for the character wearing NO equipment, with race, talents, buffs, debuffs
	 * and consumables applied. This is what the LP's targets are measured against: an avoidance
	 * floor of 102.4% becomes a constraint of `102.4 - base.Avoidance` on the chosen items.
	 */
	base: AxisVector;

	/**
	 * `coefficients[stat][axis]` = the axis delta produced by ONE point of `stat`, measured by
	 * finite-differencing the sim. Cross-terms are included and are the reason this cannot be a
	 * diagonal matrix: on a Protection Paladin one point of Strength moves AttackPower by 2 and
	 * BlockValue by 0.05, and one point of Agility moves Armor by 2 and DodgeRating by ~0.76.
	 *
	 * `Defense` is deliberately ABSENT - see `defense` below. Resilience IS probed: the sim's
	 * crit-reduction from resilience is a plain unfloored division (unit.go:945), so it is
	 * genuinely linear and needs no special handling.
	 */
	coefficients: Partial<Record<StatName, AxisVector>>;

	/**
	 * INVARIANT - do not violate.
	 *
	 * Defense skill is `floor(totalDefenseRating / 2.365385)` and `floor(a + b) != floor(a) +
	 * floor(b)`, so any rounding baked into a per-item coefficient breaks the additivity the
	 * entire LP rests on: it would discard each candidate's fractional remainder instead of
	 * letting it combine with its neighbours'. Per-item scoring MUST therefore use the
	 * unrounded rate `perPoint / ratingPerPoint`.
	 *
	 * The rounding is relocated, not ignored: `runLPModelWithAvoidanceConvergence` re-scores
	 * the assembled set WITH the floor applied and tightens the target when rounding leaves it
	 * short. That loop is the designed home for this nonlinearity.
	 *
	 * This is also why Defense is the one stat not finite-differenced against the sim:
	 * computeStats floors internally, so a measured slope would be wrong.
	 *
	 * `perPoint` carries only the DERIVED axes (avoidance, uncritability, the equivalent
	 * dodge/parry/block rating). The `Defense` axis itself is the raw rating and is never
	 * floored - a stat weight on defense rating weighs rating, not skill.
	 */
	defense: FlooredStatRate;

	/**
	 * Attacker level used for the armor mitigation curve, so EHP does not have to hardcode one.
	 * See src/data/mechanics.ts's armorConstant.
	 */
	attackerLevel: number;

	/**
	 * Multiplier on physical damage taken from sources that are NOT armor (today: Improved
	 * Righteous Fury). Used by the EHP objective, which is `health / (1 - totalReduction)`.
	 * 1 means no reduction.
	 */
	physicalDamageTakenMultiplier: number;
}
