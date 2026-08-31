import type {
	BaseConfig,
	SolveResult,
	SolverConfiguration as UISolverConfiguration,
} from "#/types/SolverConfig";
import type {
	InputItem,
	LPItem,
	ModifierSource,
	ResistanceFloor,
	Stat,
} from "./types";

interface SolveOptions {
	uncrushabilitySetting: number;
	uncritabilitySetting: number;
	optimizeStats: Stat[];
	objectiveMode?: "stats" | "ehp";
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

type WorkerMessage =
	| { type: "progress"; iteration: number; maxIterations: number }
	| { type: "result"; items: LPItem[] }
	| { type: "error"; message: string };

export const solve = async (
	items: InputItem[],
	options: SolveOptions,
	onProgress?: (fraction: number) => void,
): Promise<LPItem[]> => {
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL("./solver.worker.ts", import.meta.url), {
			type: "module",
		});

		worker.onmessage = (e) => {
			const data = e.data as WorkerMessage;
			if (data.type === "progress") {
				onProgress?.(data.iteration / data.maxIterations);
				return;
			}

			if (data.type === "error") {
				worker.terminate();
				reject(new Error(data.message));
				return;
			}

			console.log("worker result");
			worker.terminate();
			resolve(data.items);
		};

		worker.onerror = (e) => {
			console.error(e);
			worker.terminate();
			reject(e);
		};

		worker.postMessage({ items, options });
	});
};

export interface SolveAllProgress {
	configIndex: number;
	totalConfigs: number;
	configName: string;
	innerFraction: number;
}

export const solveAll = async (
	items: InputItem[],
	baseConfig: BaseConfig,
	solverConfigs: UISolverConfiguration[],
	onProgress?: (progress: SolveAllProgress) => void,
	// overridable so this orchestration (in particular, the cross-config item-locking behavior)
	// can be tested without a real Worker - defaults to the real worker-based solve for prod use
	solveFn: typeof solve = solve,
): Promise<SolveResult[]> => {
	// the idea here is to solve in order
	// the items that are selected are locked, and no variants for those items will be generated for the next configs
	const solverResults: SolveResult[] = [];
	let currentInputItems: InputItem[] = items.map((item) => {
		return { ...item, locked: baseConfig.areEnchantsGemsLocked };
	});

	const totalConfigs = solverConfigs.length;
	for (const [configIndex, solverConfig] of solverConfigs.entries()) {
		onProgress?.({
			configIndex,
			totalConfigs,
			configName: solverConfig.name,
			innerFraction: 0,
		});

		let items: LPItem[];
		try {
			items = await solveFn(
				currentInputItems,
				{
					...baseConfig,
					...solverConfig,
				},
				(innerFraction) =>
					onProgress?.({
						configIndex,
						totalConfigs,
						configName: solverConfig.name,
						innerFraction,
					}),
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`"${solverConfig.name}": ${message}`);
		}
		solverResults.push({
			items,
			id: solverConfig.id,
			name: solverConfig.name,
			baseConfig,
			solverConfig,
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
