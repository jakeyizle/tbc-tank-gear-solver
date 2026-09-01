// Loads the vendored tbc-new WASM sim (built by `npm run sim:build-wasm` into
// public/sim/lib.wasm) and exposes its statWeights()/statWeightsAsync() calls as plain async
// functions.
//
// Callers run this from inside src/solver/solver.worker.ts, which is already off the main
// thread — module Web Workers support fetch/WebAssembly/dynamic import just fine, so there's
// no need for a second dedicated Worker here (an earlier version of this file was one; it
// added a postMessage round-trip for no benefit, since the only caller is itself already
// inside a worker).
//
// runStatWeightsAsync's calibration work is fanned out across a SimWorkerPool (see
// simWorkerPool.ts) instead of running single-threaded in this instance: each individual sim
// request in the batch is split via the wasm module's own raidSimRequestSplit and run
// concurrently across real Worker threads, then recombined - mirroring wowsims' own
// ui/core/sim_concurrent.ts, which this session's performance investigation confirmed gives a
// real ~3.4x speedup at wowsims' own chosen worker count (see
// docs/plans/sim-backed-objectives.md). This instance's own wasm module is still used as the
// "coordinator" for the cheap, non-iteration-bound calls (statWeightRequests,
// raidSimRequestSplit, raidSimResultCombination, statWeightCompute).
import "./wasm_exec.js";
import {
	ProgressMetrics,
	RaidSimRequest,
	RaidSimRequestSplitRequest,
	RaidSimRequestSplitResult,
	RaidSimResult,
	RaidSimResultCombinationRequest,
	StatWeightRequestsData,
	StatWeightsCalcRequest,
	StatWeightsResult,
	StatWeightsStatResultData,
} from "./proto/api.js";
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
	raidSimRequestSplit?: (requestBytes: Uint8Array) => Uint8Array;
	raidSimResultCombination?: (requestBytes: Uint8Array) => Uint8Array;
	Go?: new () => {
		importObject: WebAssembly.Imports;
		run: (instance: WebAssembly.Instance) => Promise<void>;
	};
}

const wasmGlobals = globalThis as unknown as GoWasmGlobals;

let wasmReady: Promise<void> | undefined;

function loadWasm(): Promise<void> {
	if (!wasmReady) {
		wasmReady = new Promise<void>((resolve) => {
			wasmGlobals.wasmready = () => resolve();
		});

		if (!wasmGlobals.Go)
			throw new Error("wasm_exec.js did not register globalThis.Go");
		const go = new wasmGlobals.Go();
		WebAssembly.instantiateStreaming(
			fetch("/sim/lib.wasm"),
			go.importObject,
		).then((result) => go.run(result.instance));
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
function getPool(): SimWorkerPool {
	if (!pool) pool = new SimWorkerPool();
	return pool;
}

/**
 * Runs one RaidSimRequest split across the worker pool and recombined - the parallel
 * counterpart to a single wasm instance's raidSimAsync call. `onIterationsSum` fires with the
 * summed completedIterations across every pool slot currently working on this request (mirrors
 * wowsims' ConcurrentSimProgress).
 *
 * Exported (rather than module-private) so statWeightsClient.test.ts can exercise the
 * per-split error check below with a fake pool, without needing a real wasm/Worker
 * environment.
 */
export async function runConcurrentSim(
	simWorkerPool: SimWorkerPool,
	request: RaidSimRequest,
	onIterationsSum: (sum: number) => void,
): Promise<RaidSimResult> {
	if (
		!wasmGlobals.raidSimRequestSplit ||
		!wasmGlobals.raidSimResultCombination
	) {
		throw new Error(
			"raidSimRequestSplit/raidSimResultCombination globals were not registered by the wasm module",
		);
	}

	const splitResBytes = wasmGlobals.raidSimRequestSplit(
		RaidSimRequestSplitRequest.toBinary(
			RaidSimRequestSplitRequest.create({
				splitCount: simWorkerPool.size,
				request,
			}),
		),
	);
	const splitRes = RaidSimRequestSplitResult.fromBinary(splitResBytes);
	if (splitRes.errorResult) {
		throw new Error(`Sim split failed: ${splitRes.errorResult}`);
	}

	const iterationsPerSlot = new Array(splitRes.requests.length).fill(0);
	const resultBytesList = await Promise.all(
		splitRes.requests.map((req, slot) =>
			simWorkerPool.run(slot, RaidSimRequest.toBinary(req), (completed) => {
				iterationsPerSlot[slot] = completed;
				onIterationsSum(iterationsPerSlot.reduce((a, b) => a + b, 0));
			}),
		),
	);
	const results = resultBytesList.map((b) => RaidSimResult.fromBinary(b));
	for (const result of results) {
		if (result.error) {
			throw new Error(`Sim split run failed: ${result.error.message}`);
		}
	}
	if (results.length === 1) return results[0];

	const combinedBytes = wasmGlobals.raidSimResultCombination(
		RaidSimResultCombinationRequest.toBinary(
			RaidSimResultCombinationRequest.create({ results }),
		),
	);
	return RaidSimResult.fromBinary(combinedBytes);
}

/**
 * Runs a full stat-weight calibration batch (baseline + every stat's low/high perturbation)
 * across a SimWorkerPool, reporting cumulative progress the same shape as the old
 * single-instance statWeightsAsync call did (`ProgressMetrics.totalIterations`/
 * `completedIterations`/`totalSims`/`completedSims`), so callers (calibrateWeights.ts) need no
 * changes.
 */
export async function runStatWeightsAsync(
	requestBytes: Uint8Array,
	onProgress?: (progress: ProgressMetrics) => void,
): Promise<StatWeightsResult> {
	await loadWasm();
	if (!wasmGlobals.statWeightRequests || !wasmGlobals.statWeightCompute) {
		throw new Error(
			"statWeightRequests/statWeightCompute globals were not registered by the wasm module",
		);
	}
	const simWorkerPool = getPool();

	const reqData = StatWeightRequestsData.fromBinary(
		wasmGlobals.statWeightRequests(requestBytes),
	);
	if (!reqData.baseRequest) {
		throw new Error("statWeightRequests returned no baseRequest");
	}

	const perRequestIterations: number[] = [
		reqData.baseRequest.simOptions?.iterations ?? 0,
	];
	for (const s of reqData.statSimRequests) {
		if (s.requestLow) {
			perRequestIterations.push(s.requestLow.simOptions?.iterations ?? 0);
		}
		perRequestIterations.push(s.requestHigh?.simOptions?.iterations ?? 0);
	}
	const totalIterations = perRequestIterations.reduce((a, b) => a + b, 0);
	const totalSims = perRequestIterations.length;

	let completedIterationsBase = 0;
	let simsDone = 0;
	let nextIterationsIndex = 0;
	const reportProgress = (currentRequestIterations: number) => {
		onProgress?.(
			ProgressMetrics.create({
				totalIterations,
				completedIterations: completedIterationsBase + currentRequestIterations,
				totalSims,
				completedSims: simsDone,
			}),
		);
	};

	const baseResult = await runConcurrentSim(
		simWorkerPool,
		reqData.baseRequest,
		reportProgress,
	);
	completedIterationsBase += perRequestIterations[nextIterationsIndex++];
	simsDone++;

	const calcRequest = StatWeightsCalcRequest.create({
		baseResult,
		epReferenceStat: reqData.epReferenceStat,
		statSimResults: [],
	});

	for (const statReqData of reqData.statSimRequests) {
		let lowRes: RaidSimResult | undefined;
		if (statReqData.requestLow) {
			lowRes = await runConcurrentSim(
				simWorkerPool,
				statReqData.requestLow,
				reportProgress,
			);
			completedIterationsBase += perRequestIterations[nextIterationsIndex++];
			simsDone++;
		}

		if (!statReqData.requestHigh) {
			throw new Error("statWeightRequests returned a stat with no requestHigh");
		}
		const highRes = await runConcurrentSim(
			simWorkerPool,
			statReqData.requestHigh,
			reportProgress,
		);
		completedIterationsBase += perRequestIterations[nextIterationsIndex++];
		simsDone++;

		calcRequest.statSimResults.push(
			StatWeightsStatResultData.create({
				statData: statReqData.statData,
				resultLow: lowRes,
				resultHigh: highRes,
			}),
		);
	}

	const weightResult = StatWeightsResult.fromBinary(
		wasmGlobals.statWeightCompute(StatWeightsCalcRequest.toBinary(calcRequest)),
	);
	if (weightResult.error) {
		throw new Error(`Sim calibration failed: ${weightResult.error.message}`);
	}
	return weightResult;
}
