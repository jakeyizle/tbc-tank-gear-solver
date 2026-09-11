// Owns the single "coordinator" instance of the vendored tbc-new WASM sim (built by
// `npm run sim:build-wasm` into public/sim/lib.wasm.gz).
//
// Extracted from statWeightsClient so that every cheap, non-iteration-bound wasm call
// (statWeightRequests, statWeightCompute, computeStats) shares ONE Go instance. Two modules
// each running their own `go.run` would mean two 37MB instances and two sets of registered
// globals clobbering each other on globalThis.
//
// The pool of *iteration-bound* workers is a separate thing entirely - see simWorkerPool.ts.
import "./wasm_exec.js";
import { perfTrace } from "#/helpers/perfTrace";
import { fetchWasmModule } from "./fetchWasmModule";

export interface GoWasmGlobals {
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
	/**
	 * Builds a character and returns its stats without running a single sim iteration.
	 * vendor/tbc-sim/sim/wasm/main.go:44.
	 */
	computeStats?: (requestBytes: Uint8Array) => Uint8Array;
	Go?: new () => {
		importObject: WebAssembly.Imports;
		run: (instance: WebAssembly.Instance) => Promise<void>;
	};
}

export const wasmGlobals = globalThis as unknown as GoWasmGlobals;

let wasmReady: Promise<void> | undefined;

export function loadWasm(): Promise<void> {
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

/**
 * Drops the cached instance so the next loadWasm() builds a fresh one. See
 * statWeightsClient's resetSimEnvironment for why long-lived instances are recycled.
 */
export function resetCoordinatorWasm(): void {
	wasmReady = undefined;
}
