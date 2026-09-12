import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSolverWorker, solve, warmSolverWorker } from "./index";
import type { InputItem, LPItem } from "./types";

// The main-thread half of the solver Worker: one Worker for the whole session, with every
// request/reply correlated by id. Before this, solve() built and terminated a Worker per call,
// so "the message that arrived belongs to the solve currently awaiting" was automatic and
// none of the below could go wrong. Now it has to be arranged, so it has to be tested.
//
// The real solver.worker.ts is exercised separately by solver.worker.test.ts; this drives a
// fake Worker so it can post messages the real one only produces under a crash or a race.

interface PostedMessage {
	type: string;
	requestId: number;
	[key: string]: unknown;
}

class FakeWorker {
	static instances: FakeWorker[] = [];
	onmessage: ((e: { data: unknown }) => void) | null = null;
	onerror: ((e: { message: string }) => void) | null = null;
	posted: PostedMessage[] = [];
	terminated = false;

	constructor() {
		FakeWorker.instances.push(this);
	}

	postMessage(message: PostedMessage) {
		this.posted.push(message);
	}

	terminate() {
		this.terminated = true;
	}

	/** Drive a reply back to the main thread, as the real Worker runtime would. */
	reply(data: Record<string, unknown>) {
		this.onmessage?.({ data });
	}

	get lastRequestId(): number {
		const last = this.posted.at(-1);
		if (!last) throw new Error("FakeWorker received no message");
		return last.requestId;
	}
}

const solveOptions = {
	uncrushabilitySetting: 0,
	uncritabilitySetting: 0,
	optimizeStats: [],
	objectiveMode: "stats" as const,
	resistanceFloors: [],
	areEnchantsGemsLocked: false,
	excludeUniqueGems: false,
	excludeJewelcraftingItems: false,
	excludeEnchantingItems: false,
	phase: 3,
	raceId: "1",
	classId: "2",
	enabledConsumableIds: [],
};

const noItems: InputItem[] = [];
const solvedItems = [{ id: "28677" }] as unknown as LPItem[];

beforeEach(() => {
	FakeWorker.instances = [];
	vi.stubGlobal("Worker", FakeWorker);
	// console.table/log on the result path would otherwise spam the reporter.
	vi.spyOn(console, "table").mockImplementation(() => {});
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	resetSolverWorker();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

/** Lets the pending postMessage land before the fake Worker replies to it. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the shared solver Worker", () => {
	it("reuses one Worker across consecutive solves", async () => {
		const first = solve(noItems, solveOptions);
		await flush();
		const worker = FakeWorker.instances[0];
		worker.reply({
			type: "result",
			requestId: worker.lastRequestId,
			items: [],
		});
		await first;

		const second = solve(noItems, solveOptions);
		await flush();
		worker.reply({
			type: "result",
			requestId: worker.lastRequestId,
			items: solvedItems,
		});

		await expect(second).resolves.toEqual(solvedItems);
		// The whole point: no second instantiation, so the wasm and the database survive.
		expect(FakeWorker.instances).toHaveLength(1);
		expect(worker.terminated).toBe(false);
	});

	it("gives each request a distinct id", async () => {
		const first = solve(noItems, solveOptions);
		await flush();
		const worker = FakeWorker.instances[0];
		const firstId = worker.lastRequestId;
		worker.reply({ type: "result", requestId: firstId, items: [] });
		await first;

		const second = solve(noItems, solveOptions);
		await flush();
		const secondId = worker.lastRequestId;
		expect(secondId).not.toBe(firstId);
		worker.reply({ type: "result", requestId: secondId, items: [] });
		await second;
	});

	it("drops a late message from an already-settled request", async () => {
		const onProgress = vi.fn();
		const first = solve(noItems, solveOptions, onProgress);
		await flush();
		const worker = FakeWorker.instances[0];
		const staleId = worker.lastRequestId;
		worker.reply({ type: "result", requestId: staleId, items: [] });
		await first;

		const onSecondProgress = vi.fn();
		const second = solve(noItems, solveOptions, onSecondProgress);
		await flush();

		// A progress message from the FIRST request, arriving after the second has started.
		// With a per-solve Worker this could not happen; here it must not reach the second.
		worker.reply({
			type: "progress",
			requestId: staleId,
			iteration: 9,
			maxIterations: 9,
		});
		await flush();
		expect(onSecondProgress).not.toHaveBeenCalled();

		worker.reply({
			type: "result",
			requestId: worker.lastRequestId,
			items: solvedItems,
		});
		await expect(second).resolves.toEqual(solvedItems);
	});

	it("routes progress to the request that asked for it, without its envelope fields", async () => {
		const onProgress = vi.fn();
		const pending = solve(noItems, solveOptions, onProgress);
		await flush();
		const worker = FakeWorker.instances[0];
		worker.reply({
			type: "progress",
			requestId: worker.lastRequestId,
			iteration: 3,
			maxIterations: 10,
		});
		// createTrailingThrottle delivers the leading edge synchronously.
		expect(onProgress).toHaveBeenCalledWith({
			iteration: 3,
			maxIterations: 10,
		});

		worker.reply({
			type: "result",
			requestId: worker.lastRequestId,
			items: [],
		});
		await pending;
	});

	it("rejects with the worker's message and recycles the Worker on error", async () => {
		const pending = solve(noItems, solveOptions);
		await flush();
		const worker = FakeWorker.instances[0];
		worker.reply({
			type: "error",
			requestId: worker.lastRequestId,
			message: "No stats are weighted, so every gear set scores the same.",
		});

		await expect(pending).rejects.toThrow(
			"No stats are weighted, so every gear set scores the same.",
		);
		// A Go panic leaves the wasm runtime dead and is indistinguishable from a clean throw,
		// so the instance is thrown away rather than reused - see routeWorkerMessage.
		expect(worker.terminated).toBe(true);
	});

	it("recovers after a failed solve: the next solve builds a fresh Worker and succeeds", async () => {
		const failing = solve(noItems, solveOptions);
		await flush();
		const first = FakeWorker.instances[0];
		first.reply({
			type: "error",
			requestId: first.lastRequestId,
			message: "boom",
		});
		await expect(failing).rejects.toThrow("boom");

		const recovered = solve(noItems, solveOptions);
		await flush();
		expect(FakeWorker.instances).toHaveLength(2);
		const second = FakeWorker.instances[1];
		second.reply({
			type: "result",
			requestId: second.lastRequestId,
			items: solvedItems,
		});
		await expect(recovered).resolves.toEqual(solvedItems);
	});

	it("fails an in-flight solve when the Worker itself errors", async () => {
		const pending = solve(noItems, solveOptions);
		await flush();
		const worker = FakeWorker.instances[0];
		worker.onerror?.({ message: "worker exploded" });

		await expect(pending).rejects.toThrow("worker exploded");
		expect(worker.terminated).toBe(true);
	});
});

describe("warmSolverWorker", () => {
	it("spawns the Worker, asks it to warm, and resolves when it reports back", async () => {
		const warming = warmSolverWorker();
		await flush();
		const worker = FakeWorker.instances[0];
		expect(worker.posted[0]).toMatchObject({ type: "warm" });

		worker.reply({ type: "warmed", requestId: worker.lastRequestId });
		await expect(warming).resolves.toBeUndefined();
	});

	it("leaves the warmed Worker in place for the solve that follows", async () => {
		const warming = warmSolverWorker();
		await flush();
		const worker = FakeWorker.instances[0];
		worker.reply({ type: "warmed", requestId: worker.lastRequestId });
		await warming;

		const pending = solve(noItems, solveOptions);
		await flush();
		expect(FakeWorker.instances).toHaveLength(1);
		worker.reply({
			type: "result",
			requestId: worker.lastRequestId,
			items: solvedItems,
		});
		await expect(pending).resolves.toEqual(solvedItems);
	});
});
