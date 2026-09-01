// A small pool of dedicated wasm-only Workers (simExecutor.worker.ts), each running its own
// independent Go-in-wasm instance, so calibration sim requests can run in true OS-thread
// parallel rather than one instance handling the whole batch single-threaded. Sizing mirrors
// wowsims' own ui/core/sim.ts:142-143 (`Math.min(4, hardwareConcurrency / 2)`) - this
// session's performance investigation confirmed ~3.4x real speedup at that worker count on
// real hardware, with negligible further gain past it (see docs/plans/sim-backed-objectives.md).
//
// Deliberately proto-agnostic: proto encode/decode happens inside simExecutor.worker.ts, so
// this class only ever routes plain {type, id, ...} messages.
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

export class SimWorkerPool {
	readonly size: number;
	private readonly workers: Worker[];

	constructor() {
		const cores = navigator.hardwareConcurrency || 4;
		this.size = Math.max(1, Math.min(4, Math.floor(cores / 2)));
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
			worker.postMessage({ type: "run", id, requestBytes });
		});
	}
}
