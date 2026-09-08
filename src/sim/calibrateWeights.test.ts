import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Stat, StatName } from "#/solver/types";
import { DEFAULT_SIM_CALIBRATION_PROFILE } from "#/types/SimCalibrationProfile";
import type { RaidSimResult, StatWeightsResult } from "./proto/api.js";
import type { SimJob } from "./simJobQueue";

// Mocked so runCalibrationBatches tests below can exercise its replicate-unification logic
// (concatenating every replicate's jobs into one shared SimJobQueue dispatch) without a real
// wasm/Worker environment - this file otherwise has zero mocking, since everything else it
// tests is pure post-processing math over hand-built fixtures.
vi.mock("./buildStatWeightsRequest", () => ({
	buildStatWeightsRequest: vi.fn(
		(_gear, _db, _stats, _iterations, _profile, seedOverride) => ({
			simOptions: { iterations: _iterations, randomSeed: seedOverride },
		}),
	),
}));
vi.mock("./statWeightsClient", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./statWeightsClient")>();
	return {
		...actual,
		buildStatWeightJobs: vi.fn(),
		computeStatWeightsFromJobResults: vi.fn(),
		getPool: vi.fn(() => ({ size: 4 })),
	};
});
vi.mock("./simJobQueue", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./simJobQueue")>();
	return { ...actual, runSimJobQueue: vi.fn() };
});

import { buildStatWeightsRequest } from "./buildStatWeightsRequest";
import {
	averageSimMetricsSnapshots,
	averageStatStdevs,
	averageStats,
	blendMetricEpValueStdevs,
	blendMetricEpValues,
	blendNormalizedPerMetricWeights,
	type CalibrationBatch,
	computePerMetricStatWeights,
	extractSimMetrics,
	metricRatiosForBalance,
	normalizeStatVector,
	runCalibrationBatches,
	type SimMetric,
} from "./calibrateWeights";
import { runSimJobQueue } from "./simJobQueue";
import {
	buildStatWeightJobs,
	computeStatWeightsFromJobResults,
} from "./statWeightsClient";

// Stat enum ordinals from proto/common.ts, for readability below.
const STRENGTH = 0;
const STAMINA = 2;
const SPELL_DAMAGE = 5; // SIM_METRIC_REFERENCE_STAT.tps (StatSpellDamage)
const ARMOR = 31; // SIM_METRIC_REFERENCE_STAT.dtps/tmi (StatArmor)
const EXPERTISE = 24;

// blendMetricEpValues/blendMetricEpValueStdevs now recompute the EP ratio themselves from the
// raw `weights`/`weightsStdev` fields (see epValueForStat's doc comment on why - the wasm sim's
// own precomputed `epValues` field silently discards real sign information via an unconditional
// math.Abs()), so fixtures below build `weights`/`weightsStdev` directly, including a reference
// stat entry (SPELL_DAMAGE for tps, ARMOR for dtps/tmi) alongside whatever's under test - a
// fixture that omits it is deliberately testing the "no reference weight" skip case.
function fakeWeights(stats: number[]) {
	return { weights: { apiVersion: 0, stats, pseudoStats: [] } };
}

function fakeWeightStdevs(stats: number[]) {
	return { weightsStdev: { apiVersion: 0, stats, pseudoStats: [] } };
}

/** blendMetricEpValueStdevs needs both `weights` (for the reference-weight lookup) and
 * `weightsStdev` (the value under test) on the same metric. */
function fakeMetric(weights: number[], weightsStdev: number[]) {
	return { ...fakeWeights(weights), ...fakeWeightStdevs(weightsStdev) };
}

function fakeResult(overrides: Partial<StatWeightsResult>): StatWeightsResult {
	return overrides as StatWeightsResult;
}

describe("blendMetricEpValues", () => {
	it("computes EP as raw weight / reference-stat weight, preserving a genuinely negative sign", () => {
		const stats: number[] = [];
		stats[SPELL_DAMAGE] = 6; // tps's own reference stat (SIM_METRIC_REFERENCE_STAT.tps)
		stats[STRENGTH] = 3;
		stats[STAMINA] = -3; // a stat with a real negative slope against this metric
		const result = fakeResult({ tps: fakeWeights(stats) });

		const blended = blendMetricEpValues(result, ["Strength", "Stamina"], {
			tps: 1,
		});

		expect(blended).toEqual([
			{ name: "Strength", value: 0.5, type: "flat" },
			{ name: "Stamina", value: -0.5, type: "flat" },
		]);
	});

	it("a lower-is-better metric (tmi) still comes out positive when both slopes share a sign", () => {
		const stats: number[] = [];
		stats[ARMOR] = -2; // tmi/dtps's own reference stat, itself negative-sloped (more armor -> less damage taken)
		stats[STAMINA] = -6; // also negative-sloped (more stamina -> lower TMI) -> ratio is positive
		const result = fakeResult({ tmi: fakeWeights(stats) });

		const blended = blendMetricEpValues(result, ["Stamina"], { tmi: 1 });

		expect(blended).toEqual([{ name: "Stamina", value: 3, type: "flat" }]);
	});

	it("sums multiple nonzero-ratio metrics for the same stat", () => {
		const tpsStats: number[] = [];
		tpsStats[SPELL_DAMAGE] = 1;
		tpsStats[STAMINA] = 1;
		const dtpsStats: number[] = [];
		dtpsStats[ARMOR] = 1;
		dtpsStats[STAMINA] = 2;
		const result = fakeResult({
			tps: fakeWeights(tpsStats),
			dtps: fakeWeights(dtpsStats),
		});

		const blended = blendMetricEpValues(result, ["Stamina"], {
			tps: 1,
			dtps: 0.5,
		});

		// tps: 1 * (1/1) = 1; dtps: 0.5 * (2/1) = 1; total 2.
		expect(blended).toEqual([{ name: "Stamina", value: 2, type: "flat" }]);
	});

	it("skips a metric with a zero (or omitted) ratio even if present in the result", () => {
		const stats: number[] = [];
		stats[ARMOR] = 1;
		stats[STAMINA] = 100;
		const result = fakeResult({ tmi: fakeWeights(stats) });

		const blended = blendMetricEpValues(result, ["Stamina"], {
			tmi: 0,
			tps: undefined,
		});

		expect(blended).toEqual([{ name: "Stamina", value: 0, type: "flat" }]);
	});

	it("skips a stat with no weight of its own for a given metric rather than producing NaN", () => {
		const stats: number[] = [];
		stats[ARMOR] = 5;
		// Stamina has no entry in this metric's weights at all.
		const result = fakeResult({ tmi: fakeWeights(stats) });

		const blended = blendMetricEpValues(result, ["Stamina", "Armor"], {
			tmi: 1,
		});

		expect(blended).toEqual([
			{ name: "Stamina", value: 0, type: "flat" },
			// Armor is dtps/tmi's own reference stat here, so its EP against itself is 1 - not
			// its raw weight (5) - see epValueForStat.
			{ name: "Armor", value: 1, type: "flat" },
		]);
	});

	it("skips every stat for a metric whose own reference-stat weight is exactly 0 (mirrors statweight.go's bailout)", () => {
		const stats: number[] = [];
		stats[STAMINA] = 100;
		// No ARMOR entry at all - tmi/dtps's reference stat weight reads as 0/undefined, which
		// statweight.go's own calcEpResults treats as "no usable EP value", not "EP value of 0".
		const result = fakeResult({ tmi: fakeWeights(stats) });

		const blended = blendMetricEpValues(result, ["Stamina"], { tmi: 1 });

		expect(blended).toEqual([{ name: "Stamina", value: 0, type: "flat" }]);
	});
});

describe("metricRatiosForBalance", () => {
	it("balance=1 gives tps all the weight", () => {
		expect(metricRatiosForBalance(1, "tmi")).toEqual({ tps: 1, tmi: 0 });
	});

	it("balance=0 gives the survivability metric all the weight", () => {
		expect(metricRatiosForBalance(0, "dtps")).toEqual({ tps: 0, dtps: 1 });
	});

	it("balance=0.5 splits evenly between tps and the survivability metric", () => {
		expect(metricRatiosForBalance(0.5, "tmi")).toEqual({ tps: 0.5, tmi: 0.5 });
	});

	it("clamps balance above 1 down to 1", () => {
		expect(metricRatiosForBalance(1.5, "dtps")).toEqual({ tps: 1, dtps: 0 });
	});

	it("clamps balance below 0 up to 0", () => {
		expect(metricRatiosForBalance(-0.5, "tmi")).toEqual({ tps: 0, tmi: 1 });
	});
});

describe("blendMetricEpValueStdevs", () => {
	it("divides the sim's raw population stdev by sqrt(iterations) to get a standard error, unsigned", () => {
		const weights: number[] = [];
		weights[ARMOR] = 1; // tmi's reference stat weight - magnitude 1, so it doesn't rescale the result
		const stdevs: number[] = [];
		stdevs[STAMINA] = 2.0;
		const result = fakeResult({ tmi: fakeMetric(weights, stdevs) });

		// Stamina is two-sided, so effective n = iterations = 100 -> sqrt(100) = 10.
		const blended = blendMetricEpValueStdevs(
			result,
			["Stamina"],
			{ tmi: 1 },
			100,
		);

		// A stdev is never negative, regardless of the metric's own "bigger/smaller is better"
		// convention or the reference stat's sign.
		expect(blended).toEqual([{ name: "Stamina", value: 0.2, type: "flat" }]);
	});

	it("halves the effective sample size (n = iterations/2) for one-sided stats", () => {
		const weights: number[] = [];
		weights[ARMOR] = 1;
		const stdevs: number[] = [];
		stdevs[EXPERTISE] = 20;
		const result = fakeResult({ tmi: fakeMetric(weights, stdevs) });

		// Expertise is one-sided (see ONE_SIDED_CALIBRATION_STATS), so effective n =
		// iterations/2 = 100 -> sqrt(100) = 10, not sqrt(200).
		const blended = blendMetricEpValueStdevs(
			result,
			["Expertise"],
			{ tmi: 1 },
			200,
		);

		expect(blended).toEqual([{ name: "Expertise", value: 2, type: "flat" }]);
	});

	it("divides by the reference stat's weight MAGNITUDE, keeping the stdev non-negative even when the reference weight is negative", () => {
		const weights: number[] = [];
		weights[ARMOR] = -2; // a real, negative-sloped reference weight (see blendMetricEpValues)
		const stdevs: number[] = [];
		stdevs[STAMINA] = 4.0;
		const result = fakeResult({ tmi: fakeMetric(weights, stdevs) });

		// epStdev = 4.0 / |-2| = 2.0; SE = 2.0 / sqrt(100) = 0.2 - not negative, and not flipped
		// by the reference weight's sign.
		const blended = blendMetricEpValueStdevs(
			result,
			["Stamina"],
			{ tmi: 1 },
			100,
		);

		expect(blended).toEqual([{ name: "Stamina", value: 0.2, type: "flat" }]);
	});

	it("combines multiple metrics' standard errors by summing variances, not the values themselves", () => {
		const tpsWeights: number[] = [];
		tpsWeights[SPELL_DAMAGE] = 1;
		const tpsStdevs: number[] = [];
		tpsStdevs[STAMINA] = 30;
		const dtpsWeights: number[] = [];
		dtpsWeights[ARMOR] = 1;
		const dtpsStdevs: number[] = [];
		dtpsStdevs[STAMINA] = 40;
		const result = fakeResult({
			tps: fakeMetric(tpsWeights, tpsStdevs),
			dtps: fakeMetric(dtpsWeights, dtpsStdevs),
		});

		// iterations = 100 -> sqrt(100) = 10, so the per-metric standard errors are 3 and 4.
		const blended = blendMetricEpValueStdevs(
			result,
			["Stamina"],
			{ tps: 1, dtps: 1 },
			100,
		);

		// sqrt(3^2 + 4^2) = 5, the classic 3-4-5 triangle - a plain sum (7) would be wrong.
		expect(blended).toEqual([{ name: "Stamina", value: 5, type: "flat" }]);
	});

	it("skips a metric with a zero (or omitted) ratio", () => {
		const weights: number[] = [];
		weights[ARMOR] = 1;
		const stdevs: number[] = [];
		stdevs[STAMINA] = 100;
		const result = fakeResult({ tmi: fakeMetric(weights, stdevs) });

		const blended = blendMetricEpValueStdevs(
			result,
			["Stamina"],
			{ tmi: 0, tps: undefined },
			100,
		);

		expect(blended).toEqual([{ name: "Stamina", value: 0, type: "flat" }]);
	});

	it("skips a stat with no stdev of its own for a given metric rather than producing NaN", () => {
		const weights: number[] = [];
		weights[ARMOR] = 1;
		const stdevs: number[] = [];
		stdevs[ARMOR] = 50;
		// Stamina has no entry in this metric's weightsStdev at all.
		const result = fakeResult({ tmi: fakeMetric(weights, stdevs) });

		const blended = blendMetricEpValueStdevs(
			result,
			["Stamina", "Armor"],
			{ tmi: 1 },
			100,
		);

		expect(blended).toEqual([
			{ name: "Stamina", value: 0, type: "flat" },
			{ name: "Armor", value: 5, type: "flat" },
		]);
	});

	it("skips every stat for a metric whose own reference-stat weight is exactly 0 (mirrors statweight.go's bailout)", () => {
		const stdevs: number[] = [];
		stdevs[STAMINA] = 100;
		// No ARMOR entry in `weights` at all.
		const result = fakeResult({ tmi: fakeMetric([], stdevs) });

		const blended = blendMetricEpValueStdevs(
			result,
			["Stamina"],
			{ tmi: 1 },
			100,
		);

		expect(blended).toEqual([{ name: "Stamina", value: 0, type: "flat" }]);
	});
});

describe("computePerMetricStatWeights", () => {
	it("derives each metric's own pure breakdown from the same batch, independent of the others", () => {
		const strengthStats: number[] = [];
		strengthStats[SPELL_DAMAGE] = 1; // tps's own reference stat
		strengthStats[STRENGTH] = 1;
		const staminaStats: number[] = [];
		staminaStats[ARMOR] = 1; // dtps's own reference stat
		staminaStats[STAMINA] = 1;
		const armorStats: number[] = [];
		armorStats[ARMOR] = 1; // tmi's own reference stat - Armor itself here, see below

		const batch: CalibrationBatch = {
			result: fakeResult({
				tps: fakeWeights(strengthStats),
				dtps: fakeWeights(staminaStats),
				tmi: fakeWeights(armorStats),
			}),
		};

		const { weights } = computePerMetricStatWeights(
			[batch],
			["Strength", "Stamina", "Armor"],
			100,
		);

		expect(weights.tps).toEqual([
			{ name: "Strength", value: 1, type: "flat" },
			{ name: "Stamina", value: 0, type: "flat" },
			{ name: "Armor", value: 0, type: "flat" },
		]);
		expect(weights.dtps).toEqual([
			{ name: "Strength", value: 0, type: "flat" },
			{ name: "Stamina", value: 1, type: "flat" },
			// Armor is dtps's own reference stat and has a weight entry here (shared with
			// Stamina's fixture array), so its EP against itself is 1, not 0 - see
			// epValueForStat's doc comment: a reference stat's EP relative to itself is always 1.
			{ name: "Armor", value: 1, type: "flat" },
		]);
		expect(weights.tmi).toEqual([
			{ name: "Strength", value: 0, type: "flat" },
			{ name: "Stamina", value: 0, type: "flat" },
			{ name: "Armor", value: 1, type: "flat" },
		]);
	});

	it("averages each metric's stdev across multiple batches independently", () => {
		// Population stdevs of 20 and 40 - divided by sqrt(iterations=100)=10 first (Stamina is
		// two-sided) to get per-batch standard errors of 2 and 4.
		const refWeight: number[] = [];
		refWeight[SPELL_DAMAGE] = 1;
		const staminaStdevLow: number[] = [];
		staminaStdevLow[STAMINA] = 20;
		const staminaStdevHigh: number[] = [];
		staminaStdevHigh[STAMINA] = 40;

		const batches: CalibrationBatch[] = [
			{
				result: fakeResult({
					tps: fakeMetric(refWeight, staminaStdevLow),
				}),
			},
			{
				result: fakeResult({
					tps: fakeMetric(refWeight, staminaStdevHigh),
				}),
			},
		];

		const { stdevs } = computePerMetricStatWeights(batches, ["Stamina"], 100);

		// averageStatStdevs divides the mean stdev by sqrt(N), not a plain average - see that
		// function's own tests: mean(2, 4) = 3, N = 2 -> 3 / sqrt(2).
		expect(stdevs.tps[0].value).toBeCloseTo(3 / Math.sqrt(2));
	});
});

function fakeStats(entries: [StatName, number][]): Stat[] {
	return entries.map(([name, value]) => ({ name, value, type: "flat" }));
}

function fakePerMetric(
	entries: Partial<Record<SimMetric, [StatName, number][]>>,
): Record<SimMetric, Stat[]> {
	return Object.fromEntries(
		Object.entries(entries).map(([metric, stats]) => [
			metric,
			fakeStats(stats as [StatName, number][]),
		]),
	) as Record<SimMetric, Stat[]>;
}

describe("normalizeStatVector", () => {
	it("rescales a vector to unit L2 norm", () => {
		const { normalized, scale } = normalizeStatVector(
			fakeStats([
				["Strength", 3],
				["Stamina", 4],
			]),
		);

		// sqrt(3^2 + 4^2) = 5.
		expect(scale).toBe(5);
		expect(normalized).toEqual(
			fakeStats([
				["Strength", 0.6],
				["Stamina", 0.8],
			]),
		);
	});

	it("returns an all-zero vector unchanged with scale 1, not NaN", () => {
		const stats = fakeStats([["Strength", 0]]);
		expect(normalizeStatVector(stats)).toEqual({
			normalized: stats,
			scale: 1,
		});
	});
});

describe("blendNormalizedPerMetricWeights", () => {
	it("a pure single-metric ratio returns that metric's vector scaled to a unit vector, preserving relative proportions", () => {
		const weights = fakePerMetric({
			tps: [
				["Strength", 3],
				["Stamina", 4],
			],
		});
		const stdevs = fakePerMetric({
			tps: [
				["Strength", 0.3],
				["Stamina", 0.4],
			],
		});

		const { weights: blended } = blendNormalizedPerMetricWeights(
			weights,
			stdevs,
			{
				tps: 1,
			},
		);

		// Same 3:4 ratio as the raw input, just rescaled to a unit vector (magnitude 1) - the LP
		// picks the same optimal item set under any uniform positive rescale of its objective, so
		// single-metric-mode item selection is unaffected by this normalization.
		expect(blended.find((s) => s.name === "Strength")?.value).toBeCloseTo(0.6);
		expect(blended.find((s) => s.name === "Stamina")?.value).toBeCloseTo(0.8);
	});

	it("a 50/50 blend gives both metrics comparable influence even when their raw magnitudes differ by 20x", () => {
		// Mirrors the reported bug: tmi's raw epValues are much larger in magnitude than tps's
		// (tmi normalizes against Armor's slope, tps against Spell Power's - two unrelated
		// quantities). A naive raw blend would be dominated almost entirely by tmi; normalizing
		// each metric to a unit vector first should give each an equal-magnitude say instead.
		const weights = fakePerMetric({
			tps: [["Dodge", 0.5]],
			tmi: [["Dodge", 10]],
		});
		const stdevs = fakePerMetric({
			tps: [["Dodge", 0]],
			tmi: [["Dodge", 0]],
		});

		const { weights: blended } = blendNormalizedPerMetricWeights(
			weights,
			stdevs,
			{
				tps: 0.5,
				tmi: 0.5,
			},
		);

		// Each metric's single-stat vector normalizes to exactly 1 (its own norm), so a 50/50
		// blend should land at 0.5 + 0.5 = 1, not be dominated by tmi's larger raw magnitude.
		expect(blended[0].value).toBeCloseTo(1);
	});

	it("scales stdevs by the same per-metric factor used to normalize that metric's weights", () => {
		const weights = fakePerMetric({ tps: [["Dodge", 4]] }); // norm = 4
		const stdevs = fakePerMetric({ tps: [["Dodge", 2]] });

		const { stdevs: blended } = blendNormalizedPerMetricWeights(
			weights,
			stdevs,
			{
				tps: 1,
			},
		);

		// stdev 2 / scale 4 = 0.5.
		expect(blended[0].value).toBeCloseTo(0.5);
	});

	it("combines multiple metrics' normalized standard errors by summing variances", () => {
		const weights = fakePerMetric({
			tps: [["Dodge", 1]], // norm = 1
			tmi: [["Dodge", 1]], // norm = 1
		});
		const stdevs = fakePerMetric({
			tps: [["Dodge", 3]],
			tmi: [["Dodge", 4]],
		});

		const { stdevs: blended } = blendNormalizedPerMetricWeights(
			weights,
			stdevs,
			{
				tps: 1,
				tmi: 1,
			},
		);

		// sqrt(3^2 + 4^2) = 5, the classic 3-4-5 triangle.
		expect(blended[0].value).toBeCloseTo(5);
	});
});

describe("blendNormalizedPerMetricWeights with metricScales", () => {
	it("divides a metric's vector by the given metricScales entry directly, not a computed norm", () => {
		const weights = fakePerMetric({ tps: [["Strength", 3]] });
		const stdevs = fakePerMetric({ tps: [["Strength", 0.3]] });

		const { weights: blended, stdevs: blendedStdevs } =
			blendNormalizedPerMetricWeights(weights, stdevs, { tps: 1 }, { tps: 6 });

		// 3 / 6 = 0.5 - not 3/3=1 (plain L2 norm of a single-value vector is just its own value).
		expect(blended[0].value).toBeCloseTo(0.5);
		expect(blendedStdevs[0].value).toBeCloseTo(0.05);
	});

	it("a metric wasting weight on an unreachable stat gets a larger effective share when its real measured scale is smaller than plain L2's norm", () => {
		// Mirrors the real finding: tps puts a large raw weight on Expertise (unreachable in the
		// real item pool, so an LP-measured scale would come out small/degenerate for it in
		// isolation) and a smaller one on Strength; tmi puts its weight on Stamina. A real
		// LP-measured scale for tps (reflecting only what it can actually achieve) is smaller than
		// tps's own plain L2 norm (sqrt(8^2+1^2)=8.06), giving Strength a bigger effective share.
		const weights = fakePerMetric({
			tps: [
				["Expertise", 8],
				["Strength", 1],
			],
			tmi: [["Stamina", 1]],
		});
		const stdevs = fakePerMetric({
			tps: [
				["Expertise", 0],
				["Strength", 0],
			],
			tmi: [["Stamina", 0]],
		});
		const ratios = { tps: 0.5, tmi: 0.5 };

		const plainL2 = blendNormalizedPerMetricWeights(weights, stdevs, ratios);
		const measured = blendNormalizedPerMetricWeights(weights, stdevs, ratios, {
			tps: 2,
			tmi: 1,
		});

		const strengthPlain = plainL2.weights.find(
			(s) => s.name === "Strength",
		)?.value;
		const strengthMeasured = measured.weights.find(
			(s) => s.name === "Strength",
		)?.value;
		expect(strengthMeasured).toBeGreaterThan(strengthPlain as number);
	});

	it("falls back to plain L2 for a metric with no metricScales entry, a non-positive, or a non-finite one", () => {
		const weights = fakePerMetric({ tps: [["Strength", 3]] });
		const stdevs = fakePerMetric({ tps: [["Strength", 0]] });
		const expected = blendNormalizedPerMetricWeights(weights, stdevs, {
			tps: 1,
		});

		expect(
			blendNormalizedPerMetricWeights(weights, stdevs, { tps: 1 }, {}),
		).toEqual(expected);
		expect(
			blendNormalizedPerMetricWeights(weights, stdevs, { tps: 1 }, { tps: 0 }),
		).toEqual(expected);
		expect(
			blendNormalizedPerMetricWeights(weights, stdevs, { tps: 1 }, { tps: -5 }),
		).toEqual(expected);
		expect(
			blendNormalizedPerMetricWeights(
				weights,
				stdevs,
				{ tps: 1 },
				{ tps: Number.NaN },
			),
		).toEqual(expected);
	});

	it("a pure single-metric ratio still just uniformly rescales, regardless of metricScales", () => {
		const weights = fakePerMetric({
			tps: [
				["Expertise", 8],
				["Strength", 1],
			],
		});
		const stdevs = fakePerMetric({
			tps: [
				["Expertise", 0],
				["Strength", 0],
			],
		});

		const { weights: blended } = blendNormalizedPerMetricWeights(
			weights,
			stdevs,
			{ tps: 1 },
			{ tps: 4 },
		);

		// Same 8:1 ratio as the raw input - a single-metric blend only ever rescales by one
		// positive scalar, regardless of which scale source computed it, so the LP would still
		// pick the same items as an unnormalized (or plain-L2-normalized) solve.
		const expertise = blended.find((s) => s.name === "Expertise")?.value ?? 0;
		const strength = blended.find((s) => s.name === "Strength")?.value ?? 0;
		expect(expertise / strength).toBeCloseTo(8);
	});
});

describe("averageStats", () => {
	it("averages values for stats appearing in every replicate", () => {
		const averaged = averageStats([
			[{ name: "Stamina", value: 2, type: "flat" }],
			[{ name: "Stamina", value: 4, type: "flat" }],
			[{ name: "Stamina", value: 6, type: "flat" }],
		]);

		expect(averaged).toEqual([{ name: "Stamina", value: 4, type: "flat" }]);
	});

	it("averages each stat independently when replicates carry multiple stats", () => {
		const averaged = averageStats([
			[
				{ name: "Stamina", value: 1, type: "flat" },
				{ name: "Armor", value: 10, type: "flat" },
			],
			[
				{ name: "Stamina", value: 3, type: "flat" },
				{ name: "Armor", value: 20, type: "flat" },
			],
		]);

		expect(averaged).toEqual([
			{ name: "Stamina", value: 2, type: "flat" },
			{ name: "Armor", value: 15, type: "flat" },
		]);
	});

	it("returns a single replicate's values unchanged", () => {
		const averaged = averageStats([
			[{ name: "Stamina", value: 5, type: "flat" }],
		]);

		expect(averaged).toEqual([{ name: "Stamina", value: 5, type: "flat" }]);
	});
});

describe("averageStatStdevs", () => {
	it("divides the mean stdev by sqrt(N), not just averaging the stdevs", () => {
		// mean stdev = 3; N = 4 replicates -> combined stdev = 3 / 2 = 1.5.
		const combined = averageStatStdevs([
			[{ name: "Stamina", value: 2, type: "flat" }],
			[{ name: "Stamina", value: 3, type: "flat" }],
			[{ name: "Stamina", value: 3, type: "flat" }],
			[{ name: "Stamina", value: 4, type: "flat" }],
		]);

		expect(combined).toEqual([{ name: "Stamina", value: 1.5, type: "flat" }]);
	});

	it("leaves a single replicate's stdev unchanged (sqrt(1) = 1)", () => {
		const combined = averageStatStdevs([
			[{ name: "Stamina", value: 5, type: "flat" }],
		]);

		expect(combined).toEqual([{ name: "Stamina", value: 5, type: "flat" }]);
	});
});

describe("averageSimMetricsSnapshots", () => {
	it("averages each field independently across replicates", () => {
		const averaged = averageSimMetricsSnapshots([
			{ tps: 5000, dtps: 1000, tmi5: 10 },
			{ tps: 6000, dtps: 1200, tmi5: 12 },
		]);

		expect(averaged).toEqual({ tps: 5500, dtps: 1100, tmi5: 11 });
	});

	it("returns undefined for an empty list rather than dividing by zero", () => {
		expect(averageSimMetricsSnapshots([])).toBeUndefined();
	});
});

function fakeRaidSimResult(overrides: Partial<RaidSimResult>): RaidSimResult {
	return overrides as RaidSimResult;
}

describe("extractSimMetrics", () => {
	it("reads threat/dtps/tmi averages off the first party's first player", () => {
		const result = fakeRaidSimResult({
			raidMetrics: {
				parties: [
					{
						players: [
							{
								threat: { avg: 5000 },
								dtps: { avg: 1200 },
								tmi: { avg: 3500 },
							},
						],
					},
				],
			},
		} as unknown as Partial<RaidSimResult>);

		expect(extractSimMetrics(result)).toEqual({
			tps: 5000,
			dtps: 1200,
			tmi5: 3500,
		});
	});

	it("returns zeros rather than throwing when the player/parties are missing", () => {
		expect(extractSimMetrics(fakeRaidSimResult({}))).toEqual({
			tps: 0,
			dtps: 0,
			tmi5: 0,
		});
		expect(
			extractSimMetrics(
				fakeRaidSimResult({
					raidMetrics: {
						parties: [],
					} as unknown as RaidSimResult["raidMetrics"],
				}),
			),
		).toEqual({ tps: 0, dtps: 0, tmi5: 0 });
	});

	it("returns zeros for a metric missing on an otherwise-present player", () => {
		const result = fakeRaidSimResult({
			raidMetrics: {
				parties: [{ players: [{ threat: { avg: 5000 } }] }],
			} as unknown as RaidSimResult["raidMetrics"],
		});

		expect(extractSimMetrics(result)).toEqual({
			tps: 5000,
			dtps: 0,
			tmi5: 0,
		});
	});
});

describe("runCalibrationBatches", () => {
	function job(id: string): SimJob {
		return { id, requestBytes: new Uint8Array(), totalIterations: 10 };
	}

	const gear = [] as unknown as Parameters<typeof runCalibrationBatches>[0];
	const db = {} as unknown as Parameters<typeof runCalibrationBatches>[1];
	const statsToWeigh = ["Stamina"] as unknown as Parameters<
		typeof runCalibrationBatches
	>[2];
	const profile = {
		...DEFAULT_SIM_CALIBRATION_PROFILE,
		calibration: {
			...DEFAULT_SIM_CALIBRATION_PROFILE.calibration,
			replicates: 2,
		},
	};

	beforeEach(() => {
		vi.mocked(buildStatWeightsRequest).mockClear();
		vi.mocked(buildStatWeightJobs).mockReset();
		vi.mocked(runSimJobQueue).mockReset();
		vi.mocked(computeStatWeightsFromJobResults).mockReset();
	});

	it("concatenates every replicate's jobs into one shared runSimJobQueue dispatch, each replicate keeping its own seed", async () => {
		vi.mocked(buildStatWeightJobs)
			.mockImplementationOnce(async () => ({
				jobs: [job("a"), job("b")],
				reqData: { replicate: 0 } as never,
			}))
			.mockImplementationOnce(async () => ({
				jobs: [job("c")],
				reqData: { replicate: 1 } as never,
			}));
		vi.mocked(runSimJobQueue).mockImplementation(
			async (_pool, jobs, callbacks) => {
				for (const j of jobs) callbacks.onJobDone(j.id, {} as never);
			},
		);
		vi.mocked(computeStatWeightsFromJobResults).mockImplementation(
			(reqData) => ({ baseline: undefined, __reqData: reqData }) as never,
		);

		const batches = await runCalibrationBatches(
			gear,
			db,
			statsToWeigh,
			profile,
		);

		// One unified dispatch, not one per replicate.
		expect(runSimJobQueue).toHaveBeenCalledTimes(1);
		const dispatchedJobs = vi.mocked(runSimJobQueue).mock.calls[0][1];
		expect(dispatchedJobs.map((j) => j.id).sort()).toEqual(
			["rep:0:a", "rep:0:b", "rep:1:c"].sort(),
		);

		// Each replicate got computeStatWeightsFromJobResults called once, with only its own
		// jobs' results (not the other replicate's).
		expect(computeStatWeightsFromJobResults).toHaveBeenCalledTimes(2);
		const rep0Results = vi
			.mocked(computeStatWeightsFromJobResults)
			.mock.calls.find(
				(call) => (call[0] as never as { replicate: number }).replicate === 0,
			)?.[1];
		expect(Array.from(rep0Results?.keys() ?? []).sort()).toEqual(["a", "b"]);
		const rep1Results = vi
			.mocked(computeStatWeightsFromJobResults)
			.mock.calls.find(
				(call) => (call[0] as never as { replicate: number }).replicate === 1,
			)?.[1];
		expect(Array.from(rep1Results?.keys() ?? [])).toEqual(["c"]);

		expect(batches).toHaveLength(2);

		// Distinct seeds per replicate.
		const seed0 = vi.mocked(buildStatWeightsRequest).mock.calls[0][5];
		const seed1 = vi.mocked(buildStatWeightsRequest).mock.calls[1][5];
		expect(seed0).toBeDefined();
		expect(seed1).toBeDefined();
		expect(seed0).not.toEqual(seed1);
	});

	it("fails the whole call when a single job fails, without computing any replicate's result", async () => {
		vi.mocked(buildStatWeightJobs).mockResolvedValue({
			jobs: [job("a")],
			reqData: {} as never,
		});
		vi.mocked(runSimJobQueue).mockRejectedValue(new Error("sim job failed"));

		await expect(
			runCalibrationBatches(gear, db, statsToWeigh, profile),
		).rejects.toThrow("sim job failed");

		expect(computeStatWeightsFromJobResults).not.toHaveBeenCalled();
	});
});
