// Loads the vendored tbc-new WASM sim (built by `npm run sim:build-wasm` into
// public/sim/lib.wasm) and exposes its statWeights()/statWeightsAsync() calls as plain async
// functions.
//
// Callers run this from inside src/solver/solver.worker.ts, which is already off the main
// thread — module Web Workers support fetch/WebAssembly/dynamic import just fine, so there's
// no need for a second dedicated Worker here (an earlier version of this file was one; it
// added a postMessage round-trip for no benefit, since the only caller is itself already
// inside a worker).
import "./wasm_exec.js";
import { ProgressMetrics, type StatWeightsResult } from "./proto/api.js";

interface GoWasmGlobals {
	wasmready?: () => void;
	statWeights?: (requestBytes: Uint8Array) => Uint8Array;
	statWeightsAsync?: (
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

/**
 * Calls the wasm module's statWeightsAsync() export, lazily loading it on first use.
 * `onProgress` fires repeatedly (at most ~10Hz per sim run, already rate-limited on the Go
 * side - see sim/core/sim.go's `time.Since(st) > time.Millisecond*100` check) with
 * cumulative progress across the whole calibration batch, until the final message (carrying
 * `finalWeightResult`) resolves the returned promise.
 */
export async function runStatWeightsAsync(
	requestBytes: Uint8Array,
	onProgress?: (progress: ProgressMetrics) => void,
): Promise<StatWeightsResult> {
	await loadWasm();
	if (!wasmGlobals.statWeightsAsync) {
		throw new Error(
			"statWeightsAsync global was not registered by the wasm module",
		);
	}
	const statWeightsAsync = wasmGlobals.statWeightsAsync;

	// Go tracks in-flight requests in a global map keyed by this id (see
	// sim/core/simsignals/api.go's RegisterWithId) - it must be both non-empty and unique
	// per call, not a fixed placeholder (an empty string fails registration outright with
	// "Couldn't register for signal API: id is empty").
	const requestId = crypto.randomUUID();

	return new Promise<StatWeightsResult>((resolve, reject) => {
		statWeightsAsync(
			requestBytes,
			(progressBytes) => {
				const metrics = ProgressMetrics.fromBinary(progressBytes);
				if (metrics.finalWeightResult) {
					if (metrics.finalWeightResult.error) {
						reject(
							new Error(
								`Sim calibration failed: ${metrics.finalWeightResult.error.message}`,
							),
						);
					} else {
						resolve(metrics.finalWeightResult);
					}
					return;
				}
				onProgress?.(metrics);
			},
			requestId,
		);
	});
}
