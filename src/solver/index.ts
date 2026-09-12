import type { PerfSummaryRow } from "#/helpers/perfTrace";
import { createTrailingThrottle } from "#/helpers/trailingThrottle";
import type { CalibratedWeights } from "#/sim/calibrateWeights";
import {
	getCachedRound1Weights,
	type Round1CacheKey,
	setCachedRound1Weights,
} from "#/sim/round1WeightsCache";
import type { SimMetricSolvePhase } from "#/sim/solveSimMetric";
import {
	deadCalibrationStats,
	resolveCalibrationStats,
} from "#/sim/statTranslation";
import type { CharacterStatsSnapshot } from "#/types/CharacterStats";
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
	ResistanceFloor,
	Stat,
	StatName,
} from "./types";

interface SolveOptions {
	uncrushabilitySetting: number;
	uncritabilitySetting: number;
	optimizeStats: Stat[];
	objectiveMode?:
		| "stats"
		| "ehp"
		| "hardAvoidance"
		| "tps"
		| "dtps"
		| "tmi"
		| "balanced";
	balance?: number;
	survivabilityMetric?: "tmi" | "dtps";
	enabledCalibrationStats?: StatName[];
	simCalibrationProfile?: SimCalibrationProfile;
	resistanceFloors: ResistanceFloor[];
	areEnchantsGemsLocked: boolean;
	excludeUniqueGems: boolean;
	excludeJewelcraftingItems: boolean;
	excludeEnchantingItems: boolean;
	phase: number;
	raceId: string;
	classId: string;
	enabledConsumableIds: number[];
}

// Every worker progress message carries at least iteration/maxIterations (the avoidance-
// convergence LP sub-loop); sim-backed objectives (see solveSimMetric.ts) additionally carry
// which calibration round it's on and whether that round is currently calibrating (running
// the sim) or solving (running the LP). Plain "stats"/"ehp" solves simply never set the optional
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
	calibrationCompletedSims?: number;
	calibrationTotalSims?: number;
}

type WorkerMessage =
	| ({ type: "progress" } & WorkerProgressDetail)
	| {
			type: "result";
			items: LPItem[];
			simMetrics?: SimMetricsSnapshot;
			perMetricStatWeights?: Record<"tps" | "dtps" | "tmi", Stat[]>;
			perMetricStatWeightStdevs?: Record<"tps" | "dtps" | "tmi", Stat[]>;
			round1StatWeights?: CalibratedWeights;
			characterStats?: CharacterStatsSnapshot;
			physicalDamageTakenMultiplier?: number;
	  }
	| { type: "error"; message: string }
	// Investigative timing breakdown for where a solve spent its time - see
	// src/helpers/perfTrace.ts and solver.worker.ts's own postMessage("perf") call sites.
	| { type: "perf"; summary: PerfSummaryRow[] };

// Round 1 of a sim-backed solve always calibrates around the same fixed baseline gear preset
// (see solveSimMetric.ts), so its result depends only on the profile and which metric blend is
// being solved for - never on the item pool or previously-solved gear. That makes it safe (and,
// since it's the same full-cost calibration batch as every other round, valuable) to cache and
// reuse across solves - see round1WeightsCache.ts. Returns undefined for "stats"/"ehp", which
// don't calibrate at all. Only the main thread has `localStorage` (see round1WeightsCache.ts's
// header comment), so this lookup/write happens here rather than inside solver.worker.ts.
function round1CacheKeyFor(options: SolveOptions): Round1CacheKey | undefined {
	if (
		options.objectiveMode !== "tps" &&
		options.objectiveMode !== "dtps" &&
		options.objectiveMode !== "tmi" &&
		options.objectiveMode !== "balanced"
	) {
		return undefined;
	}
	return {
		objectiveMode: options.objectiveMode,
		balance: options.balance,
		survivabilityMetric: options.survivabilityMetric,
		// Sorted (not just resolved) so a config left at its default and a config that explicitly
		// re-selects every stat in a different order both hash identically - see
		// round1WeightsCache.ts's Round1CacheKey doc comment.
		calibrationStats: [
			...resolveCalibrationStats(options.enabledCalibrationStats),
		].sort(),
		// A dead stat (see deadCalibrationStats) is forced to an explicit 0 rather than really
		// simmed, which is a genuinely different result from the same stat calibrated normally -
		// two configs whose only difference is uncritabilitySetting (and therefore whether
		// Resilience is dead) must not collide on the same cache entry.
		deadStats: [...deadCalibrationStats(options.uncritabilitySetting)].sort(),
	};
}

export const solve = async (
	items: InputItem[],
	options: SolveOptions,
	onProgress?: (progress: WorkerProgressDetail) => void,
	// only ever set for a "tps"/"dtps"/"tmi"/"balanced" solve's result - see solveSimMetric.ts's
	// measureFinalSimMetrics/finalPerMetricStatWeights. A callback (rather than widening this
	// function's return type) keeps every existing `typeof solve`-typed callsite (tests
	// substituting solveGearSet directly) compiling unchanged.
	onSimResult?: (result: {
		simMetrics?: SimMetricsSnapshot;
		perMetricStatWeights?: Record<"tps" | "dtps" | "tmi", Stat[]>;
		perMetricStatWeightStdevs?: Record<"tps" | "dtps" | "tmi", Stat[]>;
		characterStats?: CharacterStatsSnapshot;
		physicalDamageTakenMultiplier?: number;
	}) => void,
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

		const solveStartedAt = performance.now();

		worker.onmessage = (e) => {
			const data = e.data as WorkerMessage;
			if (data.type === "progress") {
				const { type: _type, ...progress } = data;
				emitProgress?.(progress);
				return;
			}

			if (data.type === "perf") {
				// Printed on the main thread (not just the Worker's own separate DevTools console
				// context) so this is visible without switching DevTools' worker-context dropdown -
				// see src/helpers/perfTrace.ts and solver.worker.ts's postMessage("perf") calls.
				console.table(data.summary);
				return;
			}

			if (data.type === "error") {
				worker.terminate();
				reject(new Error(data.message));
				return;
			}

			console.log("worker result");
			// Independent, main-thread-measured end-to-end wall clock, separate from the Worker's
			// own perfTrace summary above - if this meaningfully exceeds the sum of that summary's
			// top-level spans, the gap points at costs the Worker-side trace structurally can't see
			// (Worker spawn/startup latency, postMessage marshaling of the initial payload, etc).
			console.log(
				`[perf] main-thread solve() wall clock: ${(performance.now() - solveStartedAt).toFixed(1)}ms`,
			);
			worker.terminate();
			if (data.simMetrics || data.perMetricStatWeights || data.characterStats) {
				onSimResult?.({
					simMetrics: data.simMetrics,
					perMetricStatWeights: data.perMetricStatWeights,
					perMetricStatWeightStdevs: data.perMetricStatWeightStdevs,
					characterStats: data.characterStats,
					physicalDamageTakenMultiplier: data.physicalDamageTakenMultiplier,
				});
			}
			if (round1CacheKey && data.round1StatWeights) {
				setCachedRound1Weights(profile, round1CacheKey, data.round1StatWeights);
			}
			resolve(data.items);
		};

		worker.onerror = (e) => {
			console.error(e);
			worker.terminate();
			reject(e);
		};

		const profile =
			options.simCalibrationProfile ?? DEFAULT_SIM_CALIBRATION_PROFILE;
		const round1CacheKey = round1CacheKeyFor(options);
		const precomputedRound1 = round1CacheKey
			? getCachedRound1Weights(profile, round1CacheKey)
			: undefined;

		worker.postMessage({ items, options, precomputedRound1 });
	});
};

// Turns one WorkerProgressDetail into a 0..1 fraction of "how far through this config's solve
// are we". For plain "stats"/"ehp" solves this is just the avoidance-convergence LP sub-loop's
// own iteration/maxIterations. Sim-backed objectives (see solveSimMetric.ts) run several whole
// calibration rounds (simIteration of maxSimIterations) per config, each of which recalibrates
// (the slow part, usually ~15s+) and then re-solves the LP (the fast part, usually <1s) - so the
// primary axis has to be simIteration/maxSimIterations, with the round's own phase progress as a
// sub-fraction *within* that round. Getting this wrong (e.g. just using iteration/maxIterations
// directly, which resets to 0/1 every round during calibration - see solveSimMetric.ts's
// onCalibrationProgress call sites) is what made the progress bar visibly jump backward every
// round: a real bug a user spotted, not a hypothetical.
function computeInnerFraction(progress: WorkerProgressDetail): number {
	if (progress.maxSimIterations == null || progress.simIteration == null) {
		return progress.iteration / progress.maxIterations;
	}
	// Calibration (running the sims) dominates a round's wall time; the round's LP re-solve
	// afterward is comparatively instant. Weighting the split 90/10 keeps the bar's rate roughly
	// proportional to where the time is actually going, rather than implying they're equal-cost.
	let roundFraction = 0;
	if (progress.phase === "calibrating") {
		roundFraction = progress.calibrationTotalIterations
			? (0.9 * (progress.calibrationCompletedIterations ?? 0)) /
				progress.calibrationTotalIterations
			: 0;
	} else if (progress.phase === "solving") {
		roundFraction = 0.9 + 0.1 * (progress.iteration / progress.maxIterations);
	}
	return (progress.simIteration + roundFraction) / progress.maxSimIterations;
}

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

	// Ids an EARLIER config chose, and therefore froze the gems/enchant of for every config after
	// it (see replaceInputItems and prepareItemCandidates' locked branch). This is tracked here,
	// at the one place that actually knows, rather than re-derived in the UI from LPItem.locked -
	// which cannot tell "an earlier set fixed this" apart from "the user ticked lock enchants
	// & gems".
	//
	// Not tracked when the user HAS ticked that box: they fixed every item's gems themselves, so
	// an earlier config re-fixing them to the same thing constrains nothing and flagging it would
	// be noise on every row.
	const tracksInheritance =
		!baseConfig.independentConfigs && !baseConfig.areEnchantsGemsLocked;
	const lockedByEarlierConfigs = new Set<string>();

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
		let perMetricStatWeights:
			| Record<"tps" | "dtps" | "tmi", Stat[]>
			| undefined;
		let perMetricStatWeightStdevs:
			| Record<"tps" | "dtps" | "tmi", Stat[]>
			| undefined;
		let characterStats: CharacterStatsSnapshot | undefined;
		let physicalDamageTakenMultiplier: number | undefined;
		const inheritedComingIn = new Set(lockedByEarlierConfigs);
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
						innerFraction: computeInnerFraction(progress),
						detail: progress,
					}),
				(result) => {
					simMetrics = result.simMetrics;
					perMetricStatWeights = result.perMetricStatWeights;
					perMetricStatWeightStdevs = result.perMetricStatWeightStdevs;
					characterStats = result.characterStats;
					physicalDamageTakenMultiplier =
						result.physicalDamageTakenMultiplier;
				},
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`"${solverConfig.name}": ${message}`);
		}
		solverResults.push({
			items,
			simMetrics,
			perMetricStatWeights,
			perMetricStatWeightStdevs,
			characterStats,
			physicalDamageTakenMultiplier,
			// Only the inherited items this set actually ENDED UP using - an item an earlier
			// config froze but this one did not pick constrains nothing here.
			inheritedItemIds: items
				.filter((item) => inheritedComingIn.has(item.id))
				.map((item) => item.id),
			id: solverConfig.id,
			name: solverConfig.name,
			baseConfig,
			solverConfig,
		});

		if (tracksInheritance) {
			for (const item of items) lockedByEarlierConfigs.add(item.id);
		}

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
