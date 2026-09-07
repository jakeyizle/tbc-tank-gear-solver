// A small pool of dedicated wasm-only Workers (simExecutor.worker.ts), each running its own
// independent Go-in-wasm instance, so calibration sim requests can run in true OS-thread
// parallel rather than one instance handling the whole batch single-threaded. Default sizing
// mirrors wowsims' own ui/core/sim.ts:142-143 (`Math.min(4, hardwareConcurrency / 2)`) - this
// session's performance investigation confirmed ~3.4x real speedup at that worker count on
// real hardware, with negligible further gain past it (see docs/plans/sim-backed-objectives.md).
// A caller can override this via the constructor's `desiredSize` (see
// SimCalibrationProfile.ts's `calibration.workerCount` - surfaced as a user setting since the
// "negligible further gain" finding was measured on one machine, not every user's).
//
// Deliberately proto-agnostic: proto encode/decode happens inside simExecutor.worker.ts, so
// this class only ever routes plain {type, id, ...} messages.
//
// Both directions transfer (not clone) their Uint8Array payload's underlying buffer - found to
// matter in practice: `SaveAllValues` is set unconditionally for every calibration sim (see
// statweight.go), so a request/result can carry a full per-iteration array, and a
// structured-clone copy of that on every one of the 100+ sim calls a solve makes was a real,
// repeated cost competing with the main thread even at workerCount=1 (reported as UI "hiccups"
// that persisted after lowering the worker count, which ruled out plain CPU-thread
// oversubscription as the sole cause).
import { perfTrace } from "#/helpers/perfTrace";

interface DoneMessage {
	type: "done";
	id: string;
	resultBytes: Uint8Array;
}
interface ProgressMessage {
	type: "progress";
	id: string;
	completedIterations: number;
}
// Posted once, right after a fresh worker's wasm module finishes instantiating (see
// simExecutor.worker.ts) - lets createWorker() below measure each pool worker's actual
// wasm-instantiate cost, the thing needed to tell whether statWeightsClient.ts's
// resetSimEnvironment() (which recycles this whole pool between calibration rounds) is an
// expensive operation or a nearly-free one.
interface ReadyMessage {
	type: "ready";
	readyMs: number;
}

/**
 * Resolves the actual worker count to use: `desiredSize` (rounded down) when explicitly set to
 * a positive number, otherwise the auto-detected default. Extracted as a pure function so the
 * sizing logic can be unit tested without a real `navigator`/`Worker` environment.
 */
export function resolveWorkerCount(
	desiredSize: number | undefined,
	hardwareConcurrency: number,
): number {
	if (desiredSize && desiredSize > 0) {
		return Math.floor(desiredSize);
	}
	const cores = hardwareConcurrency || 4;
	return Math.max(1, Math.min(4, Math.floor(cores / 2)));
}

// How long run() will wait for ANY message (progress or done) on a call before treating the
// worker as hung and rejecting. Chosen to be far longer than any normal gap between progress
// ticks, but short enough to fail a stuck solve in well under a minute rather than forever - see
// this file's header comment and statWeightsClient.ts's measureRaidSim doc comment for the
// precedent this guards against (a long-lived reused wasm instance wedging after enough
// cumulative calls).
const WATCHDOG_TIMEOUT_MS = 45_000;

function createWorker(): Worker {
	const worker = new Worker(
		new URL("./simExecutor.worker.ts", import.meta.url),
		{
			type: "module",
		},
	);
	// One-time listener for this worker's single "ready" message - removes itself once fired, so
	// it never interferes with run()'s own per-call message listeners (which filter by `id`, a
	// field a "ready" message never carries).
	const onReady = (
		e: MessageEvent<ReadyMessage | DoneMessage | ProgressMessage>,
	) => {
		if (e.data.type !== "ready") return;
		perfTrace.record("simWorkerWasmInstantiate", e.data.readyMs);
		worker.removeEventListener("message", onReady);
	};
	worker.addEventListener("message", onReady);
	return worker;
}

export class SimWorkerPool {
	readonly size: number;
	private workers: Worker[];

	/**
	 * @param desiredSize User-configured worker count (see SimCalibrationProfile.ts's
	 * `calibration.workerCount`), or 0/undefined for the auto-detected default above.
	 */
	constructor(desiredSize?: number) {
		this.size = resolveWorkerCount(desiredSize, navigator.hardwareConcurrency);
		this.workers = Array.from({ length: this.size }, () => createWorker());
	}

	/**
	 * Runs one RaidSimRequest's bytes on pool slot `slot` (wrapping around `size`), forwarding
	 * progress until the final result resolves.
	 *
	 * Rejects (instead of hanging forever) if the worker never posts any message - progress or
	 * done - for WATCHDOG_TIMEOUT_MS, or if the worker itself errors/crashes. On a watchdog
	 * timeout specifically, the wedged worker is also terminated and replaced in-place with a
	 * fresh one, so the slot isn't permanently dead for subsequent calls.
	 */
	run(
		slot: number,
		requestBytes: Uint8Array,
		onProgress: (completedIterations: number) => void,
	): Promise<Uint8Array> {
		const workerSlot = slot % this.workers.length;
		const worker = this.workers[workerSlot];
		const id = crypto.randomUUID();

		return new Promise((resolve, reject) => {
			let timer: ReturnType<typeof setTimeout>;
			const startedAt = Date.now();

			const cleanup = () => {
				clearTimeout(timer);
				worker.removeEventListener("message", messageHandler);
				worker.removeEventListener("error", errorHandler);
			};

			const resetWatchdog = () => {
				clearTimeout(timer);
				timer = setTimeout(() => {
					const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
					console.error(
						`[sim] Worker slot ${workerSlot} stopped responding for ${WATCHDOG_TIMEOUT_MS / 1000}s (${elapsedSec}s since request started) - treating as hung.`,
					);
					cleanup();
					worker.terminate();
					this.workers[workerSlot] = createWorker();
					reject(
						new Error(
							`Sim worker (slot ${workerSlot}) stopped responding and was recycled. The calibration batch must be re-run.`,
						),
					);
				}, WATCHDOG_TIMEOUT_MS);
			};

			const messageHandler = (
				e: MessageEvent<DoneMessage | ProgressMessage>,
			) => {
				if (e.data.id !== id) return;
				resetWatchdog();
				if (e.data.type === "done") {
					cleanup();
					perfTrace.record("simWorkerRoundTrip", Date.now() - startedAt);
					resolve(e.data.resultBytes);
					return;
				}
				onProgress(e.data.completedIterations);
			};
			const errorHandler = (e: ErrorEvent) => {
				console.error(`[sim] Worker slot ${workerSlot} errored:`, e.message);
				cleanup();
				reject(
					new Error(`Sim worker (slot ${workerSlot}) errored: ${e.message}`),
				);
			};

			worker.addEventListener("message", messageHandler);
			worker.addEventListener("error", errorHandler);
			resetWatchdog();
			// Transfer (not clone) the buffer - with SaveAllValues set unconditionally for every
			// calibration sim (see statweight.go), a RaidSimRequest/Result can carry full
			// per-iteration arrays, and a structured-clone copy of that on every single sim call
			// (there can be 100+ per solve) was a real, repeated main-thread-competing cost
			// independent of worker count - see this file's header comment.
			worker.postMessage({ type: "run", id, requestBytes }, [
				requestBytes.buffer,
			]);
		});
	}

	/**
	 * Terminates all current workers and replaces them with a fresh set - used to periodically
	 * reset accumulated wasm-instance state between calibration rounds (see
	 * statWeightsClient.ts's resetSimEnvironment), before it can reach the hang threshold
	 * described in this file's header comment. Keeps this SimWorkerPool's own identity stable so
	 * callers holding a reference (getPool()) need no changes.
	 */
	recycle(): void {
		for (const worker of this.workers) {
			worker.terminate();
		}
		this.workers = Array.from({ length: this.size }, () => createWorker());
	}

	/** Terminates every worker in the pool, freeing each one's wasm instance/memory immediately. */
	terminate(): void {
		for (const worker of this.workers) {
			worker.terminate();
		}
	}
}
