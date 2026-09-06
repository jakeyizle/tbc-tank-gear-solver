// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SIM_CALIBRATION_PROFILE } from "#/types/SimCalibrationProfile";
import {
	clearRound1WeightsCache,
	getCachedRound1Weights,
	setCachedRound1Weights,
} from "./round1WeightsCache";

const weights = {
	optimizeStats: [
		{ name: "Stamina" as const, value: 1, type: "flat" as const },
	],
	stdevStats: [{ name: "Stamina" as const, value: 0.1, type: "flat" as const }],
};
const key = { objectiveMode: "tmi" as const };

beforeEach(() => {
	localStorage.clear();
});

describe("round1WeightsCache", () => {
	it("round-trips a set/get for a given profile+key", () => {
		expect(
			getCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, key),
		).toBeUndefined();
		setCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, key, weights);
		expect(
			getCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, key),
		).toEqual(weights);
	});

	it("round-trips the per-metric breakdown fields alongside optimizeStats/stdevStats", () => {
		const richWeights = {
			...weights,
			perMetricStatWeights: {
				tps: [{ name: "Stamina" as const, value: 2, type: "flat" as const }],
				dtps: [{ name: "Stamina" as const, value: 3, type: "flat" as const }],
				tmi: [{ name: "Stamina" as const, value: 4, type: "flat" as const }],
			},
			perMetricStatWeightStdevs: {
				tps: [{ name: "Stamina" as const, value: 0.2, type: "flat" as const }],
				dtps: [{ name: "Stamina" as const, value: 0.3, type: "flat" as const }],
				tmi: [{ name: "Stamina" as const, value: 0.4, type: "flat" as const }],
			},
		};
		setCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, key, richWeights);
		expect(
			getCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, key),
		).toEqual(richWeights);
	});

	it("still round-trips optimizeStats/stdevStats for an old-shaped entry missing the per-metric fields", () => {
		setCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, key, weights);
		const result = getCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, key);
		expect(result?.optimizeStats).toEqual(weights.optimizeStats);
		expect(result?.stdevStats).toEqual(weights.stdevStats);
		expect(result?.perMetricStatWeights).toBeUndefined();
		expect(result?.perMetricStatWeightStdevs).toBeUndefined();
	});

	it("hits regardless of the profile object's key order (canonical stringify)", () => {
		setCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, key, weights);

		// Same content, different key insertion order.
		const reordered = {
			raidProfile: DEFAULT_SIM_CALIBRATION_PROFILE.raidProfile,
			healingModel: DEFAULT_SIM_CALIBRATION_PROFILE.healingModel,
			encounter: DEFAULT_SIM_CALIBRATION_PROFILE.encounter,
			calibration: DEFAULT_SIM_CALIBRATION_PROFILE.calibration,
		};
		expect(getCachedRound1Weights(reordered, key)).toEqual(weights);
	});

	it("misses on a differing profile", () => {
		setCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, key, weights);
		const differentProfile = {
			...DEFAULT_SIM_CALIBRATION_PROFILE,
			calibration: {
				...DEFAULT_SIM_CALIBRATION_PROFILE.calibration,
				iterations: DEFAULT_SIM_CALIBRATION_PROFILE.calibration.iterations + 1,
			},
		};
		expect(getCachedRound1Weights(differentProfile, key)).toBeUndefined();
	});

	it("misses on a differing objectiveMode", () => {
		setCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, key, weights);
		expect(
			getCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, {
				objectiveMode: "dtps",
			}),
		).toBeUndefined();
	});

	it("misses on a differing balance/survivabilityMetric for balanced mode", () => {
		const balancedKey = {
			objectiveMode: "balanced" as const,
			balance: 0.5,
			survivabilityMetric: "tmi" as const,
		};
		setCachedRound1Weights(
			DEFAULT_SIM_CALIBRATION_PROFILE,
			balancedKey,
			weights,
		);
		expect(
			getCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, {
				...balancedKey,
				balance: 0.6,
			}),
		).toBeUndefined();
		expect(
			getCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, balancedKey),
		).toEqual(weights);
	});

	it("treats a version bump as an empty cache", () => {
		setCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, key, weights);
		const stored = localStorage.getItem("round1WeightsCache");
		expect(stored).not.toBeNull();
		const raw = JSON.parse(stored as string);
		localStorage.setItem(
			"round1WeightsCache",
			JSON.stringify({ ...raw, version: raw.version + 1 }),
		);
		expect(
			getCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, key),
		).toBeUndefined();
	});

	it("treats corrupt JSON as an empty cache rather than throwing", () => {
		localStorage.setItem("round1WeightsCache", "{not json");
		expect(() =>
			getCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, key),
		).not.toThrow();
		expect(
			getCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, key),
		).toBeUndefined();
	});

	it("evicts the oldest entries first once past the entry cap", () => {
		// 21 distinct entries (cap is 20) - each keyed by a distinct balance value.
		for (let i = 0; i < 21; i++) {
			setCachedRound1Weights(
				DEFAULT_SIM_CALIBRATION_PROFILE,
				{ objectiveMode: "balanced", balance: i, survivabilityMetric: "tmi" },
				weights,
			);
		}
		// The very first entry (balance: 0) should have been evicted; the most recent should remain.
		expect(
			getCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, {
				objectiveMode: "balanced",
				balance: 0,
				survivabilityMetric: "tmi",
			}),
		).toBeUndefined();
		expect(
			getCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, {
				objectiveMode: "balanced",
				balance: 20,
				survivabilityMetric: "tmi",
			}),
		).toEqual(weights);
	});

	it("clearRound1WeightsCache removes all entries", () => {
		setCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, key, weights);
		clearRound1WeightsCache();
		expect(
			getCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, key),
		).toBeUndefined();
	});
});
