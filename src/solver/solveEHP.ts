import { calculateStatValue } from "#/helpers/stats";
import { getConsumableLPItems } from "./consumables";
import { prepareItemCandidates } from "./items";
import { SolverConfiguration } from "./SolverConfiguration";
import {
	runLPModelWithAvoidanceConvergence,
	type SolveOptions,
	type SolveProgress,
	solveConfig,
} from "./solveConfig";
import type { InputItem, LPItem, Stat } from "./types";

// Same armor mitigation constant used by convertStat.ts's Armor conversion (EHP = Health / (1 - armor/(armor+K))).
const ARMOR_MITIGATION_K = 11960;

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
const linearizedEHPWeights = (armor: number, health: number) => {
	const mitigation = armor / (armor + ARMOR_MITIGATION_K);
	const mitigationDerivative =
		ARMOR_MITIGATION_K / (armor + ARMOR_MITIGATION_K) ** 2;

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

		const newArmor = calculateStatValue({
			items: result,
			modifierSources: config.multiplierModifierSources,
			baseStats: config.baseStats,
			statName: "Armor",
		});
		const newHealth = calculateStatValue({
			items: result,
			modifierSources: config.multiplierModifierSources,
			baseStats: config.baseStats,
			statName: "TotalHealth",
		});

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
	const effectiveHP = calculateStatValue({
		items: result,
		modifierSources: finalConfig.multiplierModifierSources,
		baseStats: finalConfig.baseStats,
		statName: "Effective HP",
	});

	return { items: result, effectiveHP, ehpIterations: ehpIteration, converged };
};

// Hard avoidance (Dodge% + Parry% + Miss%, excluding Block) is what actually counts toward
// uncrushable. Unlike EHP's armor curve, dodge/parry/miss convert from rating to percent via
// fixed linear divisors in this TBC-era ruleset (see convertStat.ts) - no diminishing returns -
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

// Single entry point shared by solver.worker.ts and tests that need to exercise objectiveMode
// dispatch without a real Worker: routes to the EHP solve or the plain stat-weight solve based
// on options.objectiveMode, always resolving to the plain LPItem[] shape solveAll/the UI expect.
export const solveGearSet = async (
	items: InputItem[],
	options: SolveOptions,
	onProgress?: (progress: SolveProgress) => void,
): Promise<LPItem[]> => {
	if (options.objectiveMode === "ehp") {
		const result = await solveConfigForEHP(items, options, onProgress);
		return result.items;
	}
	if (options.objectiveMode === "hardAvoidance") {
		return solveConfigForHardAvoidance(items, options, onProgress);
	}
	return solveConfig(items, options, onProgress);
};
