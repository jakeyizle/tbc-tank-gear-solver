import { describe, expect, it, vi } from "vitest";
import { PerfTrace } from "./perfTrace";

describe("PerfTrace", () => {
	it("aggregates count/total/avg/min/max across repeated records of the same name", () => {
		const trace = new PerfTrace();
		trace.record("a", 10);
		trace.record("a", 30);
		trace.record("a", 20);

		const row = trace.summary().find((r) => r.name === "a");
		expect(row).toEqual({
			name: "a",
			count: 3,
			totalMs: 60,
			avgMs: 20,
			minMs: 10,
			maxMs: 30,
			pctOfTotal: 100,
		});
	});

	it("sorts the summary by totalMs descending", () => {
		const trace = new PerfTrace();
		trace.record("small", 5);
		trace.record("big", 100);
		trace.record("medium", 20);

		expect(trace.summary().map((r) => r.name)).toEqual([
			"big",
			"medium",
			"small",
		]);
	});

	it("computes pctOfTotal across the grand total of every span, not just siblings", () => {
		const trace = new PerfTrace();
		trace.record("a", 25);
		trace.record("b", 75);

		const [b, a] = trace.summary();
		expect(a.pctOfTotal).toBeCloseTo(25);
		expect(b.pctOfTotal).toBeCloseTo(75);
	});

	it("returns pctOfTotal of 0 for every row when nothing has been recorded", () => {
		const trace = new PerfTrace();
		expect(trace.summary()).toEqual([]);
	});

	it("time() records a sync function's duration even when it throws, and rethrows", () => {
		const trace = new PerfTrace();
		const nowSpy = vi
			.spyOn(performance, "now")
			.mockReturnValueOnce(0)
			.mockReturnValueOnce(15);

		expect(() =>
			trace.time("boom", () => {
				throw new Error("boom");
			}),
		).toThrow("boom");

		expect(trace.summary()).toEqual([
			expect.objectContaining({ name: "boom", count: 1, totalMs: 15 }),
		]);
		nowSpy.mockRestore();
	});

	it("timeAsync() records an async function's duration even when it rejects, and rethrows", async () => {
		const trace = new PerfTrace();
		const nowSpy = vi
			.spyOn(performance, "now")
			.mockReturnValueOnce(100)
			.mockReturnValueOnce(140);

		await expect(
			trace.timeAsync("asyncBoom", async () => {
				throw new Error("async boom");
			}),
		).rejects.toThrow("async boom");

		expect(trace.summary()).toEqual([
			expect.objectContaining({ name: "asyncBoom", count: 1, totalMs: 40 }),
		]);
		nowSpy.mockRestore();
	});

	it("mark() returns a stop() that both records and returns the elapsed ms", () => {
		const trace = new PerfTrace();
		const nowSpy = vi
			.spyOn(performance, "now")
			.mockReturnValueOnce(0)
			.mockReturnValueOnce(12);

		const stop = trace.mark("span");
		const elapsed = stop();

		expect(elapsed).toBe(12);
		expect(trace.summary()).toEqual([
			expect.objectContaining({ name: "span", totalMs: 12 }),
		]);
		nowSpy.mockRestore();
	});

	it("recordGap records the remainder of a parent's time not covered by its children", () => {
		const trace = new PerfTrace();
		trace.recordGap("round:0", 100, [30, 40]);

		expect(trace.summary()).toEqual([
			expect.objectContaining({ name: "round:0:unaccounted", totalMs: 30 }),
		]);
	});

	it("recordGap clamps to 0 rather than going negative when children overrun the parent", () => {
		const trace = new PerfTrace();
		trace.recordGap("round:0", 50, [30, 40]);

		expect(trace.summary()).toEqual([
			expect.objectContaining({ name: "round:0:unaccounted", totalMs: 0 }),
		]);
	});

	it("totalFor returns the current recorded total, or 0 if never recorded", () => {
		const trace = new PerfTrace();
		trace.record("a", 10);
		trace.record("a", 5);

		expect(trace.totalFor("a")).toBe(15);
		expect(trace.totalFor("never-recorded")).toBe(0);
	});

	it("reset() clears every recorded span", () => {
		const trace = new PerfTrace();
		trace.record("a", 10);
		trace.reset();

		expect(trace.summary()).toEqual([]);
	});

	it("log() prints a labeled console.table of the current summary", () => {
		const trace = new PerfTrace();
		trace.record("a", 10);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const tableSpy = vi.spyOn(console, "table").mockImplementation(() => {});

		trace.log("my label");

		expect(logSpy).toHaveBeenCalledWith("[perf] my label");
		expect(tableSpy).toHaveBeenCalledWith(trace.summary());
		logSpy.mockRestore();
		tableSpy.mockRestore();
	});
});
