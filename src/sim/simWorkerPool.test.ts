import { describe, expect, it } from "vitest";
import { resolveWorkerCount } from "./simWorkerPool";

describe("resolveWorkerCount", () => {
	it("uses the explicit desiredSize when positive, rounding down", () => {
		expect(resolveWorkerCount(3, 16)).toBe(3);
		expect(resolveWorkerCount(2.9, 16)).toBe(2);
	});

	it("falls back to auto-detect when desiredSize is 0 or undefined", () => {
		expect(resolveWorkerCount(0, 16)).toBe(4);
		expect(resolveWorkerCount(undefined, 16)).toBe(4);
	});

	it("auto-detect caps at 4 and floors at 1, scaling with hardwareConcurrency", () => {
		expect(resolveWorkerCount(undefined, 16)).toBe(4);
		expect(resolveWorkerCount(undefined, 4)).toBe(2);
		expect(resolveWorkerCount(undefined, 1)).toBe(1);
		expect(resolveWorkerCount(undefined, 0)).toBe(2);
	});

	it("an explicit desiredSize is not capped at 4, unlike auto-detect", () => {
		expect(resolveWorkerCount(8, 16)).toBe(8);
	});
});
