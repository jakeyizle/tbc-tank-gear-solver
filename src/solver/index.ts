import { calculateStatValue } from "#/helpers.ts/stats";
import type { BaseConfig, SolveResult, SolverConfiguration as UISolverConfiguration } from "#/types/SolverConfig";
import { getTransformedItems } from "./items";
import { SolverConfiguration } from "./SolverConfiguration";
import type { InputItem, LPItem, ModifierSource, Stat } from "./types";

interface SolveOptions {
	uncrushabilitySetting: number;
	uncritabilitySetting: number;
	optimizeStats: Stat[];
	areEnchantsGemsLocked: boolean;
	raceId: string;
	classId: string;
	talentSources: ModifierSource[];
	buffs: ModifierSource[];
	abilitySources: ModifierSource[];
}

export const solve = async (
	items: InputItem[],
	options: SolveOptions,
): Promise< LPItem[]> => {
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL("./solver.worker.ts", import.meta.url), {
			type: "module",
		});
		const config = new SolverConfiguration(options);
		const lpItems = getTransformedItems(items, config);
		console.log(`avoidance target: ${config.avoidanceTarget}`);
		console.log(`uncritability target: ${config.uncritabilityTarget}`);
		console.log(`items: ${lpItems.length}`);

		worker.onmessage = (e) => {
			console.log("worker result");

			const items = e.data as LPItem[];
			const itemAvoidance = calculateStatValue({
				items,
				modifierSources: config.multiplierModifierSources,
				baseStats: [],
				statName: "Avoidance",
				roundDefenseAndResilience: true,
			});
			const itemUncrit = calculateStatValue({
				items,
				modifierSources: config.multiplierModifierSources,
				baseStats: [],
				statName: "Uncritability",
				roundDefenseAndResilience: true,
			});

			const isAvoidanceTargetMet = itemAvoidance >= config.avoidanceTarget;
			const isUncritTargetMet = itemUncrit >= config.uncritabilityTarget;
			if (!isAvoidanceTargetMet || !isUncritTargetMet) {
				// defense skill is rounded down in game, but the LP solver cannot account for this so it does not round values
				// so the total avoidance/uncritability can be off by up to 1 defense skill, which is 0.16 avoidance or 0.04 uncrit
				// we step by half of the maximum error
				console.log(`item avoidance: ${itemAvoidance}, avoidance target: ${config.avoidanceTarget}`);
				console.log(`item uncrit: ${itemUncrit}, uncrit target: ${config.uncritabilityTarget}`);
				const AVOIDANCE_STEP = 0.16 / 2;
				const UNCRIT_STEP = 0.04 / 2;
				if (!isAvoidanceTargetMet) {
					config.stepAvoidanceTarget(AVOIDANCE_STEP);
				}
				if (!isUncritTargetMet) {
					config.stepUncritabilityTarget(UNCRIT_STEP);
				}

				worker.postMessage({
					lpItems,
					avoidanceTarget: config.avoidanceTarget,
					uncritabilityTarget: config.uncritabilityTarget,
				});
			} else {
				resolve(items);
			}
		};

		worker.onerror = (e) => {
			console.error(e);
			reject(e);
		};

		worker.postMessage({
			lpItems,
			avoidanceTarget: config.avoidanceTarget,
			uncritabilityTarget: config.uncritabilityTarget,
		});
	});

	// TEMP: experiment with worker
	/*
	let solvedItems = await runLPModel(lpItems, config.avoidanceTarget, config.uncritabilityTarget);
	let solvedAvoidance = getAvoidanceFromItems(solvedItems);
	let index = 0;
	while (solvedAvoidance < config.avoidanceTarget) {
		console.error(`Target not met, trying again with a higher target - solvedAvoidance: ${solvedAvoidance}, config.avoidanceTarget: ${config.avoidanceTarget}, lpAvoidance - ${solvedItems.reduce((acc, item) => item.avoidanceScore + acc, 0)}`);
		// when defense rating is converted to defense skill, it is floored - there are no partial skill values
		// so in reality an item that provides defense rating provides a variable amount of defense skill
		// but the LP solver can't deal with that - it needs each item to provide a constant amount of avoidance
		// this means that the LP can think it has up to 0.16 more avoidance than it actually does (up to 1 defense skill - 0.04% miss/block/parry/dodge)
		// so we need to validate the results by correctly calculating avoidance and verifying that it actually meets the target
		// and if it doesn't, let's try again but bump the target up slightly
		const THEORETICAL_MAX_ERROR = 0.16;
		// want this to be small, but not so small we have to run a bunch of times
		const STEP_SIZE = THEORETICAL_MAX_ERROR / 2; 
		const newAvoidanceTarget = config.avoidanceTarget + STEP_SIZE*index;
		solvedItems = await runLPModel(lpItems, newAvoidanceTarget, config.uncritabilityTarget);
		solvedAvoidance = getAvoidanceFromItems(solvedItems);
		index++;	
	}	
		
	return {items: solvedItems, baseAvoidance: config.baseAvoidance, baseUncritability: config.baseUncritability};
	*/
};

// interface SolverResult {
// 	items: LPItem[];
// 	id: string;
// 	name: string;
// 	baseConfig: BaseConfig;
// 	solverConfig: UISolverConfiguration
// }

export const solveAll = async (
	items: InputItem[],
	baseConfig: BaseConfig,
	solverConfigs: UISolverConfiguration[],
): Promise<SolveResult[]> => {
	// the idea here is to solve in order
	// the items that are selected are locked, and no variants for those items will be generated for the next configs
	const solverResults: SolveResult[] = [];
	let currentInputItems: InputItem[] = items.map((item) => {
		return { ...item, locked: baseConfig.areEnchantsGemsLocked };
	});

	for (const solverConfig of solverConfigs) {
		const items = await solve(currentInputItems, {
			...baseConfig,
			...solverConfig,
		});
		solverResults.push({
			items,
			id: solverConfig.id,
			name: solverConfig.name,
			baseConfig,
			solverConfig
		});

		currentInputItems = replaceInputItems(currentInputItems, items);
	}

	return solverResults;
};

const replaceInputItems = (
	inputItems: InputItem[],
	lockedItems: LPItem[],
): InputItem[] => {
	let newInputItems = [...inputItems];
	for (const lockedItem of lockedItems) {
		const originalItem = inputItems.find((item) => item.id === lockedItem.id);
		if (!originalItem) continue;

		const newItem: InputItem = {
			...lockedItem,
			gems: lockedItem.gems.map((gem) => gem.id),
			enchant: lockedItem.enchant ? lockedItem.enchant.id : undefined,
			locked: true,
		};

		newInputItems = newInputItems.map((item) => {
			if (item.id === originalItem.id) {
				return newItem;
			}
			return item;
		});
	}

	return newInputItems;
};
