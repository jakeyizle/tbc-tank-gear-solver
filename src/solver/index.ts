import type { SolverConfiguration as UISolverConfiguration } from "#/types/SolverConfig";
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
	buffSources: ModifierSource[];
	abilitySources: ModifierSource[];
}

export const solve = async (
	items: InputItem[],
	options: SolveOptions,
): Promise<{
	items: LPItem[];
	baseAvoidance: number;
	baseUncritability: number;
}> => {
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
			resolve({
				items,
				baseAvoidance: config.baseAvoidance,
				baseUncritability: config.baseUncritability,
			});
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

interface BaseConfig {
	areEnchantsGemsLocked: boolean;
	raceId: string;
	classId: string;
	abilitySources: ModifierSource[];
	talentSources: ModifierSource[];
	buffSources: ModifierSource[];
}

interface SolverResult {
	items: LPItem[];
	baseAvoidance: number;
	baseUncritability: number;
	id: string;
	name: string;
}

export const solveAll = async (
	items: InputItem[],
	baseConfig: BaseConfig,
	solverConfigs: UISolverConfiguration[],
): Promise<SolverResult[]> => {
	// the idea here is to solve in order
	// the items that are selected are locked, and no variants for those items will be generated for the next configs
	const solverResults: SolverResult[] = [];
	let currentInputItems: InputItem[] = items.map((item) => {
		return { ...item, locked: baseConfig.areEnchantsGemsLocked };
	});

	for (const solverConfig of solverConfigs) {
		const result = await solve(currentInputItems, {
			...baseConfig,
			...solverConfig,
		});
		solverResults.push({
			...result,
			id: solverConfig.id,
			name: solverConfig.name,
		});

		currentInputItems = replaceInputItems(currentInputItems, result.items);
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
