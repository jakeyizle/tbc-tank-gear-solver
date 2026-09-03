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

export class SimWorkerPool {
	readonly size: number;
	private readonly workers: Worker[];

	/**
	 * @param desiredSize User-configured worker count (see SimCalibrationProfile.ts's
	 * `calibration.workerCount`), or 0/undefined for the auto-detected default above.
	 */
	constructor(desiredSize?: number) {
		this.size = resolveWorkerCount(desiredSize, navigator.hardwareConcurrency);
		this.workers = Array.from(
			{ length: this.size },
			() =>
				new Worker(new URL("./simExecutor.worker.ts", import.meta.url), {
					type: "module",
				}),
		);
	}

	/**
	 * Runs one RaidSimRequest's bytes on pool slot `slot` (wrapping around `size`), forwarding
	 * progress until the final result resolves.
	 */
	run(
		slot: number,
		requestBytes: Uint8Array,
		onProgress: (completedIterations: number) => void,
	): Promise<Uint8Array> {
		const worker = this.workers[slot % this.workers.length];
		const id = crypto.randomUUID();

		return new Promise((resolve) => {
			const handler = (e: MessageEvent<DoneMessage | ProgressMessage>) => {
				if (e.data.id !== id) return;
				if (e.data.type === "done") {
					worker.removeEventListener("message", handler);
					resolve(e.data.resultBytes);
					return;
				}
				onProgress(e.data.completedIterations);
			};
			worker.addEventListener("message", handler);
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
}
