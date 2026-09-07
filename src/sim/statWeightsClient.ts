// Loads the vendored tbc-new WASM sim (built by `npm run sim:build-wasm` into
// public/sim/lib.wasm.gz) and exposes its statWeights()/statWeightsAsync() calls as plain async
// functions.
//
// Callers run this from inside src/solver/solver.worker.ts, which is already off the main
// thread — module Web Workers support fetch/WebAssembly/dynamic import just fine, so there's
// no need for a second dedicated Worker here (an earlier version of this file was one; it
// added a postMessage round-trip for no benefit, since the only caller is itself already
// inside a worker).
//
// runStatWeightsAsync's calibration work is fanned out across a SimWorkerPool (see
// simWorkerPool.ts) as a flat SimJobQueue (see simJobQueue.ts) of whole, unsplit requests -
// baseline + every calibrated stat's low/high perturbation - rather than splitting each
// individual request across the whole pool and barrier-waiting before starting the next one.
// This session's own investigation measured that splitting adds ~0% total CPU overhead (no
// meaningful per-chunk setup cost to amortize - see docs/plans/sim-backed-objectives.md's Step
// 0 measurement), so the only real win of the job-queue model is letting independent requests -
// most importantly, calibrateWeights.ts's independent *replicates* - actually run concurrently,
// which one-request-in-flight-at-a-time splitting could never do. This instance's own wasm
// module is still used as the "coordinator" for the cheap, non-iteration-bound calls
// (statWeightRequests, statWeightCompute).
import "./wasm_exec.js";
import { perfTrace } from "#/helpers/perfTrace";
import { fetchWasmModule } from "./fetchWasmModule";
import {
	ProgressMetrics,
	RaidSimRequest,
	RaidSimResult,
	StatWeightRequestsData,
	StatWeightsCalcRequest,
	StatWeightsResult,
	StatWeightsStatResultData,
} from "./proto/api.js";
import { runSimJobQueue, type SimJob } from "./simJobQueue";
import { SimWorkerPool } from "./simWorkerPool";

interface GoWasmGlobals {
	wasmready?: () => void;
	statWeights?: (requestBytes: Uint8Array) => Uint8Array;
	statWeightsAsync?: (
		requestBytes: Uint8Array,
		onProgress: (progressBytes: Uint8Array) => void,
		requestId: string,
	) => void;
	statWeightRequests?: (requestBytes: Uint8Array) => Uint8Array;
	statWeightCompute?: (requestBytes: Uint8Array) => Uint8Array;
	raidSim?: (requestBytes: Uint8Array) => Uint8Array;
	Go?: new () => {
		importObject: WebAssembly.Imports;
		run: (instance: WebAssembly.Instance) => Promise<void>;
	};
}

const wasmGlobals = globalThis as unknown as GoWasmGlobals;

let wasmReady: Promise<void> | undefined;

function loadWasm(): Promise<void> {
	if (!wasmReady) {
		const stopInstantiate = perfTrace.mark("coordinatorWasmInstantiate");
		wasmReady = new Promise<void>((resolve) => {
			wasmGlobals.wasmready = () => {
				stopInstantiate();
				resolve();
			};
		});

		if (!wasmGlobals.Go)
			throw new Error("wasm_exec.js did not register globalThis.Go");
		const go = new wasmGlobals.Go();
		fetchWasmModule("/sim/lib.wasm.gz", go.importObject).then((result) =>
			go.run(result.instance),
		);
	}
	return wasmReady;
}

/** Calls the wasm module's statWeights() export, lazily loading it on first use. */
export async function runStatWeights(
	requestBytes: Uint8Array,
): Promise<Uint8Array> {
	await loadWasm();
	if (!wasmGlobals.statWeights) {
		throw new Error("statWeights global was not registered by the wasm module");
	}
	return wasmGlobals.statWeights(requestBytes);
}

let pool: SimWorkerPool | undefined;
/**
 * Returns this module's shared SimWorkerPool, creating it on first use. Exported so
 * calibrateWeights.ts's runCalibrationBatches can dispatch one unified SimJobQueue spanning
 * every replicate's jobs directly against the same pool runStatWeightsAsync would otherwise use
 * per replicate - see that function's own doc comment on why replicates must share one queue
 * rather than each independently round-robining the pool.
 */
export function getPool(workerCount?: number): SimWorkerPool {
	if (!pool) pool = new SimWorkerPool(workerCount);
	return pool;
}

/**
 * Forces a fresh coordinator wasm instance and worker pool on the next call. Meant to be called
 * between calibration rounds (see solveSimMetric.ts) to periodically reset whatever accumulates
 * on these long-lived Go+wasm instances before it can reach the hang threshold described in
 * simWorkerPool.ts's header comment and measureRaidSim's doc comment above.
 */
export function resetSimEnvironment(): void {
	console.warn(
		"[sim] Recycling wasm coordinator + worker pool between calibration rounds.",
	);
	pool?.recycle();
	wasmReady = undefined;
}

/**
 * Runs a single real raid sim (not a calibration batch) for `requestBytes`' gear/encounter/
 * buffs, returning the raw RaidSimResult - used to measure absolute TPS/DTPS/TMI-5 values for
 * display, since StatWeightsResult only ever carries per-stat marginal weights, never an
 * absolute value (see calibrateWeights.ts's measureFinalSimMetrics).
 *
 * Reuses the wasm module's statWeightRequests export purely for its Go-side assembly of a
 * StatWeightsRequest into a proper RaidSimRequest (buffs/database/talents wiring etc.) - the
 * same `reqData.baseRequest` runStatWeightsAsync computes and discards after using it as the
 * calibration baseline.
 *
 * Deliberately calls the coordinator instance's plain synchronous `raidSim` export directly
 * rather than going through the SimWorkerPool: this is a one-off, single measurement (not a
 * batch), and an earlier version of this file's now-removed split/combine path was observed to
 * hang indefinitely inside `raidSimResultCombination` when called right after a full calibration
 * batch's dozens of split/combine round trips on the same coordinator instance - reproduced
 * live, isolated by tracing each step, and confirmed fixed by switching to this single-threaded
 * path (also exactly what statWeights.integration.test.ts's own regression test already
 * exercises against the real wasm module). One extra un-parallelized sim is a small, bounded
 * cost either way.
 */
export async function measureRaidSim(
	requestBytes: Uint8Array,
): Promise<RaidSimResult> {
	await loadWasm();
	if (!wasmGlobals.statWeightRequests || !wasmGlobals.raidSim) {
		throw new Error(
			"statWeightRequests/raidSim globals were not registered by the wasm module",
		);
	}
	const reqData = StatWeightRequestsData.fromBinary(
		wasmGlobals.statWeightRequests(requestBytes),
	);
	if (!reqData.baseRequest) {
		throw new Error("statWeightRequests returned no baseRequest");
	}
	const bytes = wasmGlobals.raidSim(
		RaidSimRequest.toBinary(reqData.baseRequest),
	);
	return RaidSimResult.fromBinary(bytes);
}

/** `SimJob.id` for the calibration batch's unperturbed baseline request. */
const BASE_JOB_ID = "base";
/** `SimJob.id` for stat index `i`'s low/high perturbation request. */
function statJobId(i: number, side: "low" | "high"): string {
	return `stat:${i}:${side}`;
}

export interface StatWeightJobsBundle {
	jobs: SimJob[];
	reqData: StatWeightRequestsData;
}

/**
 * Calls the wasm coordinator's statWeightRequests to expand one StatWeightsRequest into its
 * baseline + every calibrated stat's low/high perturbation RaidSimRequests, and flattens them
 * into a `SimJob[]` for `runSimJobQueue` - one job per whole, unsplit request, tagged so
 * `computeStatWeightsFromJobResults` can put each result back in its original stat order
 * regardless of the order jobs actually complete in.
 *
 * Confirmed independent of anything the sim itself computes: `statWeightRequests` returns the
 * baseline request and every stat's perturbation requests from one up-front, side-effect-free
 * call - the baseline *result* is only consumed later, at compute time - so there is no
 * ordering dependency between building these jobs and running them in any order/concurrency.
 */
export async function buildStatWeightJobs(
	requestBytes: Uint8Array,
): Promise<StatWeightJobsBundle> {
	await loadWasm();
	const statWeightRequests = wasmGlobals.statWeightRequests;
	if (!statWeightRequests) {
		throw new Error(
			"statWeightRequests global was not registered by the wasm module",
		);
	}
	const reqData = perfTrace.time("statWeightRequestsWasmCall", () =>
		StatWeightRequestsData.fromBinary(statWeightRequests(requestBytes)),
	);
	if (!reqData.baseRequest) {
		throw new Error("statWeightRequests returned no baseRequest");
	}

	const jobs: SimJob[] = [
		{
			id: BASE_JOB_ID,
			requestBytes: RaidSimRequest.toBinary(reqData.baseRequest),
			totalIterations: reqData.baseRequest.simOptions?.iterations ?? 0,
		},
	];
	reqData.statSimRequests.forEach((statReqData, i) => {
		if (statReqData.requestLow) {
			jobs.push({
				id: statJobId(i, "low"),
				requestBytes: RaidSimRequest.toBinary(statReqData.requestLow),
				totalIterations: statReqData.requestLow.simOptions?.iterations ?? 0,
			});
		}
		if (!statReqData.requestHigh) {
			throw new Error("statWeightRequests returned a stat with no requestHigh");
		}
		jobs.push({
			id: statJobId(i, "high"),
			requestBytes: RaidSimRequest.toBinary(statReqData.requestHigh),
			totalIterations: statReqData.requestHigh.simOptions?.iterations ?? 0,
		});
	});

	return { jobs, reqData };
}

/**
 * Reassembles a StatWeightsCalcRequest from `reqData` (see buildStatWeightJobs) and a completed
 * job's results keyed by job id, in the *original* stat order - not completion order, since jobs
 * may now finish in any order under runSimJobQueue - then calls statWeightCompute exactly as the
 * old sequential runStatWeightsAsync did.
 */
export function computeStatWeightsFromJobResults(
	reqData: StatWeightRequestsData,
	resultsById: Map<string, RaidSimResult>,
): StatWeightsResult {
	if (!wasmGlobals.statWeightCompute) {
		throw new Error(
			"statWeightCompute global was not registered by the wasm module",
		);
	}

	function requireResult(id: string): RaidSimResult {
		const result = resultsById.get(id);
		if (!result) throw new Error(`Missing sim result for job "${id}"`);
		return result;
	}

	const calcRequest = StatWeightsCalcRequest.create({
		baseResult: requireResult(BASE_JOB_ID),
		epReferenceStat: reqData.epReferenceStat,
		statSimResults: reqData.statSimRequests.map((statReqData, i) =>
			StatWeightsStatResultData.create({
				statData: statReqData.statData,
				resultLow: statReqData.requestLow
					? requireResult(statJobId(i, "low"))
					: undefined,
				resultHigh: requireResult(statJobId(i, "high")),
			}),
		),
	});

	const weightResult = StatWeightsResult.fromBinary(
		wasmGlobals.statWeightCompute(StatWeightsCalcRequest.toBinary(calcRequest)),
	);
	if (weightResult.error) {
		throw new Error(`Sim calibration failed: ${weightResult.error.message}`);
	}
	return weightResult;
}

/**
 * Runs a full stat-weight calibration batch (baseline + every stat's low/high perturbation)
 * across a SimWorkerPool as one SimJobQueue, reporting cumulative progress the same shape as the
 * old single-instance statWeightsAsync call did (`ProgressMetrics.totalIterations`/
 * `completedIterations`/`totalSims`/`completedSims`), so callers (calibrateWeights.ts) need no
 * changes to their progress-consuming code.
 *
 * `workerCount` (0/undefined = auto-detect) only takes effect the first time this module
 * creates its pool - see getPool()/SimWorkerPool. Fine in practice since a fresh Worker (and
 * so a fresh copy of this module) is spun up per solve (see solver.worker.ts), so there's
 * never a stale pool sized for a since-changed setting within one solve.
 */
export async function runStatWeightsAsync(
	requestBytes: Uint8Array,
	onProgress?: (progress: ProgressMetrics) => void,
	workerCount?: number,
): Promise<StatWeightsResult> {
	const { jobs, reqData } = await buildStatWeightJobs(requestBytes);
	const simWorkerPool = getPool(workerCount);

	const totalIterations = jobs.reduce((sum, j) => sum + j.totalIterations, 0);
	const totalSims = jobs.length;
	const resultsById = new Map<string, RaidSimResult>();

	// Per-job last-reported iteration count for still-running jobs, so the aggregate total can
	// be recomputed on every tick without double-counting a job once it's done (see
	// simJobQueue.ts's header comment on why a job's own final iteration count only ever arrives
	// bundled with its "done" result, never as a trailing progress message on its own).
	const inFlightIterations = new Map<string, number>();
	let completedIterationsFromDoneJobs = 0;
	let simsDone = 0;
	const reportProgress = () => {
		const inFlightTotal = Array.from(inFlightIterations.values()).reduce(
			(a, b) => a + b,
			0,
		);
		onProgress?.(
			ProgressMetrics.create({
				totalIterations,
				completedIterations: completedIterationsFromDoneJobs + inFlightTotal,
				totalSims,
				completedSims: simsDone,
			}),
		);
	};

	await runSimJobQueue(simWorkerPool, jobs, {
		onJobProgress: (jobId, completed) => {
			inFlightIterations.set(jobId, completed);
			reportProgress();
		},
		onJobDone: (jobId, result) => {
			inFlightIterations.delete(jobId);
			const job = jobs.find((j) => j.id === jobId);
			completedIterationsFromDoneJobs += job?.totalIterations ?? 0;
			simsDone++;
			resultsById.set(jobId, result);
			reportProgress();
		},
	});

	return computeStatWeightsFromJobResults(reqData, resultsById);
}
