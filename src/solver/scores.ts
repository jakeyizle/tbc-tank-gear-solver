// Scoring a candidate against the LP's stat model: a dot product, and nothing more.
//
// This used to call into src/helpers/stats.ts, which reimplemented TBC's stat math (armor from
// agility, block value from strength, dodge from defense, ...) and drifted from the vendored
// sim. All of that now lives in the coefficients, measured from the sim itself by
// src/sim/deriveLinearModel.ts. This file only knows how to multiply and add.
//
// WHY THE DEFAULT IS UNROUNDED DEFENSE
//
// These functions score ONE item/gem/enchant in isolation, and the LP sums those scores.
// Defense skill is floor(totalDefenseRating / 2.365385), and floor(a + b) !== floor(a) +
// floor(b) - so rounding here would break the additivity the whole LP formulation rests on,
// discarding every candidate's fractional remainder instead of letting it combine with its
// neighbours'. Each item must contribute the UNROUNDED linear rate.
//
// The rounding is not ignored, just relocated: runLPModelWithAvoidanceConvergence in
// solveConfig.ts re-scores the ASSEMBLED set with `roundDefense: true` and tightens the target
// if rounding left it short. That loop is the designed home for this nonlinearity.
//
// This split is load-bearing. Do not "simplify" it away.
import type {
	AxisVector,
	LinearAxis,
	LinearStatModel,
} from "#/types/LinearStatModel";
import { itemMeetsSocketBonus } from "./socketBonus";
import type { LPItem, ScoreSet, Stat, StatName } from "./types";

export interface AxisTotalOptions {
	/**
	 * Apply the in-game floor to defense rating -> defense skill. Only correct when `stats`
	 * describes a WHOLE gear set; see this file's header.
	 */
	roundDefense?: boolean;
}

/**
 * Sums `stats` onto the requested axes.
 *
 * Multiplier-typed stats are ignored: no item, gem, enchant or socket bonus carries one (they
 * only ever came from buffs and talents), and buff/talent multipliers are already baked into
 * the coefficients by virtue of being applied inside the sim build that measured them.
 */
export const axisTotals = (
	stats: Stat[],
	model: LinearStatModel,
	axes: readonly LinearAxis[],
	options: AxisTotalOptions = {},
): AxisVector => {
	const totals: AxisVector = {};
	for (const axis of axes) totals[axis] = 0;

	let defenseRating = 0;
	for (const stat of stats) {
		if (stat.type === "multiplier") continue;
		if (stat.name === "Defense") {
			defenseRating += stat.value;
			continue;
		}
		const coefficients = model.coefficients[stat.name];
		if (!coefficients) continue;
		for (const axis of axes) {
			const coefficient = coefficients[axis];
			if (coefficient) {
				totals[axis] = (totals[axis] ?? 0) + stat.value * coefficient;
			}
		}
	}

	if (defenseRating !== 0) {
		// The Defense axis is the raw rating - a stat weight on defense weighs rating, not the
		// skill it converts into - so it never sees the floor.
		if (totals.Defense !== undefined) totals.Defense += defenseRating;

		const { ratingPerPoint, baseRating } = model.defense;
		// Rounded: floor the character's REAL total (base + gear) and subtract the base points
		// the model has already counted, so the set's score is exactly what the game grants.
		// Unrounded: the linear rate, per this file's header.
		const points = options.roundDefense
			? Math.floor((baseRating + defenseRating) / ratingPerPoint) -
				Math.floor(baseRating / ratingPerPoint)
			: defenseRating / ratingPerPoint;
		for (const axis of axes) {
			const coefficient = model.defense.perPoint[axis];
			if (coefficient) {
				totals[axis] = (totals[axis] ?? 0) + points * coefficient;
			}
		}
	}

	return totals;
};

const uniqueAxes = (axes: LinearAxis[]): LinearAxis[] => [...new Set(axes)];

export const calculateScores = (
	stats: Stat[],
	objectiveStats: Stat[],
	model: LinearStatModel,
	avoidanceStatName: "Avoidance" | "ShearAvoidance" = "Avoidance",
	resistanceStats: StatName[] = [],
	options: AxisTotalOptions = {},
): ScoreSet => {
	const axes = uniqueAxes([
		avoidanceStatName,
		"Uncritability",
		...objectiveStats.map((objective) => objective.name),
		...resistanceStats,
	]);
	const totals = axisTotals(stats, model, axes, options);

	let objectiveScore = 0;
	for (const objective of objectiveStats) {
		objectiveScore += (totals[objective.name] ?? 0) * objective.value;
	}

	const resistanceScores: Partial<Record<StatName, number>> = {};
	for (const statName of resistanceStats) {
		resistanceScores[statName] = totals[statName] ?? 0;
	}

	return {
		avoidanceScore: totals[avoidanceStatName] ?? 0,
		uncritabilityScore: totals.Uncritability ?? 0,
		objectiveScore,
		resistanceScores,
	};
};

/**
 * Every stat a solved gear set actually supplies: the items themselves plus their enchants,
 * gems, and any socket bonus whose colour requirement the chosen gems meet.
 */
export const collectItemStats = (items: LPItem[]): Stat[] => [
	...items.flatMap((item) => item.stats),
	...items.flatMap((item) => item.enchant.stats),
	...items.flatMap((item) => item.gems.flatMap((gem) => gem.stats)),
	...items.flatMap((item) =>
		itemMeetsSocketBonus(item) ? item.socketBonus : [],
	),
];

/**
 * One axis's value for an assembled gear set, EXCLUDING the character's base (`model.base`).
 * Defaults to the rounded defense treatment, because a whole set is exactly the place the
 * in-game floor belongs - see this file's header.
 */
export const scoreItemSet = (
	items: LPItem[],
	model: LinearStatModel,
	axes: readonly LinearAxis[],
	options: AxisTotalOptions = { roundDefense: true },
): AxisVector => axisTotals(collectItemStats(items), model, axes, options);
