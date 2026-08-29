import type { GLPK as GLPKType } from "glpk.js";
import { gemColorMatches, type GemColor, type SocketColor } from "./socketBonus";
import type {
	DecomposableItem,
	Enchant,
	Gem,
	LPItem,
	ProcessedItemType,
	ResistanceFloor,
	ScoreAxis,
} from "./types";

export interface LPVar {
	name: string;
	coef: number;
}

export interface SubjectTo {
	name: string;
	vars: LPVar[];
	bnds: { type: number; ub: number; lb: number };
}

// item-level binary identity shared by fixed LPItems and decomposable item headers -
// enough for constraints that only care "is this item equipped" (slot/base-item/consumable)
export interface ItemHeader {
	uniqueId: string;
	id: string;
	type: ProcessedItemType;
}

export const allItemHeaders = (
	fixedItems: LPItem[],
	decomposableItems: DecomposableItem[],
): ItemHeader[] => [
	...fixedItems.map((item) => ({ uniqueId: item.uniqueId, id: item.id, type: item.type })),
	...decomposableItems.map((item) => ({
		uniqueId: item.uniqueId,
		id: item.base.id,
		type: item.processedType,
	})),
];

// every binary decision variable in the model: item-level (fixed + decomposable), plus
// each decomposable item's enchant/gem/socket-bonus candidates
export const allBinaryVarNames = (
	fixedItems: LPItem[],
	decomposableItems: DecomposableItem[],
): string[] => {
	const names: string[] = fixedItems.map((item) => item.uniqueId);
	for (const item of decomposableItems) {
		names.push(item.uniqueId);
		for (const enchant of item.enchantCandidates) names.push(enchant.varName);
		for (const socket of item.sockets) {
			for (const gem of socket.candidates) names.push(gem.varName);
		}
		if (item.bonusVarName) names.push(item.bonusVarName);
	}
	return names;
};

// coefficient rows for one score axis (objective/avoidance/uncrit), across every variable
export const buildScoreVars = (
	fixedItems: LPItem[],
	decomposableItems: DecomposableItem[],
	axis: ScoreAxis,
): LPVar[] => {
	const vars: LPVar[] = [];
	for (const item of fixedItems) {
		vars.push({ name: item.uniqueId, coef: item[axis] });
	}
	for (const item of decomposableItems) {
		vars.push({ name: item.uniqueId, coef: item.itemScores[axis] });
		for (const enchant of item.enchantCandidates) {
			vars.push({ name: enchant.varName, coef: enchant.scores[axis] });
		}
		for (const socket of item.sockets) {
			for (const gem of socket.candidates) {
				vars.push({ name: gem.varName, coef: gem.scores[axis] });
			}
		}
		if (item.bonusVarName && item.bonusScores) {
			vars.push({ name: item.bonusVarName, coef: item.bonusScores[axis] });
		}
	}
	return vars;
};

export const buildResistanceVars = (
	fixedItems: LPItem[],
	decomposableItems: DecomposableItem[],
	stat: ResistanceFloor["stat"],
): LPVar[] => {
	const vars: LPVar[] = [];
	for (const item of fixedItems) {
		vars.push({ name: item.uniqueId, coef: item.resistanceScores[stat] ?? 0 });
	}
	for (const item of decomposableItems) {
		vars.push({ name: item.uniqueId, coef: item.itemScores.resistanceScores[stat] ?? 0 });
		for (const enchant of item.enchantCandidates) {
			vars.push({ name: enchant.varName, coef: enchant.scores.resistanceScores[stat] ?? 0 });
		}
		for (const socket of item.sockets) {
			for (const gem of socket.candidates) {
				vars.push({ name: gem.varName, coef: gem.scores.resistanceScores[stat] ?? 0 });
			}
		}
		if (item.bonusVarName && item.bonusScores) {
			vars.push({ name: item.bonusVarName, coef: item.bonusScores.resistanceScores[stat] ?? 0 });
		}
	}
	return vars;
};

// the same Unique-Equipped gem can only be socketed once across the whole gear set - one
// global cap per gem id subsumes both intra-item and cross-item repeats
export const buildUniqueGemVars = (
	fixedItems: LPItem[],
	decomposableItems: DecomposableItem[],
): Record<string, LPVar[]> => {
	const result: Record<string, LPVar[]> = {};

	for (const item of fixedItems) {
		const counts = new Map<string, number>();
		for (const gem of item.gems) {
			if (gem.isUnique !== "true") continue;
			counts.set(gem.id, (counts.get(gem.id) ?? 0) + 1);
		}
		for (const [gemId, coef] of counts) {
			result[gemId] ??= [];
			result[gemId].push({ name: item.uniqueId, coef });
		}
	}

	for (const item of decomposableItems) {
		for (const socket of item.sockets) {
			for (const gem of socket.candidates) {
				if (gem.gem.isUnique !== "true") continue;
				result[gem.gem.id] ??= [];
				result[gem.gem.id].push({ name: gem.varName, coef: 1 });
			}
		}
	}

	return result;
};

// links each decomposable item's y[item] to its enchant/gem sub-choices, and linearizes
// the socket-bonus indicator - see plan doc for the correctness argument (no lower-bound
// row is needed: b never has a negative coefficient anywhere in the model, so the solver
// always has incentive to push it up to min(satisfied_i) on its own)
export const buildDecomposedLinkingConstraints = (
	decomposableItems: DecomposableItem[],
	glpk: GLPKType,
): SubjectTo[] => {
	const rows: SubjectTo[] = [];

	for (const item of decomposableItems) {
		if (item.enchantCandidates.length > 0) {
			rows.push({
				name: `enchant_link_${item.uniqueId}`,
				vars: [
					...item.enchantCandidates.map((enchant) => ({ name: enchant.varName, coef: 1 })),
					{ name: item.uniqueId, coef: -1 },
				],
				bnds: { type: glpk.GLP_FX, lb: 0, ub: 0 },
			});
		}

		for (const socket of item.sockets) {
			rows.push({
				name: `socket_link_${item.uniqueId}_${socket.socketIndex}`,
				vars: [
					...socket.candidates.map((gem) => ({ name: gem.varName, coef: 1 })),
					{ name: item.uniqueId, coef: -1 },
				],
				bnds: { type: glpk.GLP_FX, lb: 0, ub: 0 },
			});
		}

		if (item.bonusVarName) {
			for (const socket of item.sockets) {
				if (socket.color === "Meta") continue;
				const matchingColors = gemColorMatches[socket.color as SocketColor];
				const matchingVars = socket.candidates
					.filter((gem) => matchingColors.includes(gem.gem.color as GemColor))
					.map((gem) => ({ name: gem.varName, coef: 1 }));
				rows.push({
					name: `bonus_${item.uniqueId}_${socket.socketIndex}`,
					vars: [...matchingVars, { name: item.bonusVarName, coef: -1 }],
					bnds: { type: glpk.GLP_LO, lb: 0, ub: Number.POSITIVE_INFINITY },
				});
			}
		}
	}

	return rows;
};

// after GLPK solves, turn the chosen y/e/g/b variable values back into concrete
// (enchant, per-socket gem) selections for each chosen decomposable item, so callers can
// build ItemVariation objects and score them through the existing transformItem
export interface ResolvedDecomposableItem {
	base: DecomposableItem["base"];
	uniqueId: string;
	enchant: Enchant | undefined;
	gems: Gem[];
}

export const resolveChosenDecomposableItems = (
	decomposableItems: DecomposableItem[],
	varValues: Record<string, number>,
): ResolvedDecomposableItem[] => {
	const chosen: ResolvedDecomposableItem[] = [];

	for (const item of decomposableItems) {
		if (varValues[item.uniqueId] !== 1) continue;

		const chosenEnchant = item.enchantCandidates.find(
			(enchant) => varValues[enchant.varName] === 1,
		);

		const gems: Gem[] = [];
		for (const socket of item.sockets) {
			const chosenGem = socket.candidates.find((gem) => varValues[gem.varName] === 1);
			if (chosenGem) gems.push(chosenGem.gem);
		}

		chosen.push({
			base: item.base,
			uniqueId: item.uniqueId,
			enchant: chosenEnchant?.enchant,
			gems,
		});
	}

	return chosen;
};
