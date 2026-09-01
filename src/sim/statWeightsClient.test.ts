// Regression coverage for a real bug found while building the parallel worker-pool
// calibration path: combining split RaidSimResults without checking each one's `.error`
// first crashed the Go-side combiner with a nil-pointer panic (an errored split's
// RaidMetrics is never populated) instead of surfacing a clear JS error. These tests fake
// the wasm globals and the SimWorkerPool so they can exercise runConcurrentSim's error
// handling without a real wasm/Worker environment (mirroring how statWeights.integration.test.ts
// notes that a real browser Worker context isn't available under plain Node/vitest).
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	RaidSimRequest,
	RaidSimRequestSplitRequest,
	RaidSimRequestSplitResult,
	RaidSimResult,
	RaidSimResultCombinationRequest,
} from "./proto/api.js";
import type { SimWorkerPool } from "./simWorkerPool";
import { runConcurrentSim } from "./statWeightsClient";

/** A fake pool that hands back one pre-built RaidSimResult (as bytes) per slot, in order. */
function fakePool(resultsBySlot: RaidSimResult[]): SimWorkerPool {
	return {
		size: resultsBySlot.length,
		run: vi.fn(async (slot: number) =>
			RaidSimResult.toBinary(resultsBySlot[slot]),
		),
	} as unknown as SimWorkerPool;
}

/** Stubs the wasm globals runConcurrentSim calls directly (raidSimRequestSplit/combination). */
function stubWasmGlobals(splitCount: number) {
	const globals = globalThis as unknown as {
		raidSimRequestSplit?: (bytes: Uint8Array) => Uint8Array;
		raidSimResultCombination?: (bytes: Uint8Array) => Uint8Array;
	};

	globals.raidSimRequestSplit = vi.fn((bytes: Uint8Array) => {
		const req = RaidSimRequestSplitRequest.fromBinary(bytes);
		return RaidSimRequestSplitResult.toBinary(
			RaidSimRequestSplitResult.create({
				splitsDone: splitCount,
				requests: Array.from({ length: splitCount }, () => req.request!),
			}),
		);
	});

	const combineSpy = vi.fn((bytes: Uint8Array) => {
		const req = RaidSimResultCombinationRequest.fromBinary(bytes);
		return RaidSimResult.toBinary(req.results[0]);
	});
	globals.raidSimResultCombination = combineSpy;

	return { combineSpy };
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("runConcurrentSim", () => {
	it("throws instead of combining when any split result has an error", async () => {
		const { combineSpy } = stubWasmGlobals(2);
		const pool = fakePool([
			RaidSimResult.create({ error: { message: "boom" } }),
			RaidSimResult.create({}),
		]);

		await expect(
			runConcurrentSim(pool, RaidSimRequest.create({}), () => {}),
		).rejects.toThrow("Sim split run failed: boom");

		expect(combineSpy).not.toHaveBeenCalled();
	});

	it("combines multiple error-free splits", async () => {
		const { combineSpy } = stubWasmGlobals(2);
		const pool = fakePool([
			RaidSimResult.create({ iterationsDone: 100 }),
			RaidSimResult.create({ iterationsDone: 100 }),
		]);

		const result = await runConcurrentSim(
			pool,
			RaidSimRequest.create({}),
			() => {},
		);

		expect(combineSpy).toHaveBeenCalledOnce();
		expect(result.error).toBeUndefined();
	});

	it("skips combination entirely for a single split", async () => {
		const { combineSpy } = stubWasmGlobals(1);
		const pool = fakePool([RaidSimResult.create({ iterationsDone: 100 })]);

		const result = await runConcurrentSim(
			pool,
			RaidSimRequest.create({}),
			() => {},
		);

		expect(combineSpy).not.toHaveBeenCalled();
		expect(result.iterationsDone).toBe(100);
	});

	it("reports the running sum of completedIterations across slots as they report in", async () => {
		stubWasmGlobals(2);
		let resolveSlot0!: (bytes: Uint8Array) => void;
		let resolveSlot1!: (bytes: Uint8Array) => void;
		const pool = {
			size: 2,
			run: vi
				.fn()
				.mockImplementationOnce(
					(
						_slot: number,
						_bytes: Uint8Array,
						onProgress: (n: number) => void,
					) =>
						new Promise<Uint8Array>((resolve) => {
							onProgress(40);
							resolveSlot0 = resolve;
						}),
				)
				.mockImplementationOnce(
					(
						_slot: number,
						_bytes: Uint8Array,
						onProgress: (n: number) => void,
					) =>
						new Promise<Uint8Array>((resolve) => {
							onProgress(25);
							resolveSlot1 = resolve;
						}),
				),
		} as unknown as SimWorkerPool;

		const sums: number[] = [];
		const donePromise = runConcurrentSim(
			pool,
			RaidSimRequest.create({}),
			(sum) => sums.push(sum),
		);

		expect(sums).toEqual([40, 65]);

		resolveSlot0(RaidSimResult.toBinary(RaidSimResult.create({})));
		resolveSlot1(RaidSimResult.toBinary(RaidSimResult.create({})));
		await donePromise;
	});
});
