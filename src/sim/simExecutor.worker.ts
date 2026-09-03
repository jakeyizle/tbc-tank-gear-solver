// One independent wasm module instance running inside its own dedicated Worker thread, so
// multiple of these can run Go sim computation in true OS-thread parallel - a single wasm
// instance in one thread cannot, since each Go-in-wasm call blocks its thread until finished
// (see vendor/tbc-sim/sim/core/sim.go's IsRunningInWasm() single-threaded RunSim path).
// Spawned and pooled by simWorkerPool.ts; mirrors wowsims' own worker_pool.ts SimWorker,
// scoped down to just the raidSimAsync call this app's calibration pool needs.
import "./wasm_exec.js";
import { ProgressMetrics, RaidSimResult } from "./proto/api.js";

interface GoWasmGlobals {
	wasmready?: () => void;
	raidSimAsync?: (
		requestBytes: Uint8Array,
		onProgress: (progressBytes: Uint8Array) => void,
		requestId: string,
	) => void;
	Go?: new () => {
		importObject: WebAssembly.Imports;
		run: (instance: WebAssembly.Instance) => Promise<void>;
	};
}

const wasmGlobals = globalThis as unknown as GoWasmGlobals;

// tsconfig's lib list doesn't include "webworker" (this repo is otherwise a plain DOM app), so
// `postMessage` here resolves to Window's (targetOrigin, not transfer-list) overload - cast to
// the DedicatedWorkerGlobalScope shape this file actually runs under instead of pulling in the
// whole webworker lib for one call shape.
const postWorkerMessage = postMessage as (
	message: unknown,
	transfer?: Transferable[],
) => void;

const ready = new Promise<void>((resolve) => {
	wasmGlobals.wasmready = () => resolve();
	if (!wasmGlobals.Go) {
		throw new Error("wasm_exec.js did not register globalThis.Go");
	}
	const go = new wasmGlobals.Go();
	fetch("/sim/lib.wasm")
		.then((r) => WebAssembly.instantiateStreaming(r, go.importObject))
		.then((result) => go.run(result.instance));
});

interface RunMessage {
	type: "run";
	id: string;
	requestBytes: Uint8Array;
}

self.onmessage = async (e: MessageEvent<RunMessage>) => {
	await ready;
	if (!wasmGlobals.raidSimAsync) {
		throw new Error(
			"raidSimAsync global was not registered by the wasm module",
		);
	}
	const { id, requestBytes } = e.data;

	wasmGlobals.raidSimAsync(
		requestBytes,
		(progressBytes) => {
			const metrics = ProgressMetrics.fromBinary(progressBytes);
			if (metrics.finalRaidResult) {
				const resultBytes = RaidSimResult.toBinary(metrics.finalRaidResult);
				// Transfer, not clone - see simWorkerPool.ts's postMessage for why this matters
				// (SaveAllValues means this can be a large per-iteration array).
				postWorkerMessage({ type: "done", id, resultBytes }, [
					resultBytes.buffer,
				]);
				return;
			}
			postWorkerMessage({
				type: "progress",
				id,
				completedIterations: metrics.completedIterations,
			});
		},
		id,
	);
};
