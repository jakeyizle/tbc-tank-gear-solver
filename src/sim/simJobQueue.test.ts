import { describe, expect, it, vi } from "vitest";
import { RaidSimResult } from "./proto/api.js";
import { runSimJobQueue, type SimJob } from "./simJobQueue";
import type { SimWorkerPool } from "./simWorkerPool";

function job(id: string, totalIterations = 100): SimJob {
	return {
		id,
		requestBytes: new Uint8Array([Number(id.replace(/\D/g, "")) || 0]),
		totalIterations,
	};
}

/** A fake pool whose `run()` resolves after `latencyMs(jobIndexAcrossCalls)` ms, tracking
 * concurrent-per-slot usage and call order so tests can assert real pipelining. */
function fakePool(
	size: number,
	resultFor: (requestBytes: Uint8Array) => RaidSimResult = () =>
		RaidSimResult.create({}),
	latencyMs: (callIndex: number) => number = () => 0,
) {
	let callIndex = 0;
	const busyPerSlot = new Array<boolean>(size).fill(false);
	const concurrentSlotViolation = { happened: false };
	const callLog: { slot: number; start: number; end: number }[] = [];

	const run = vi.fn(
		async (
			slot: number,
			requestBytes: Uint8Array,
			onProgress: (n: number) => void,
		) => {
			if (busyPerSlot[slot]) concurrentSlotViolation.happened = true;
			busyPerSlot[slot] = true;
			const start = Date.now();
			const myIndex = callIndex++;
			onProgress(1);
			await new Promise((resolve) => setTimeout(resolve, latencyMs(myIndex)));
			busyPerSlot[slot] = false;
			callLog.push({ slot, start, end: Date.now() });
			return RaidSimResult.toBinary(resultFor(requestBytes));
		},
	);

	const pool = { size, run } as unknown as SimWorkerPool;
	return { pool, run, concurrentSlotViolation, callLog };
}

describe("runSimJobQueue", () => {
	it("runs all jobs and reports each one's done result", async () => {
		const { pool } = fakePool(2);
		const jobs = [job("a"), job("b"), job("c")];
		const done: string[] = [];

		await runSimJobQueue(pool, jobs, {
			onJobDone: (id) => done.push(id),
			onJobProgress: () => {},
		});

		expect(done.sort()).toEqual(["a", "b", "c"]);
	});

	it("never dispatches two jobs to the same slot concurrently", async () => {
		const { pool, concurrentSlotViolation } = fakePool(3, undefined, () => 5);
		const jobs = Array.from({ length: 20 }, (_, i) => job(`j${i}`));

		await runSimJobQueue(pool, jobs, {
			onJobDone: () => {},
			onJobProgress: () => {},
		});

		expect(concurrentSlotViolation.happened).toBe(false);
	});

	it("pipelines jobs: a free worker starts a new job before a slower sibling finishes", async () => {
		// Slot 0's first job is slow (50ms); slot 1's jobs are fast (1ms each). If slot 1 is
		// truly pipelined (not barrier-waiting on slot 0), it should complete several jobs
		// before slot 0's first job finishes.
		const { pool, callLog } = fakePool(2, undefined, (callIndex) =>
			callIndex === 0 ? 50 : 1,
		);
		const jobs = Array.from({ length: 10 }, (_, i) => job(`j${i}`));

		await runSimJobQueue(pool, jobs, {
			onJobDone: () => {},
			onJobProgress: () => {},
		});

		const slowEntry = callLog.reduce((a, b) =>
			b.end - b.start > a.end - a.start ? b : a,
		);
		const jobsFinishedBeforeSlowOne = callLog.filter(
			(c) => c !== slowEntry && c.end <= slowEntry.end,
		).length;
		expect(jobsFinishedBeforeSlowOne).toBeGreaterThan(1);
	});

	it("leaves extra workers idle without error when job count < pool size", async () => {
		const { pool, run } = fakePool(4);
		const jobs = [job("a")];

		await runSimJobQueue(pool, jobs, {
			onJobDone: () => {},
			onJobProgress: () => {},
		});

		expect(run).toHaveBeenCalledTimes(1);
	});

	it("processes all jobs correctly when job count > pool size", async () => {
		const { pool } = fakePool(2);
		const jobs = Array.from({ length: 7 }, (_, i) => job(`j${i}`));
		const done = new Set<string>();

		await runSimJobQueue(pool, jobs, {
			onJobDone: (id) => done.add(id),
			onJobProgress: () => {},
		});

		expect(done.size).toBe(7);
	});

	it("aborts the batch and stops dispatching further jobs when a pool.run() call rejects", async () => {
		let calls = 0;
		const pool = {
			size: 2,
			run: vi.fn(async () => {
				calls++;
				if (calls === 1) throw new Error("worker exploded");
				await new Promise((resolve) => setTimeout(resolve, 20));
				return RaidSimResult.toBinary(RaidSimResult.create({}));
			}),
		} as unknown as SimWorkerPool;
		const jobs = Array.from({ length: 20 }, (_, i) => job(`j${i}`));

		await expect(
			runSimJobQueue(pool, jobs, {
				onJobDone: () => {},
				onJobProgress: () => {},
			}),
		).rejects.toThrow("worker exploded");

		// Some in-flight jobs beyond the failing one may have already been dispatched before the
		// abort flag was observed, but the queue must not run every job to completion.
		expect(calls).toBeLessThan(jobs.length);
	});

	it("aborts the batch when a resolved result carries its own .error field", async () => {
		const { pool } = fakePool(2, () =>
			RaidSimResult.create({ error: { message: "sim panicked" } }),
		);
		const jobs = [job("a"), job("b")];

		await expect(
			runSimJobQueue(pool, jobs, {
				onJobDone: () => {},
				onJobProgress: () => {},
			}),
		).rejects.toThrow("sim panicked");
	});

	it("does not reject until every in-flight job on every slot has settled", async () => {
		let secondSlotSettled = false;
		const pool = {
			size: 2,
			run: vi.fn(async (slot: number) => {
				if (slot === 0) throw new Error("boom");
				await new Promise((resolve) => setTimeout(resolve, 30));
				secondSlotSettled = true;
				return RaidSimResult.toBinary(RaidSimResult.create({}));
			}),
		} as unknown as SimWorkerPool;
		const jobs = [job("a"), job("b")];

		await expect(
			runSimJobQueue(pool, jobs, {
				onJobDone: () => {},
				onJobProgress: () => {},
			}),
		).rejects.toThrow("boom");

		expect(secondSlotSettled).toBe(true);
	});

	it("reports per-job progress without double-counting across the whole batch", async () => {
		const { pool } = fakePool(1, undefined, () => 1);
		const jobs = [job("a", 100), job("b", 200)];
		const progressByJob: Record<string, number[]> = {};

		await runSimJobQueue(pool, jobs, {
			onJobDone: () => {},
			onJobProgress: (id, completed) => {
				if (!progressByJob[id]) progressByJob[id] = [];
				progressByJob[id].push(completed);
			},
		});

		expect(progressByJob.a).toEqual([1]);
		expect(progressByJob.b).toEqual([1]);
	});
});
