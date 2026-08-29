import type { BaseConfig, SolveResult, SolverConfiguration as UISolverConfiguration } from "#/types/SolverConfig";
import type { InputItem, LPItem, ModifierSource, ResistanceFloor, Stat } from "./types";

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

export const solve = async (
	items: InputItem[],
	options: SolveOptions,
): Promise<LPItem[]> => {
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL("./solver.worker.ts", import.meta.url), {
			type: "module",
		});

		worker.onmessage = (e) => {
			console.log("worker result");
			worker.terminate();
			resolve(e.data as LPItem[]);
		};

		worker.onerror = (e) => {
			console.error(e);
			worker.terminate();
			reject(e);
		};

		worker.postMessage({ items, options });
	});
};

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
