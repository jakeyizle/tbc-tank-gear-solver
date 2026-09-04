import { createTrailingThrottle } from "#/helpers/trailingThrottle";
import {
	getCachedBalanceEndpoints,
	setCachedBalanceEndpoints,
} from "#/sim/simBalanceCache";
import type { BalanceEndpoint } from "#/sim/solveBalancedSimMetric";
import type { SimMetricSolvePhase } from "#/sim/solveSimMetric";
import {
	DEFAULT_SIM_CALIBRATION_PROFILE,
	type SimCalibrationProfile,
	type SimMetricsSnapshot,
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
	simBalance?: { balance: number };
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
// the sim) or solving (running the LP), plus (for a balance-slider solve - see
// solveBalancedSimMetric.ts) which of the three underlying solves (the two endpoints, then the
// balanced solve) is currently running. Plain "stats"/"ehp" solves simply never set the optional
// fields, so this is an additive, backward-compatible superset of what was here before, not a
// breaking shape change.
export interface WorkerProgressDetail {
	iteration: number;
	maxIterations: number;
	simIteration?: number;
	maxSimIterations?: number;
	phase?: SimMetricSolvePhase;
	calibrationCompletedIterations?: number;
	calibrationTotalIterations?: number;
	stage?: "threatEndpoint" | "survivalEndpoint" | "balancing";
}

type WorkerMessage =
	| ({ type: "progress" } & WorkerProgressDetail)
	| {
			type: "result";
			items: LPItem[];
			simMetrics?: SimMetricsSnapshot;
			statWeights?: Stat[];
			statWeightStdevs?: Stat[];
			simBalanceEndpoints?: {
				threat: BalanceEndpoint;
				survival: BalanceEndpoint;
			};
	  }
	| { type: "error"; message: string };

// Everything in `options` except simBalance's own balance value affects the two endpoint solves'
// outcome (race/class/talents/buffs/consumables/resistance floors/etc - not just the item pool),
// so the cache key hashes all of it except that one field - see simBalanceCache.ts's own header
// comment on why `balance` itself must be excluded.
function optionsForEndpointCacheKey(
	options: SolveOptions,
): Record<string, unknown> {
	const { simBalance: _simBalance, ...rest } = options;
	return rest;
}

export const solve = async (
	items: InputItem[],
	options: SolveOptions,
	onProgress?: (progress: WorkerProgressDetail) => void,
	// only ever set for a "simWeighted" solve's result - see solveSimMetric.ts's
	// measureFinalSimMetrics/finalStatWeights. A callback (rather than widening this function's
	// return type) keeps every existing `typeof solve`-typed callsite (tests substituting
	// solveGearSet directly) compiling unchanged.
	onSimResult?: (result: {
		simMetrics?: SimMetricsSnapshot;
		statWeights?: Stat[];
		statWeightStdevs?: Stat[];
		simBalanceEndpoints?: {
			threat: BalanceEndpoint;
			survival: BalanceEndpoint;
		};
	}) => void,
): Promise<LPItem[]> => {
	// A balance-slider solve's two single-metric endpoints only depend on the item pool/options/
	// profile, never on `balance` itself (see solveBalancedSimMetric.ts) - safe to cache across
	// solves/configs that share those inputs, and skip straight to the (much cheaper) final
	// constrained solve on a hit. The cache lives on the main thread (localStorage isn't available
	// inside a Worker), so it's read here before dispatching and written back once the worker's
	// result carries simBalanceEndpoints - see simBalanceCache.ts.
	const isSimWeighted =
		options.objectiveMode === "simWeighted" && !!options.simBalance;
	const resolvedProfile =
		options.simCalibrationProfile ?? DEFAULT_SIM_CALIBRATION_PROFILE;
	const cachedEndpoints = isSimWeighted
		? getCachedBalanceEndpoints(
				items,
				optionsForEndpointCacheKey(options),
				resolvedProfile,
			)
		: undefined;

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
			if (data.simMetrics || data.statWeights) {
				onSimResult?.({
					simMetrics: data.simMetrics,
					statWeights: data.statWeights,
					statWeightStdevs: data.statWeightStdevs,
					simBalanceEndpoints: data.simBalanceEndpoints,
				});
			}
			// Written unconditionally (not just on a cache miss) - cheap, idempotent, and
			// refreshes savedAt on a hit too, which doubles as an LRU touch for the cache's
			// eviction policy rather than being dead weight.
			if (isSimWeighted && data.simBalanceEndpoints) {
				setCachedBalanceEndpoints(
					items,
					optionsForEndpointCacheKey(options),
					resolvedProfile,
					data.simBalanceEndpoints,
				);
			}
			resolve(data.items);
		};

		worker.onerror = (e) => {
			console.error(e);
			worker.terminate();
			reject(e);
		};

		worker.postMessage({ items, options, cachedEndpoints });
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
	// - unless baseConfig.independentConfigs is set, in which case every config solves from this
	// same starting pool instead, so configs can be compared on equal footing.
	const solverResults: SolveResult[] = [];
	const initialInputItems: InputItem[] = items.map((item) => {
		return { ...item, locked: baseConfig.areEnchantsGemsLocked };
	});
	let currentInputItems: InputItem[] = initialInputItems;

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
		let statWeights: Stat[] | undefined;
		let statWeightStdevs: Stat[] | undefined;
		let simBalanceEndpoints:
			| { threat: BalanceEndpoint; survival: BalanceEndpoint }
			| undefined;
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
				(result) => {
					simMetrics = result.simMetrics;
					statWeights = result.statWeights;
					statWeightStdevs = result.statWeightStdevs;
					simBalanceEndpoints = result.simBalanceEndpoints;
				},
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`"${solverConfig.name}": ${message}`);
		}
		solverResults.push({
			items,
			simMetrics,
			statWeights,
			statWeightStdevs,
			simBalanceEndpoints,
			id: solverConfig.id,
			name: solverConfig.name,
			baseConfig,
			solverConfig,
		});

		currentInputItems = baseConfig.independentConfigs
			? initialInputItems
			: replaceInputItems(currentInputItems, items);
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
