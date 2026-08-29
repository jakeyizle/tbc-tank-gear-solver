import GLPK, { type GLPK as GLPKType, type LP } from "glpk.js";
import { calculateStatValue } from "#/helpers/stats";
import { getConsumableLPItems } from "./consumables";
import { getTransformedItems } from "./items";
import { SolverConfiguration } from "./SolverConfiguration";
import type {
	InputItem,
	LPItem,
	ModifierSource,
	ProcessedItemType,
	ResistanceFloor,
	Stat,
} from "./types";

interface SolveOptions {
	uncrushabilitySetting: number;
	uncritabilitySetting: number;
	optimizeStats: Stat[];
	resistanceFloors: ResistanceFloor[];
	areEnchantsGemsLocked: boolean;
	raceId: string;
	classId: string;
	talentSources: ModifierSource[];
	buffs: ModifierSource[];
	abilitySources: ModifierSource[];
	enabledConsumableIds: string[];
}

const OPTIONAL_TYPES: ProcessedItemType[] = ["Flask", "BattleElixir", "GuardianElixir"];

function typeBoundNumber(type: ProcessedItemType) {
	return type === "Finger" || type === "Trinket" ? 2 : 1;
}

const groupItemsByType = (items: LPItem[]) => {
	return items.reduce(
		(acc, item) => {
			acc[item.type] = [...(acc[item.type] ?? []), item];
			return acc;
		},
		{} as Record<ProcessedItemType, LPItem[]>,
	);
};

const groupItemsByItemId = (items: LPItem[]) => {
	return items.reduce(
		(acc, item) => {
			if (!acc[item.id]) acc[item.id] = [];
			acc[item.id].push(item);
			return acc;
		},
		{} as Record<string, LPItem[]>,
	);
};

const groupUniqueGemCoefsByGemId = (items: LPItem[]) => {
	const result: Record<string, { uniqueId: string; coef: number }[]> = {};
	for (const item of items) {
		const counts = new Map<string, number>();
		for (const gem of item.gems) {
			if (gem.isUnique !== "true") continue;
			counts.set(gem.id, (counts.get(gem.id) ?? 0) + 1);
		}
		for (const [gemId, coef] of counts) {
			result[gemId] ??= [];
			result[gemId].push({ uniqueId: item.uniqueId, coef });
		}
	}
	return result;
};

interface Objective {
	direction: number;
	name: string;
	vars: { name: string; coef: number }[];
}

interface SubjectTo {
	name: string;
	vars: { name: string; coef: number }[];
	bnds: { type: number; ub: number; lb: number };
}

const createModel = (
	objective: Objective,
	subjectTo: SubjectTo[],
	lpItems: LPItem[],
): LP => {
	return {
		name: "wow-gear",
		objective,
		subjectTo,
		binaries: lpItems.map((item) => item.uniqueId),
	};
};

const makeAvoidanceConstraint = (
	lpItems: LPItem[],
	avoidanceTarget: number,
	glpk: GLPKType,
) => {
	return {
		name: "avoidance",
		vars: lpItems.map((item) => ({
			name: item.uniqueId,
			coef: item.avoidanceScore,
		})),
		bnds: {
			type: glpk.GLP_LO,
			lb: avoidanceTarget,
			ub: Number.POSITIVE_INFINITY,
		},
	};
};

const makeUncritableConstraint = (
	lpItems: LPItem[],
	uncritabilityTarget: number,
	glpk: GLPKType,
) => {
	return {
		name: "uncritable",
		vars: lpItems.map((item) => ({
			name: item.uniqueId,
			coef: item.uncritabilityScore,
		})),
		bnds: {
			type: glpk.GLP_LO,
			lb: uncritabilityTarget,
			ub: Number.POSITIVE_INFINITY,
		},
	};
};

const makeResistanceConstraint = (
	lpItems: LPItem[],
	stat: ResistanceFloor["stat"],
	target: number,
	glpk: GLPKType,
) => {
	return {
		name: `resistance_${stat}`,
		vars: lpItems.map((item) => ({
			name: item.uniqueId,
			coef: item.resistanceScores[stat] ?? 0,
		})),
		bnds: {
			type: glpk.GLP_LO,
			lb: target,
			ub: Number.POSITIVE_INFINITY,
		},
	};
};

// each slot can have 1 (or 2 for finger/trinket) items
// flasks/elixirs are optional (0 or up to the bound), unlike mandatory gear slots
const makeSlotConstraint = (
	itemsByType: Record<ProcessedItemType, LPItem[]>,
	glpk: GLPKType,
) => {
	return Object.entries(itemsByType).map(([type, items]) => {
		const bound = typeBoundNumber(type as ProcessedItemType);
		const isOptional = OPTIONAL_TYPES.includes(type as ProcessedItemType);
		return {
			name: `type_${type}`,
			vars: items.map((item) => ({
				name: item.uniqueId,
				coef: 1,
			})),
			// TODO: fix type cast
			bnds: isOptional
				? { type: glpk.GLP_UP, lb: 0, ub: bound }
				: { type: glpk.GLP_FX, lb: bound, ub: bound },
		};
	});
};

// a flask replaces both elixirs, so a flask can't be combined with either elixir type
const makeConsumableExclusionConstraint = (
	itemsByType: Record<ProcessedItemType, LPItem[]>,
	glpk: GLPKType,
): SubjectTo[] => {
	const flaskVars = (itemsByType.Flask ?? []).map((item) => ({
		name: item.uniqueId,
		coef: 1,
	}));
	if (flaskVars.length === 0) return [];

	const guardianVars = (itemsByType.GuardianElixir ?? []).map((item) => ({
		name: item.uniqueId,
		coef: 1,
	}));
	const battleVars = (itemsByType.BattleElixir ?? []).map((item) => ({
		name: item.uniqueId,
		coef: 1,
	}));

	return [
		{
			name: "flask_vs_guardian_elixir",
			vars: [...flaskVars, ...guardianVars],
			bnds: { type: glpk.GLP_UP, lb: 0, ub: 1 },
		},
		{
			name: "flask_vs_battle_elixir",
			vars: [...flaskVars, ...battleVars],
			bnds: { type: glpk.GLP_UP, lb: 0, ub: 1 },
		},
	];
};

// each item base can only be used once - otherwise multiple rings will be used
const makeBaseItemConstaint = (
	itemsByItemId: Record<string, LPItem[]>,
	glpk: GLPKType,
) => {
	return Object.entries(itemsByItemId).map(([id, items]) => ({
		name: `unique_${id}`,
		vars: items.map((item) => ({
			name: item.uniqueId,
			coef: 1,
		})),
		bnds: { type: glpk.GLP_UP, ub: 1, lb: 0 },
	}));
};

// the same Unique-Equipped gem can only be socketed once across the whole gear set
const makeUniqueGemConstraint = (
	gemCoefsByGemId: Record<string, { uniqueId: string; coef: number }[]>,
	glpk: GLPKType,
) => {
	return Object.entries(gemCoefsByGemId).map(([gemId, vars]) => ({
		name: `unique_gem_${gemId}`,
		vars: vars.map(({ uniqueId, coef }) => ({ name: uniqueId, coef })),
		bnds: { type: glpk.GLP_UP, ub: 1, lb: 0 },
	}));
};

const solveOptions = (glpk: GLPKType) => ({
	msglev: glpk.GLP_MSG_ON,
	mipgap: 0.0,
});

const runLPModel = async (
	lpItems: LPItem[],
	avoidanceTarget: number,
	uncritabilityTarget: number,
	resistanceTargets: { stat: ResistanceFloor["stat"]; target: number }[],
) => {
	const glpk = await GLPK();
	const itemsByType = groupItemsByType(lpItems);
	const itemsByItemId = groupItemsByItemId(lpItems);

	const objective = {
		direction: glpk.GLP_MAX,
		name: "obj",
		vars: lpItems.map((item) => ({
			name: item.uniqueId,
			coef: item.objectiveScore,
		})),
	};

	const slotConstraint = makeSlotConstraint(itemsByType, glpk);
	const baseItemConstraint = makeBaseItemConstaint(itemsByItemId, glpk);
	const gemCoefsByGemId = groupUniqueGemCoefsByGemId(lpItems);
	const uniqueGemConstraint = makeUniqueGemConstraint(gemCoefsByGemId, glpk);
	const consumableExclusionConstraint = makeConsumableExclusionConstraint(
		itemsByType,
		glpk,
	);

	const constraints: SubjectTo[] = [
		...slotConstraint,
		...baseItemConstraint,
		...uniqueGemConstraint,
		...consumableExclusionConstraint,
	];

	if (avoidanceTarget > 0) {
		const avoidanceConstaint = makeAvoidanceConstraint(
			lpItems,
			avoidanceTarget,
			glpk,
		);
		constraints.push(avoidanceConstaint);
	}

	if (uncritabilityTarget > 0) {
		const uncritableConstraint = makeUncritableConstraint(
			lpItems,
			uncritabilityTarget,
			glpk,
		);
		constraints.push(uncritableConstraint);
	}

	for (const { stat, target } of resistanceTargets) {
		if (target <= 0) continue;
		constraints.push(makeResistanceConstraint(lpItems, stat, target, glpk));
	}

	const avoidanceModel = createModel(objective, constraints, lpItems);

	let result = await glpk.solve(avoidanceModel, solveOptions(glpk));
	if (result.result.status !== glpk.GLP_OPT) {
		console.error(
			"GLPK failed to find an optimal solution, trying to find best result...",
		);

		const avoidanceObjective = {
			direction: glpk.GLP_MAX,
			name: "obj",
			vars: lpItems.map((item) => ({
				name: item.uniqueId,
				coef: item.avoidanceScore,
			})),
		};
		const bestAvoidanceTryModel = createModel(
			avoidanceObjective,
			[
				...slotConstraint,
				...baseItemConstraint,
				...uniqueGemConstraint,
				...consumableExclusionConstraint,
			],
			lpItems,
		);
		result = await glpk.solve(bestAvoidanceTryModel, solveOptions(glpk));
	}

	const chosenItems = Object.entries(result.result.vars)
		.filter(([_, value]) => value === 1)
		.map(([uniqueId]) => lpItems.find((item) => item.uniqueId === uniqueId))
		.filter((item) => !!item);    

	return chosenItems;
};

self.onmessage = async (e) => {
	console.log("worker started");
	console.log(e.data);
	const { items, options } = e.data as {
		items: InputItem[];
		options: SolveOptions;
	};

	const config = new SolverConfiguration(options);
	const lpItems = getTransformedItems(items, config);
	if (options.enabledConsumableIds.length > 0) {
		lpItems.push(...getConsumableLPItems(config, options.enabledConsumableIds));
	}
	console.log(`avoidance target: ${config.avoidanceTarget}`);
	console.log(`uncritability target: ${config.uncritabilityTarget}`);
	console.log(`items: ${lpItems.length}`);

	// defense skill is rounded down in game, but the LP solver cannot account for this so it does not round values
	// so the total avoidance/uncritability can be off by up to 1 defense skill, which is 0.16 avoidance or 0.04 uncrit
	// we step by half of the maximum error
	const AVOIDANCE_STEP = 0.16 / 2;
	const UNCRIT_STEP = 0.04 / 2;

	let result: LPItem[];
	while (true) {
		result = await runLPModel(
			lpItems,
			config.avoidanceTarget,
			config.uncritabilityTarget,
			config.resistanceTargets,
		);

		const itemAvoidance = calculateStatValue({
			items: result,
			modifierSources: config.multiplierModifierSources,
			baseStats: [],
			statName: config.avoidanceStatName,
			roundDefenseAndResilience: true,
		});
		const itemUncrit = calculateStatValue({
			items: result,
			modifierSources: config.multiplierModifierSources,
			baseStats: [],
			statName: "Uncritability",
			roundDefenseAndResilience: true,
		});

		const isAvoidanceTargetMet = itemAvoidance >= config.avoidanceTarget;
		const isUncritTargetMet = itemUncrit >= config.uncritabilityTarget;
		if (isAvoidanceTargetMet && isUncritTargetMet) {
			break;
		}

		console.log(`item avoidance: ${itemAvoidance}, avoidance target: ${config.avoidanceTarget}`);
		console.log(`item uncrit: ${itemUncrit}, uncrit target: ${config.uncritabilityTarget}`);
		if (!isAvoidanceTargetMet) {
			config.stepAvoidanceTarget(AVOIDANCE_STEP);
		}
		if (!isUncritTargetMet) {
			config.stepUncritabilityTarget(UNCRIT_STEP);
		}
	}

	postMessage(result);
};
