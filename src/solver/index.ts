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

// Echoed back from the request that produced it - see solver.worker.ts. The Worker outlives
// any one solve now, so the id is what keeps a late message from an abandoned request from
// being routed to its successor.
type WorkerMessage = { requestId: number } & (
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
	| { type: "warmed" }
	// Investigative timing breakdown for where a solve spent its time - see
	// src/helpers/perfTrace.ts and solver.worker.ts's own postMessage("perf") call sites.
	| { type: "perf"; summary: PerfSummaryRow[] }
);

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

// One Worker for the whole session, not one per solve.
//
// This used to construct a Worker inside solve() and terminate it on every exit path, which
// meant every config of every solve paid the same fixed startup cost from scratch: a Worker is
// its own realm, so all the module-level memoization the sim relies on (wasmCoordinator's
// instance, #/data/tbcDatabase's fetch+adapt caches, computeStatsClient's LRU) died with it.
// A two-config solve re-gunzipped 5.7MB -> 37MB of wasm, re-instantiated it, re-ran go.run and
// re-parsed the 3.1MB database twice.
//
// Keeping one Worker makes all of that once-per-session, and it is also what makes warming
// (warmSolverWorker, below) possible at all - warming on the main thread would have built a
// 37MB instance in a realm that has no sim consumers.
let sharedWorker: Worker | undefined;
let nextRequestId = 1;

type OnSimResult = (result: {
	simMetrics?: SimMetricsSnapshot;
	perMetricStatWeights?: Record<"tps" | "dtps" | "tmi", Stat[]>;
	perMetricStatWeightStdevs?: Record<"tps" | "dtps" | "tmi", Stat[]>;
	characterStats?: CharacterStatsSnapshot;
	physicalDamageTakenMultiplier?: number;
}) => void;

interface PendingSolve {
	resolve: (items: LPItem[]) => void;
	reject: (error: Error) => void;
	emitProgress?: (progress: WorkerProgressDetail) => void;
	onSimResult?: OnSimResult;
	profile: SimCalibrationProfile;
	round1CacheKey?: Round1CacheKey;
	startedAt: number;
}

const pendingSolves = new Map<number, PendingSolve>();
const pendingWarms = new Map<
	number,
	{ resolve: () => void; reject: (error: Error) => void }
>();

// Throws the Worker away so the next request builds a fresh one, failing everything still
// waiting on it. This is the explicit form of what the old per-solve code did implicitly by
// terminating after every solve.
function recycleSolverWorker(reason: Error): void {
	const worker = sharedWorker;
	sharedWorker = undefined;
	worker?.terminate();

	const abandonedSolves = [...pendingSolves.values()];
	const abandonedWarms = [...pendingWarms.values()];
	pendingSolves.clear();
	pendingWarms.clear();
	for (const entry of abandonedSolves) entry.reject(reason);
	for (const entry of abandonedWarms) entry.reject(reason);
}

function routeWorkerMessage(data: WorkerMessage): void {
	if (data.type === "warmed") {
		pendingWarms.get(data.requestId)?.resolve();
		pendingWarms.delete(data.requestId);
		return;
	}

	const entry = pendingSolves.get(data.requestId);
	// A message from a request that has already settled - in practice a progress or perf
	// message queued behind the result, or anything at all from a request abandoned by a
	// recycle. Dropping it is the whole point of carrying the id.
	if (!entry) {
		if (data.type === "error") {
			pendingWarms.get(data.requestId)?.reject(new Error(data.message));
			pendingWarms.delete(data.requestId);
		}
		return;
	}

	switch (data.type) {
		case "progress": {
			const { type: _type, requestId: _requestId, ...progress } = data;
			entry.emitProgress?.(progress);
			return;
		}
		case "perf":
			// Printed on the main thread (not just the Worker's own separate DevTools console
			// context) so this is visible without switching DevTools' worker-context dropdown -
			// see src/helpers/perfTrace.ts and solver.worker.ts's postMessage("perf") calls.
			console.table(data.summary);
			return;
		case "error": {
			pendingSolves.delete(data.requestId);
			// Recycle rather than reuse. A Go panic inside the wasm (see the cross-class tier-set
			// crash in the plan's Phase 4 notes) leaves the Go runtime dead, and nothing in the
			// message distinguishes that from a clean user-facing throw like the zero-objective
			// guard - so assume the worst, exactly as terminating on every error used to. The
			// cost is one wasm reload after a failed solve, on a path the user must react to
			// anyway.
			recycleSolverWorker(
				new Error("The solver was restarted after an earlier solve failed."),
			);
			entry.reject(new Error(data.message));
			return;
		}
		case "result": {
			pendingSolves.delete(data.requestId);
			// Independent, main-thread-measured end-to-end wall clock, separate from the Worker's
			// own perfTrace summary above - if this meaningfully exceeds the sum of that summary's
			// top-level spans, the gap points at costs the Worker-side trace structurally can't
			// see (postMessage marshaling of the initial payload, and - on the first solve only
			// now - Worker spawn/startup latency).
			console.log(
				`[perf] main-thread solve() wall clock: ${(performance.now() - entry.startedAt).toFixed(1)}ms`,
			);
			if (data.simMetrics || data.perMetricStatWeights || data.characterStats) {
				entry.onSimResult?.({
					simMetrics: data.simMetrics,
					perMetricStatWeights: data.perMetricStatWeights,
					perMetricStatWeightStdevs: data.perMetricStatWeightStdevs,
					characterStats: data.characterStats,
					physicalDamageTakenMultiplier: data.physicalDamageTakenMultiplier,
				});
			}
			if (entry.round1CacheKey && data.round1StatWeights) {
				setCachedRound1Weights(
					entry.profile,
					entry.round1CacheKey,
					data.round1StatWeights,
				);
			}
			entry.resolve(data.items);
			return;
		}
	}
}

function getSolverWorker(): Worker {
	if (sharedWorker) return sharedWorker;
	const worker = new Worker(new URL("./solver.worker.ts", import.meta.url), {
		type: "module",
	});
	worker.onmessage = (e) => routeWorkerMessage(e.data as WorkerMessage);
	worker.onerror = (e) => {
		console.error(e);
		recycleSolverWorker(new Error(e.message || "The solver worker failed."));
	};
	sharedWorker = worker;
	return worker;
}

/**
 * Spawns the shared Worker and has it instantiate the sim wasm and load the item database
 * before the user asks for anything, so the first solve does not pay for them.
 *
 * Fire-and-forget: a failure here is not a user-facing error, because the next solve retries
 * the same work through its own error path. Deliberately does NOT derive the linear model -
 * that depends on the calibration profile, which the user may still edit.
 */
export function warmSolverWorker(): Promise<void> {
	const requestId = nextRequestId++;
	const worker = getSolverWorker();
	return new Promise<void>((resolve, reject) => {
		pendingWarms.set(requestId, { resolve, reject });
		worker.postMessage({ type: "warm", requestId });
	});
}

/** Test seam: drops the shared Worker so each test starts from a clean realm. */
export function resetSolverWorker(): void {
	recycleSolverWorker(new Error("The solver worker was reset."));
}

export const solve = async (
	items: InputItem[],
	options: SolveOptions,
	onProgress?: (progress: WorkerProgressDetail) => void,
	// only ever set for a "tps"/"dtps"/"tmi"/"balanced" solve's result - see solveSimMetric.ts's
	// measureFinalSimMetrics/finalPerMetricStatWeights. A callback (rather than widening this
	// function's return type) keeps every existing `typeof solve`-typed callsite (tests
	// substituting solveGearSet directly) compiling unchanged.
	onSimResult?: OnSimResult,
): Promise<LPItem[]> => {
	const profile =
		options.simCalibrationProfile ?? DEFAULT_SIM_CALIBRATION_PROFILE;
	const round1CacheKey = round1CacheKeyFor(options);
	const precomputedRound1 = round1CacheKey
		? getCachedRound1Weights(profile, round1CacheKey)
		: undefined;

	const requestId = nextRequestId++;
	// Built before the Promise so a Worker construction failure rejects here rather than
	// leaving an entry stranded in pendingSolves.
	const worker = getSolverWorker();

	return new Promise<LPItem[]>((resolve, reject) => {
		pendingSolves.set(requestId, {
			resolve,
			reject,
			// A backgrounded tab keeps sim Worker threads running at full speed but deprioritizes
			// this main thread's message processing, so refocusing can dump a large backlog of
			// queued "progress" messages at once. Throttling how often that actually triggers a
			// React state update (rather than doing so unconditionally, once per raw message) is
			// what keeps draining that backlog fast instead of causing a multi-second catch-up -
			// see createTrailingThrottle's own comment.
			emitProgress: onProgress
				? createTrailingThrottle(onProgress, 150)
				: undefined,
			onSimResult,
			profile,
			round1CacheKey,
			startedAt: performance.now(),
		});
		worker.postMessage({
			type: "solve",
			requestId,
			items,
			options,
			precomputedRound1,
		});
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
