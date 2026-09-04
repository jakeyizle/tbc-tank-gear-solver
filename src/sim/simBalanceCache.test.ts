// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SIM_CALIBRATION_PROFILE } from "#/types/SimCalibrationProfile";
import {
	clearSimBalanceCache,
	getCachedBalanceEndpoints,
	setCachedBalanceEndpoints,
} from "./simBalanceCache";

const endpoints = {
	threat: {
		simMetrics: { tps: 5000, dtps: 800, tmi5: 10 },
		finalStatWeights: [
			{ name: "AttackPower" as const, value: 1, type: "flat" as const },
		],
		finalStatWeightStdevs: [
			{ name: "AttackPower" as const, value: 0.1, type: "flat" as const },
		],
	},
	survival: {
		simMetrics: { tps: 3000, dtps: 200, tmi5: 2 },
		finalStatWeights: [
			{ name: "Dodge" as const, value: 1, type: "flat" as const },
		],
		finalStatWeightStdevs: [
			{ name: "Dodge" as const, value: 0.1, type: "flat" as const },
		],
	},
};
const items = [{ id: "1", gems: [] }];
const options = { classId: "2", raceId: "1" };

beforeEach(() => {
	localStorage.clear();
});

describe("simBalanceCache", () => {
	it("round-trips a set/get for given items+options+profile", () => {
		expect(
			getCachedBalanceEndpoints(
				items,
				options,
				DEFAULT_SIM_CALIBRATION_PROFILE,
			),
		).toBeUndefined();
		setCachedBalanceEndpoints(
			items,
			options,
			DEFAULT_SIM_CALIBRATION_PROFILE,
			endpoints,
		);
		expect(
			getCachedBalanceEndpoints(
				items,
				options,
				DEFAULT_SIM_CALIBRATION_PROFILE,
			),
		).toEqual(endpoints);
	});

	it("hits regardless of the options object's key order (canonical stringify)", () => {
		setCachedBalanceEndpoints(
			items,
			options,
			DEFAULT_SIM_CALIBRATION_PROFILE,
			endpoints,
		);
		const reordered = { raceId: options.raceId, classId: options.classId };
		expect(
			getCachedBalanceEndpoints(
				items,
				reordered,
				DEFAULT_SIM_CALIBRATION_PROFILE,
			),
		).toEqual(endpoints);
	});

	it("misses on a differing item pool", () => {
		setCachedBalanceEndpoints(
			items,
			options,
			DEFAULT_SIM_CALIBRATION_PROFILE,
			endpoints,
		);
		expect(
			getCachedBalanceEndpoints(
				[{ id: "2", gems: [] }],
				options,
				DEFAULT_SIM_CALIBRATION_PROFILE,
			),
		).toBeUndefined();
	});

	it("misses on differing options", () => {
		setCachedBalanceEndpoints(
			items,
			options,
			DEFAULT_SIM_CALIBRATION_PROFILE,
			endpoints,
		);
		expect(
			getCachedBalanceEndpoints(
				items,
				{ ...options, classId: "3" },
				DEFAULT_SIM_CALIBRATION_PROFILE,
			),
		).toBeUndefined();
	});

	it("treats a version bump as an empty cache", () => {
		setCachedBalanceEndpoints(
			items,
			options,
			DEFAULT_SIM_CALIBRATION_PROFILE,
			endpoints,
		);
		const stored = localStorage.getItem("simBalanceCache");
		expect(stored).not.toBeNull();
		const raw = JSON.parse(stored as string);
		localStorage.setItem(
			"simBalanceCache",
			JSON.stringify({ ...raw, version: raw.version + 1 }),
		);
		expect(
			getCachedBalanceEndpoints(
				items,
				options,
				DEFAULT_SIM_CALIBRATION_PROFILE,
			),
		).toBeUndefined();
	});

	it("treats corrupt JSON as an empty cache rather than throwing", () => {
		localStorage.setItem("simBalanceCache", "{not json");
		expect(() =>
			getCachedBalanceEndpoints(
				items,
				options,
				DEFAULT_SIM_CALIBRATION_PROFILE,
			),
		).not.toThrow();
	});

	it("evicts the oldest entries first once past the entry cap", () => {
		for (let i = 0; i < 21; i++) {
			setCachedBalanceEndpoints(
				items,
				{ ...options, classId: String(i) },
				DEFAULT_SIM_CALIBRATION_PROFILE,
				endpoints,
			);
		}
		expect(
			getCachedBalanceEndpoints(
				items,
				{ ...options, classId: "0" },
				DEFAULT_SIM_CALIBRATION_PROFILE,
			),
		).toBeUndefined();
		expect(
			getCachedBalanceEndpoints(
				items,
				{ ...options, classId: "20" },
				DEFAULT_SIM_CALIBRATION_PROFILE,
			),
		).toEqual(endpoints);
	});

	it("clearSimBalanceCache removes all entries", () => {
		setCachedBalanceEndpoints(
			items,
			options,
			DEFAULT_SIM_CALIBRATION_PROFILE,
			endpoints,
		);
		clearSimBalanceCache();
		expect(
			getCachedBalanceEndpoints(
				items,
				options,
				DEFAULT_SIM_CALIBRATION_PROFILE,
			),
		).toBeUndefined();
	});
});
