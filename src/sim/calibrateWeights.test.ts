import { describe, expect, it } from "vitest";
import { blendMetricEpValues } from "./calibrateWeights";
import type { StatWeightsResult } from "./proto/api.js";

// Stat enum ordinals from proto/common.ts, for readability below.
const STRENGTH = 0;
const STAMINA = 2;
const ARMOR = 31;

function fakeEpValues(stats: number[]) {
	return { epValues: { apiVersion: 0, stats, pseudoStats: [] } };
}

function fakeResult(overrides: Partial<StatWeightsResult>): StatWeightsResult {
	return overrides as StatWeightsResult;
}

describe("blendMetricEpValues", () => {
	it("a single nonzero ratio reproduces the old single-metric behavior, sign-flipped for lower-is-better metrics", () => {
		const stats: number[] = [];
		stats[STRENGTH] = 1.5;
		stats[STAMINA] = 2.0;
		const result = fakeResult({ tmi: fakeEpValues(stats) });

		const blended = blendMetricEpValues(result, ["Strength", "Stamina"], {
			tmi: 1,
		});

		// tmi is "lower is better" - epValues are unsigned, so the blend must sign-flip.
		expect(blended).toEqual([
			{ name: "Strength", value: -1.5, type: "flat" },
			{ name: "Stamina", value: -2.0, type: "flat" },
		]);
	});

	it("does not sign-flip a higher-is-better metric like tps", () => {
		const stats: number[] = [];
		stats[STRENGTH] = 3;
		const result = fakeResult({ tps: fakeEpValues(stats) });

		const blended = blendMetricEpValues(result, ["Strength"], { tps: 1 });

		expect(blended).toEqual([{ name: "Strength", value: 3, type: "flat" }]);
	});

	it("sums multiple nonzero-ratio metrics for the same stat", () => {
		const tpsStats: number[] = [];
		tpsStats[STAMINA] = 1;
		const dtpsStats: number[] = [];
		dtpsStats[STAMINA] = 2;
		const result = fakeResult({
			tps: fakeEpValues(tpsStats),
			dtps: fakeEpValues(dtpsStats),
		});

		const blended = blendMetricEpValues(result, ["Stamina"], {
			tps: 1,
			dtps: 0.5,
		});

		// tps: +1*1 = 1; dtps (lower-is-better): 0.5 * -1 * 2 = -1; total 0.
		expect(blended).toEqual([{ name: "Stamina", value: 0, type: "flat" }]);
	});

	it("skips a metric with a zero (or omitted) ratio even if present in the result", () => {
		const stats: number[] = [];
		stats[STAMINA] = 100;
		const result = fakeResult({ tmi: fakeEpValues(stats) });

		const blended = blendMetricEpValues(result, ["Stamina"], {
			tmi: 0,
			tps: undefined,
		});

		expect(blended).toEqual([{ name: "Stamina", value: 0, type: "flat" }]);
	});

	it("skips a metric with no epValues for a given stat rather than producing NaN", () => {
		const stats: number[] = [];
		stats[ARMOR] = 5;
		// Stamina has no entry in this metric's epValues at all.
		const result = fakeResult({ tmi: fakeEpValues(stats) });

		const blended = blendMetricEpValues(result, ["Stamina", "Armor"], {
			tmi: 1,
		});

		expect(blended).toEqual([
			{ name: "Stamina", value: 0, type: "flat" },
			{ name: "Armor", value: -5, type: "flat" },
		]);
	});
});
