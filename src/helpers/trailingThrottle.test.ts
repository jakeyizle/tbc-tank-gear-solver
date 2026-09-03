import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTrailingThrottle } from "./trailingThrottle";

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

describe("createTrailingThrottle", () => {
	it("fires immediately for the first call after a quiet period", () => {
		const fn = vi.fn();
		const throttled = createTrailingThrottle(fn, 150);

		throttled("a");

		expect(fn).toHaveBeenCalledExactlyOnceWith("a");
	});

	it("coalesces calls within the interval into a single trailing call with the latest value", () => {
		const fn = vi.fn();
		const throttled = createTrailingThrottle(fn, 150);

		throttled("a");
		fn.mockClear();

		throttled("b");
		throttled("c");
		throttled("d");
		expect(fn).not.toHaveBeenCalled();

		vi.advanceTimersByTime(150);
		expect(fn).toHaveBeenCalledExactlyOnceWith("d");
	});

	it("never drops the final value, even under a continuous burst", () => {
		const fn = vi.fn();
		const throttled = createTrailingThrottle(fn, 150);

		for (let i = 0; i < 300; i++) {
			throttled(i);
			vi.advanceTimersByTime(1);
		}
		vi.advanceTimersByTime(150);

		expect(fn).toHaveBeenLastCalledWith(299);
		// 300 raw calls over ~450ms at a 150ms interval should collapse to roughly 3-4 actual
		// fires, not 300 - this is the whole point of the throttle.
		expect(fn.mock.calls.length).toBeLessThan(10);
	});

	it("fires again immediately once a full interval has passed with no pending call", () => {
		const fn = vi.fn();
		const throttled = createTrailingThrottle(fn, 150);

		throttled("a");
		vi.advanceTimersByTime(200);
		fn.mockClear();

		throttled("b");
		expect(fn).toHaveBeenCalledExactlyOnceWith("b");
	});
});
