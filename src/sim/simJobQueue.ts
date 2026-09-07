// Runs a flat list of independent RaidSimRequests (calibration's baseline + per-stat
// perturbation requests, across one or more replicates - see calibrateWeights.ts) across a
// SimWorkerPool as a pipelined job queue, instead of statWeightsClient.ts's old model of
// splitting each request across the whole pool and barrier-waiting before starting the next
// one. See docs/plans/sim-backed-objectives.md and this session's own investigation for why:
// splitting was measured to add ~0% total CPU overhead (no meaningful per-chunk setup cost to
// amortize), so the only real win here is letting independent requests - most importantly,
// independent *replicates* - actually run concurrently instead of one after another, which
// splitting-per-request could never do (it only ever has one logical request in flight).
//
// Each of the pool's `size` worker slots runs its own runner loop that claims whole, unsplit
// jobs one at a time for as long as the queue has work - never more than one job per slot at
// once (see the busy-flag assertion below): simExecutor.worker.ts starts a fresh raidSimAsync
// call per message with no per-worker busy check of its own, so two concurrent run() calls on
// the same slot would run two sims inside one single-threaded Go instance, corrupting timing
// and roughly doubling that worker's memory.
import { perfTrace } from "#/helpers/perfTrace";
import { RaidSimResult } from "./proto/api.js";
import type { SimWorkerPool } from "./simWorkerPool";

export interface SimJob {
	id: string;
	requestBytes: Uint8Array;
	totalIterations: number;
}

export interface SimJobQueueCallbacks {
	/** Fires once, with the full decoded result, as soon as a job finishes successfully. */
	onJobDone: (jobId: string, result: RaidSimResult) => void;
	/** Fires zero or more times per job with its own cumulative completedIterations. */
	onJobProgress: (jobId: string, completedIterations: number) => void;
}

/**
 * Runs every job in `jobs` across `pool`'s worker slots, at most one job per slot at a time,
 * pulling the next job as soon as a slot frees up. Rejects with the first job's error (either a
 * rejected `pool.run()` call, or a resolved `RaidSimResult` carrying its own `.error` field -
 * both must fail the whole batch, mirroring statWeightsClient.ts's old runConcurrentSim, which
 * checked `.error` on every split result before combining, precisely because an errored result's
 * RaidMetrics is never populated and crashed the Go-side combiner when it slipped through - see
 * statWeightsClient.test.ts's regression case).
 *
 * On the first failure, stops dispatching new jobs but waits for every already-dispatched job on
 * every slot to settle before rejecting - a slot's SimWorkerPool state must never be left
 * "still running" when this function returns, since a caller retrying (e.g. a fresh
 * runSimJobQueue call reusing the same pool) would otherwise be able to issue a second run() on
 * a slot that's still mid-sim.
 */
export async function runSimJobQueue(
	pool: SimWorkerPool,
	jobs: SimJob[],
	callbacks: SimJobQueueCallbacks,
): Promise<void> {
	let nextIndex = 0;
	let aborted = false;
	let firstError: unknown;
	const slotBusy = new Array<boolean>(pool.size).fill(false);

	async function runSlot(slot: number): Promise<void> {
		while (!aborted) {
			const index = nextIndex;
			if (index >= jobs.length) return;
			nextIndex = index + 1;
			const job = jobs[index];

			if (slotBusy[slot]) {
				throw new Error(
					`SimJobQueue: slot ${slot} was asked to run a job while already busy - this indicates a scheduling bug, not a transient failure.`,
				);
			}
			slotBusy[slot] = true;
			try {
				const resultBytes = await pool.run(
					slot,
					job.requestBytes,
					(completed) => callbacks.onJobProgress(job.id, completed),
				);
				const result = perfTrace.time("decodeSimResult", () =>
					RaidSimResult.fromBinary(resultBytes),
				);
				if (result.error) {
					throw new Error(`Sim job failed: ${result.error.message}`);
				}
				callbacks.onJobDone(job.id, result);
			} catch (err) {
				if (!aborted) {
					aborted = true;
					firstError = err;
				}
				return;
			} finally {
				slotBusy[slot] = false;
			}
		}
	}

	await Promise.allSettled(
		Array.from({ length: Math.min(pool.size, jobs.length) }, (_, slot) =>
			runSlot(slot),
		),
	);

	if (aborted) {
		throw firstError instanceof Error
			? firstError
			: new Error(String(firstError));
	}
}
