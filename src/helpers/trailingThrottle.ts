// A trailing-edge throttle: the first call in a quiet period fires immediately, calls within
// `intervalMs` of the last fire are coalesced (only the latest value is kept), and that latest
// value fires once the interval elapses. Unlike a plain "drop calls that arrive too soon"
// throttle, this never silently loses the final state a caller cares about.
//
// Built for src/solver/index.ts's worker progress messages: a backgrounded browser tab keeps
// running sim Worker threads at full speed but deprioritizes the main thread's message
// processing, so refocusing the tab can dump a large backlog of queued "progress" messages at
// once. Each one used to trigger a React state update + re-render unconditionally, so draining
// hundreds of queued messages one-by-one was the actual cause of the multi-second "catching up"
// delay after refocusing - this throttle bounds that to roughly one render per `intervalMs`
// regardless of how many raw messages arrive in a burst.
export function createTrailingThrottle<T>(
	fn: (value: T) => void,
	intervalMs: number,
): (value: T) => void {
	let lastCallTime = -Infinity;
	let pending: T | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;

	const flush = (value: T) => {
		lastCallTime = Date.now();
		pending = undefined;
		fn(value);
	};

	return (value: T) => {
		const elapsed = Date.now() - lastCallTime;
		if (elapsed >= intervalMs) {
			flush(value);
			return;
		}
		pending = value;
		if (timer == null) {
			timer = setTimeout(() => {
				timer = undefined;
				if (pending !== undefined) flush(pending);
			}, intervalMs - elapsed);
		}
	};
}
