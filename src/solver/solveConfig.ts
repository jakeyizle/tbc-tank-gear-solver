import GLPK, { type GLPK as GLPKType, type LP } from "glpk.js";
import { calculateStatValue } from "#/helpers/stats";
import { getConsumableLPItems } from "./consumables";
import {
	allBinaryVarNames,
	allItemHeaders,
	buildDecomposedLinkingConstraints,
	buildResistanceVars,
	buildScoreVars,
	buildUniqueGemVars,
	resolveChosenDecomposableItems,
	type ItemHeader,
	type LPVar,
	type SubjectTo,
} from "./decomposedModel";
import { prepareItemCandidates, transformItem } from "./items";
import { SolverConfiguration } from "./SolverConfiguration";
import type {
	DecomposableItem,
	Enchant,
	InputItem,
	LPItem,
	ModifierSource,
	ProcessedItemType,
	ResistanceFloor,
	Stat,
} from "./types";

export interface SolveOptions {
	uncrushabilitySetting: number;
	uncritabilitySetting: number;
	optimizeStats: Stat[];
	resistanceFloors: ResistanceFloor[];
	areEnchantsGemsLocked: boolean;
	excludeUniqueGems: boolean;
	phase: number;
	raceId: string;
	classId: string;
	talentSources: ModifierSource[];
	buffs: ModifierSource[];
	abilitySources: ModifierSource[];
	enabledConsumableIds: string[];
}

export interface SolveProgress {
	iteration: number;
	maxIterations: number;
}

const OPTIONAL_TYPES: ProcessedItemType[] = ["Flask", "BattleElixir", "GuardianElixir"];

function typeBoundNumber(type: ProcessedItemType) {
	return type === "Finger" || type === "Trinket" ? 2 : 1;
}

const groupHeadersByType = (headers: ItemHeader[]) => {
	return headers.reduce(
		(acc, header) => {
			acc[header.type] = [...(acc[header.type] ?? []), header];
			return acc;
		},
		{} as Record<ProcessedItemType, ItemHeader[]>,
	);
};

const groupHeadersByItemId = (headers: ItemHeader[]) => {
	return headers.reduce(
		(acc, header) => {
			if (!acc[header.id]) acc[header.id] = [];
			acc[header.id].push(header);
			return acc;
		},
		{} as Record<string, ItemHeader[]>,
	);
};

interface Objective {
	direction: number;
	name: string;
	vars: LPVar[];
}

const createModel = (
	objective: Objective,
	subjectTo: SubjectTo[],
	binaries: string[],
): LP => {
	return {
		name: "wow-gear",
		objective,
		subjectTo,
		binaries,
	};
};

const makeAvoidanceConstraint = (vars: LPVar[], avoidanceTarget: number, glpk: GLPKType) => {
	return {
		name: "avoidance",
		vars,
		bnds: {
			type: glpk.GLP_LO,
			lb: avoidanceTarget,
			ub: Number.POSITIVE_INFINITY,
		},
	};
};

const makeUncritableConstraint = (vars: LPVar[], uncritabilityTarget: number, glpk: GLPKType) => {
	return {
		name: "uncritable",
		vars,
		bnds: {
			type: glpk.GLP_LO,
			lb: uncritabilityTarget,
			ub: Number.POSITIVE_INFINITY,
		},
	};
};

const makeResistanceConstraint = (
	vars: LPVar[],
	stat: ResistanceFloor["stat"],
	target: number,
	glpk: GLPKType,
) => {
	return {
		name: `resistance_${stat}`,
		vars,
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
	headersByType: Record<ProcessedItemType, ItemHeader[]>,
	glpk: GLPKType,
) => {
	return Object.entries(headersByType).map(([type, headers]) => {
		const bound = typeBoundNumber(type as ProcessedItemType);
		const isOptional = OPTIONAL_TYPES.includes(type as ProcessedItemType);
		return {
			name: `type_${type}`,
			vars: headers.map((header) => ({
				name: header.uniqueId,
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
	headersByType: Record<ProcessedItemType, ItemHeader[]>,
	glpk: GLPKType,
): SubjectTo[] => {
	const flaskVars = (headersByType.Flask ?? []).map((header) => ({
		name: header.uniqueId,
		coef: 1,
	}));
	if (flaskVars.length === 0) return [];

	const guardianVars = (headersByType.GuardianElixir ?? []).map((header) => ({
		name: header.uniqueId,
		coef: 1,
	}));
	const battleVars = (headersByType.BattleElixir ?? []).map((header) => ({
		name: header.uniqueId,
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
	headersByItemId: Record<string, ItemHeader[]>,
	glpk: GLPKType,
) => {
	return Object.entries(headersByItemId).map(([id, headers]) => ({
		name: `unique_${id}`,
		vars: headers.map((header) => ({
			name: header.uniqueId,
			coef: 1,
		})),
		bnds: { type: glpk.GLP_UP, ub: 1, lb: 0 },
	}));
};

// the same Unique-Equipped gem can only be socketed once across the whole gear set
const makeUniqueGemConstraint = (
	gemVarsByGemId: Record<string, LPVar[]>,
	glpk: GLPKType,
) => {
	return Object.entries(gemVarsByGemId).map(([gemId, vars]) => ({
		name: `unique_gem_${gemId}`,
		vars,
		bnds: { type: glpk.GLP_UP, ub: 1, lb: 0 },
	}));
};

const solveOptions = (glpk: GLPKType) => ({
	msglev: glpk.GLP_MSG_ON,
	mipgap: 0.0,
});

const describeConstraints = (config: SolverConfiguration): string => {
	const parts: string[] = [];
	if (config.avoidanceTarget > 0) {
		parts.push(`${config.avoidanceStatName} target ${config.avoidanceTarget.toFixed(2)}`);
	}
	if (config.uncritabilityTarget > 0) {
		parts.push(`Uncritability target ${config.uncritabilityTarget.toFixed(2)}`);
	}
	for (const { stat, target } of config.resistanceTargets) {
		if (target > 0) {
			parts.push(`${stat} resistance target ${target.toFixed(2)}`);
		}
	}
	return parts.length > 0 ? parts.join(", ") : "the configured constraints";
};

const EMPTY_ENCHANT: Enchant = { name: "", id: "", effectID: "", type: "Ranged", stats: [] };

const runLPModel = async (
	fixedItems: LPItem[],
	decomposableItems: DecomposableItem[],
	avoidanceTarget: number,
	uncritabilityTarget: number,
	resistanceTargets: { stat: ResistanceFloor["stat"]; target: number }[],
	config: SolverConfiguration,
) => {
	const glpk = await GLPK();
	const headers = allItemHeaders(fixedItems, decomposableItems);
	const headersByType = groupHeadersByType(headers);
	const headersByItemId = groupHeadersByItemId(headers);
	const binaries = allBinaryVarNames(fixedItems, decomposableItems);

	const objective = {
		direction: glpk.GLP_MAX,
		name: "obj",
		vars: buildScoreVars(fixedItems, decomposableItems, "objectiveScore"),
	};

	const slotConstraint = makeSlotConstraint(headersByType, glpk);
	const baseItemConstraint = makeBaseItemConstaint(headersByItemId, glpk);
	const uniqueGemVars = buildUniqueGemVars(fixedItems, decomposableItems);
	const uniqueGemConstraint = makeUniqueGemConstraint(uniqueGemVars, glpk);
	const consumableExclusionConstraint = makeConsumableExclusionConstraint(headersByType, glpk);
	const linkingConstraints = buildDecomposedLinkingConstraints(decomposableItems, glpk);

	const constraints: SubjectTo[] = [
		...slotConstraint,
		...baseItemConstraint,
		...uniqueGemConstraint,
		...consumableExclusionConstraint,
		...linkingConstraints,
	];

	if (avoidanceTarget > 0) {
		constraints.push(
			makeAvoidanceConstraint(
				buildScoreVars(fixedItems, decomposableItems, "avoidanceScore"),
				avoidanceTarget,
				glpk,
			),
		);
	}

	if (uncritabilityTarget > 0) {
		constraints.push(
			makeUncritableConstraint(
				buildScoreVars(fixedItems, decomposableItems, "uncritabilityScore"),
				uncritabilityTarget,
				glpk,
			),
		);
	}

	for (const { stat, target } of resistanceTargets) {
		if (target <= 0) continue;
		constraints.push(
			makeResistanceConstraint(
				buildResistanceVars(fixedItems, decomposableItems, stat),
				stat,
				target,
				glpk,
			),
		);
	}

	const model = createModel(objective, constraints, binaries);

	const result = await glpk.solve(model, solveOptions(glpk));
	if (result.result.status !== glpk.GLP_OPT) {
		throw new Error(
			`No gear combination satisfies: ${describeConstraints(config)}.`,
		);
	}

	const varValues = result.result.vars as Record<string, number>;

	const chosenFixedItems = fixedItems.filter((item) => varValues[item.uniqueId] === 1);
	const chosenDecomposable = resolveChosenDecomposableItems(decomposableItems, varValues).map(
		(resolved) =>
			transformItem(
				{
					...resolved.base,
					gems: resolved.gems,
					gemSlots: resolved.gemSlots,
					enchant: resolved.enchant ?? EMPTY_ENCHANT,
					uniqueId: resolved.uniqueId,
					locked: false,
				},
				config,
			),
	);

	return [...chosenFixedItems, ...chosenDecomposable];
};

export const solveConfig = async (
	items: InputItem[],
	options: SolveOptions,
	onProgress?: (progress: SolveProgress) => void,
): Promise<LPItem[]> => {
	console.log("worker started");
	console.log({ items, options });

	const config = new SolverConfiguration(options);
	const { fixedItems, decomposableItems } = prepareItemCandidates(items, config);
	if (options.enabledConsumableIds.length > 0) {
		fixedItems.push(...getConsumableLPItems(config, options.enabledConsumableIds));
	}
	console.log(`avoidance target: ${config.avoidanceTarget}`);
	console.log(`uncritability target: ${config.uncritabilityTarget}`);
	console.log(`items: ${fixedItems.length + decomposableItems.length}`);

	// defense skill is rounded down in game, but the LP solver cannot account for this so it does not round values
	// so the total avoidance/uncritability can be off by up to 1 defense skill, which is 0.16 avoidance or 0.04 uncrit
	// we step by half of the maximum error
	const AVOIDANCE_STEP = 0.16 / 2;
	const UNCRIT_STEP = 0.04 / 2;
	const MAX_AVOIDANCE_ROUNDING_ERROR = 0.16;
	const MAX_UNCRIT_ROUNDING_ERROR = 0.04;
	// worst case, each step closes the gap left by rounding error; add a small safety margin
	// since this is not a hard guarantee, just an expectation based on the rounding error bound above
	const maxIterations =
		Math.max(
			Math.ceil(MAX_AVOIDANCE_ROUNDING_ERROR / AVOIDANCE_STEP),
			Math.ceil(MAX_UNCRIT_ROUNDING_ERROR / UNCRIT_STEP),
		) + 3;

	let result: LPItem[];
	let iteration = 0;
	while (true) {
		iteration++;
		result = await runLPModel(
			fixedItems,
			decomposableItems,
			config.avoidanceTarget,
			config.uncritabilityTarget,
			config.resistanceTargets,
			config,
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

		onProgress?.({ iteration, maxIterations });
	}

	return result;
};
