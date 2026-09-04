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
const ratios = { tps: 0, dtps: 0, tmi5: 1 };

beforeEach(() => {
	localStorage.clear();
});

describe("round1WeightsCache", () => {
	it("round-trips a set/get for a given profile+ratios", () => {
		expect(
			getCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, ratios),
		).toBeUndefined();
		setCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, ratios, weights);
		expect(
			getCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, ratios),
		).toEqual(weights);
	});

	it("hits regardless of the profile object's key order (canonical stringify)", () => {
		setCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, ratios, weights);

		// Same content, different key insertion order.
		const reordered = {
			raidProfile: DEFAULT_SIM_CALIBRATION_PROFILE.raidProfile,
			healingModel: DEFAULT_SIM_CALIBRATION_PROFILE.healingModel,
			encounter: DEFAULT_SIM_CALIBRATION_PROFILE.encounter,
			calibration: DEFAULT_SIM_CALIBRATION_PROFILE.calibration,
		};
		expect(getCachedRound1Weights(reordered, ratios)).toEqual(weights);
	});

	it("misses on a differing profile", () => {
		setCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, ratios, weights);
		const differentProfile = {
			...DEFAULT_SIM_CALIBRATION_PROFILE,
			calibration: {
				...DEFAULT_SIM_CALIBRATION_PROFILE.calibration,
				iterations: DEFAULT_SIM_CALIBRATION_PROFILE.calibration.iterations + 1,
			},
		};
		expect(getCachedRound1Weights(differentProfile, ratios)).toBeUndefined();
	});

	it("misses on differing simMetricWeights", () => {
		setCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, ratios, weights);
		expect(
			getCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, {
				...ratios,
				tps: 1,
			}),
		).toBeUndefined();
	});

	it("treats a version bump as an empty cache", () => {
		setCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, ratios, weights);
		const stored = localStorage.getItem("round1WeightsCache");
		expect(stored).not.toBeNull();
		const raw = JSON.parse(stored as string);
		localStorage.setItem(
			"round1WeightsCache",
			JSON.stringify({ ...raw, version: raw.version + 1 }),
		);
		expect(
			getCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, ratios),
		).toBeUndefined();
	});

	it("treats corrupt JSON as an empty cache rather than throwing", () => {
		localStorage.setItem("round1WeightsCache", "{not json");
		expect(() =>
			getCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, ratios),
		).not.toThrow();
		expect(
			getCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, ratios),
		).toBeUndefined();
	});

	it("evicts the oldest entries first once past the entry cap", () => {
		// 21 distinct entries (cap is 20) - each keyed by a distinct tps ratio.
		for (let i = 0; i < 21; i++) {
			setCachedRound1Weights(
				DEFAULT_SIM_CALIBRATION_PROFILE,
				{ ...ratios, tps: i },
				weights,
			);
		}
		// The very first entry (tps: 0) should have been evicted; the most recent should remain.
		expect(
			getCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, {
				...ratios,
				tps: 0,
			}),
		).toBeUndefined();
		expect(
			getCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, {
				...ratios,
				tps: 20,
			}),
		).toEqual(weights);
	});

	it("clearRound1WeightsCache removes all entries", () => {
		setCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, ratios, weights);
		clearRound1WeightsCache();
		expect(
			getCachedRound1Weights(DEFAULT_SIM_CALIBRATION_PROFILE, ratios),
		).toBeUndefined();
	});
});
