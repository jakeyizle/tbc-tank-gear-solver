import { createTrailingThrottle } from "#/helpers/trailingThrottle";
import type { SimMetricSolvePhase } from "#/sim/solveSimMetric";
import type {
	SimCalibrationProfile,
	SimMetricsSnapshot,
} from "#/types/SimCalibrationProfile";
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
	objectiveMode?: "stats" | "ehp" | "simWeighted";
	simMetricWeights?: { tps: number; dtps: number; tmi5: number };
	simCalibrationProfile?: SimCalibrationProfile;
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

// Every worker progress message carries at least iteration/maxIterations (the avoidance-
// convergence LP sub-loop); sim-backed objectives (see solveSimMetric.ts) additionally carry
// which calibration round it's on and whether that round is currently calibrating (running
// the sim) or solving (running the LP). Plain "stats"/"ehp" solves simply never set the
// optional fields, so this is an additive, backward-compatible superset of what was here
// before, not a breaking shape change.
export interface WorkerProgressDetail {
	iteration: number;
	maxIterations: number;
	simIteration?: number;
	maxSimIterations?: number;
	phase?: SimMetricSolvePhase;
	calibrationCompletedIterations?: number;
	calibrationTotalIterations?: number;
}

type WorkerMessage =
	| ({ type: "progress" } & WorkerProgressDetail)
	| { type: "result"; items: LPItem[]; simMetrics?: SimMetricsSnapshot }
	| { type: "error"; message: string };

export const solve = async (
	items: InputItem[],
	options: SolveOptions,
	onProgress?: (progress: WorkerProgressDetail) => void,
	// only ever set for a "simWeighted" solve's result - see solveSimMetric.ts's
	// measureFinalSimMetrics. A callback (rather than widening this function's return type)
	// keeps every existing `typeof solve`-typed callsite (tests substituting solveGearSet
	// directly) compiling unchanged.
	onSimMetrics?: (metrics: SimMetricsSnapshot) => void,
): Promise<LPItem[]> => {
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL("./solver.worker.ts", import.meta.url), {
			type: "module",
		});

		// A backgrounded tab keeps sim Worker threads running at full speed but deprioritizes
		// this main thread's message processing, so refocusing can dump a large backlog of
		// queued "progress" messages at once. Throttling how often that actually triggers a
		// React state update (rather than doing so unconditionally, once per raw message) is
		// what keeps draining that backlog fast instead of causing a multi-second catch-up -
		// see createTrailingThrottle's own comment.
		const emitProgress = onProgress
			? createTrailingThrottle(onProgress, 150)
			: undefined;

		worker.onmessage = (e) => {
			const data = e.data as WorkerMessage;
			if (data.type === "progress") {
				const { type: _type, ...progress } = data;
				emitProgress?.(progress);
				return;
			}

			if (data.type === "error") {
				worker.terminate();
				reject(new Error(data.message));
				return;
			}

			console.log("worker result");
			worker.terminate();
			if (data.simMetrics) onSimMetrics?.(data.simMetrics);
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
	// present for sim-backed objectives only - see WorkerProgressDetail.
	detail?: WorkerProgressDetail;
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
		let simMetrics: SimMetricsSnapshot | undefined;
		try {
			items = await solveFn(
				currentInputItems,
				{
					...baseConfig,
					...solverConfig,
				},
				(progress) =>
					onProgress?.({
						configIndex,
						totalConfigs,
						configName: solverConfig.name,
						innerFraction: progress.iteration / progress.maxIterations,
						detail: progress,
					}),
				(metrics) => {
					simMetrics = metrics;
				},
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`"${solverConfig.name}": ${message}`);
		}
		solverResults.push({
			items,
			simMetrics,
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
