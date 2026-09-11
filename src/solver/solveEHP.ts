import { armorConstant, armorDamageReduction } from "#/data/mechanics";
import type { LinearStatModel } from "#/types/LinearStatModel";
import { getConsumableLPItems } from "./consumables";
import { prepareItemCandidates } from "./items";
import { SolverConfiguration } from "./SolverConfiguration";
import { scoreItemSet } from "./scores";
import {
	runLPModelWithAvoidanceConvergence,
	type SolveOptions,
	type SolveProgress,
	solveConfig,
} from "./solveConfig";
import type { InputItem, LPItem, Stat } from "./types";

/**
 * The character's total Armor and Health for a solved set: what the base already supplies
 * plus what the chosen items add. Both are ordinary linear axes of the stat model, so this is
 * just a lookup and an addition - the armor-from-agility and health-from-stamina conversions
 * that used to live in helpers/stats.ts are inside the coefficients.
 */
const armorAndHealth = (
	items: LPItem[],
	model: LinearStatModel,
): { armor: number; health: number } => {
	// Armor alone, NOT Armor + BonusArmor: the sim folds bonus armor into the Armor stat
	// (paladin.go:129's AddStatDependency), so the Armor axis is already the total and summing
	// both would count every ring and cloak twice.
	const totals = scoreItemSet(items, model, ["Armor", "Health"]);
	return {
		armor: (model.base.Armor ?? 0) + (totals.Armor ?? 0),
		health: (model.base.Health ?? 0) + (totals.Health ?? 0),
	};
};

// EHP = Health / (1 - D(Armor)), where D(Armor) = Armor / (Armor + K) is the (nonlinear,
// diminishing-returns) armor mitigation curve. That makes EHP nonlinear in the decision
// variables, so it can't be handed to GLPK directly the way a plain weighted stat sum can.
//
// Instead we linearize EHP around a guessed (armor, health) point each round - a first-order
// Taylor expansion - and solve *that* linear approximation as an ordinary weighted-stat
// objective (Health and Armor are both already-linear, already-supported objective stats).
// The result's actual armor/health then becomes the next round's guess. This is Sequential
// Linear Programming (a Frank-Wolfe-style method): each round is a cheap, exact LP solve: only
// the objective's weights change between rounds, not the mechanics of solving it.
//
// d/dHealth [Health / (1-D)]            = 1 / (1-D)
// d/dArmor  [Health / (1-D(Armor))]     = Health * D'(Armor) / (1-D)^2
// D'(Armor) = K / (Armor+K)^2
const linearizedEHPWeights = (
	armor: number,
	health: number,
	attackerLevel: number,
) => {
	// K depends on the attacker's level, which is why the old hardcoded 11960 was wrong for
	// anything but a level-73 boss. The model carries the level it was measured against.
	const k = armorConstant(attackerLevel);
	const mitigation = armorDamageReduction(armor, attackerLevel);
	const mitigationDerivative = k / (armor + k) ** 2;

	const healthWeight = 1 / (1 - mitigation);
	const armorWeight = (health * mitigationDerivative) / (1 - mitigation) ** 2;

	return { healthWeight, armorWeight };
};

interface EHPSolveProgress extends SolveProgress {
	ehpIteration: number;
	maxEHPIterations: number;
}

interface EHPSolveResult {
	items: LPItem[];
	effectiveHP: number;
	ehpIterations: number;
	converged: boolean;
}

// Prototype: solves for the gear set maximizing (armor-only) Effective HP, rather than a
// user-supplied linear stat weighting. See linearizedEHPWeights above for the core idea.
export const solveConfigForEHP = async (
	items: InputItem[],
	options: Omit<SolveOptions, "optimizeStats">,
	onProgress?: (progress: EHPSolveProgress) => void,
): Promise<EHPSolveResult> => {
	const MAX_EHP_ITERATIONS = 15;
	// armor totals are integers in practice; a few points of slack avoids spurious
	// non-convergence from float noise while still requiring the guess to actually settle
	const ARMOR_CONVERGENCE_TOLERANCE = 2;

	// seed guess: seeing no armor yet, so the first round is Health-only - a reasonable
	// starting point since Stamina/Health items also tend to carry decent armor budgets
	let armorGuess = 0;
	let healthGuess = 1;

	let result: LPItem[] = [];
	let config: SolverConfiguration | undefined;
	let converged = false;
	let ehpIteration = 0;

	for (; ehpIteration < MAX_EHP_ITERATIONS; ehpIteration++) {
		const { healthWeight, armorWeight } = linearizedEHPWeights(
			armorGuess,
			healthGuess,
			options.linearModel.attackerLevel,
		);

		config = new SolverConfiguration({
			...options,
			optimizeStats: [
				{ name: "Health", value: healthWeight, type: "flat" },
				{ name: "Armor", value: armorWeight, type: "flat" },
			],
		});

		const { fixedItems, decomposableItems } = prepareItemCandidates(
			items,
			config,
			options.itemDatabase,
		);
		if (options.enabledConsumableIds.length > 0) {
			fixedItems.push(
				...getConsumableLPItems(config, options.enabledConsumableIds),
			);
		}

		result = await runLPModelWithAvoidanceConvergence(
			fixedItems,
			decomposableItems,
			config,
			(progress) =>
				onProgress?.({
					...progress,
					ehpIteration,
					maxEHPIterations: MAX_EHP_ITERATIONS,
				}),
		);

		const { armor: newArmor, health: newHealth } = armorAndHealth(
			result,
			config.linearModel,
		);

		if (Math.abs(newArmor - armorGuess) <= ARMOR_CONVERGENCE_TOLERANCE) {
			armorGuess = newArmor;
			healthGuess = newHealth;
			converged = true;
			ehpIteration++;
			break;
		}

		armorGuess = newArmor;
		healthGuess = newHealth;
	}

	// biome-ignore lint/style/noNonNullAssertion: loop always runs at least once (MAX_EHP_ITERATIONS > 0)
	const finalConfig = config!;
	const model = finalConfig.linearModel;
	const { armor, health } = armorAndHealth(result, model);
	// Improved Righteous Fury is a flat multiplier on damage taken, not a stat, so it stacks
	// multiplicatively with armor mitigation rather than adding to it. The armor curve is
	// asymptotic, so the denominator is always strictly positive.
	const damageTaken =
		(1 - armorDamageReduction(armor, model.attackerLevel)) *
		model.physicalDamageTakenMultiplier;
	const effectiveHP = health / damageTaken;

	return { items: result, effectiveHP, ehpIterations: ehpIteration, converged };
};

// Hard avoidance (Dodge% + Parry% + Miss%, excluding Block) is what actually counts toward
// uncrushable. Unlike EHP's armor curve, dodge/parry/miss convert from rating to percent via
// fixed linear divisors in this TBC-era ruleset (see src/data/mechanics.ts) - no diminishing returns -
// so this is a genuinely linear objective and needs no SLP-style iteration, just a single
// weighted-stat solve with these three stats weighted equally.
const HARD_AVOIDANCE_STATS: Stat[] = [
	{ name: "Dodge", value: 1, type: "flat" },
	{ name: "Parry", value: 1, type: "flat" },
	{ name: "Miss", value: 1, type: "flat" },
];

// Maximizing hard avoidance while also holding it to the Avoidance-floor constraint (uncrushable/
// Illidan Shear, which is Block-inclusive and means something different from this objective) is
// redundant and would fight the objective, so that constraint is force-disabled here regardless
// of the caller's uncrushabilitySetting. Uncritability/resistance floors are untouched.
export const solveConfigForHardAvoidance = async (
	items: InputItem[],
	options: Omit<SolveOptions, "optimizeStats">,
	onProgress?: (progress: SolveProgress) => void,
): Promise<LPItem[]> => {
	return solveConfig(
		items,
		{
			...options,
			optimizeStats: HARD_AVOIDANCE_STATS,
			uncrushabilitySetting: 0,
		},
		onProgress,
	);
};

// A "stats" config with nothing weighted is not expressing a weak preference - its objective is
// identically zero, so every feasible gear set ties and glpk returns whichever one branch-and-
// bound happens to reach first. That is bad enough on its own, but it is genuinely harmful under
// dependent configs (solveAll's default): each config's picks are locked into the next one's pool
// carrying their gems, because an item is one physical object and cannot be gemmed two ways. So a
// config that expressed no preference still dictates the gemming for every item it arbitrarily
// grabbed - and because the tie-break is arbitrary, adding ANY item to the pool can reshuffle it
// and silently move every later config's result. Diagnosed from exactly that symptom: an 18-item
// pool scoring worse than its own 17-item subset.
//
// Only "stats" mode is checked. Every other objective mode ignores optimizeStats and computes its
// own weights (see SolverConfiguration.objectiveMode's doc comment).
const assertObjectiveIsWeighted = (options: SolveOptions): void => {
	if (options.objectiveMode !== undefined && options.objectiveMode !== "stats") {
		return;
	}
	const hasWeight = options.optimizeStats.some((stat) => stat.value !== 0);
	if (!hasWeight) {
		throw new Error(
			"No stats are weighted, so every gear set scores the same. Weight at least one stat, " +
				"or pick a different objective mode.",
		);
	}
};

// Single entry point shared by solver.worker.ts and tests that need to exercise objectiveMode
// dispatch without a real Worker: routes to the EHP solve or the plain stat-weight solve based
// on options.objectiveMode, always resolving to the plain LPItem[] shape solveAll/the UI expect.
export const solveGearSet = async (
	items: InputItem[],
	options: SolveOptions,
	onProgress?: (progress: SolveProgress) => void,
): Promise<LPItem[]> => {
	assertObjectiveIsWeighted(options);
	if (options.objectiveMode === "ehp") {
		const result = await solveConfigForEHP(items, options, onProgress);
		return result.items;
	}
	if (options.objectiveMode === "hardAvoidance") {
		return solveConfigForHardAvoidance(items, options, onProgress);
	}
	return solveConfig(items, options, onProgress);
};
