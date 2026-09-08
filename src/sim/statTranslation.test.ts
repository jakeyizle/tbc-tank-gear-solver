import { describe, expect, it } from "vitest";
import {
	ALWAYS_INCLUDED_CALIBRATION_STATS,
	deadCalibrationStats,
	effectiveCalibrationSampleSize,
	ONE_SIDED_CALIBRATION_STATS,
	SIM_CALIBRATION_STAT_NAMES,
} from "./statTranslation";

describe("ONE_SIDED_CALIBRATION_STATS", () => {
	it("contains exactly the three stats the Go sim zeroes the low-mod probe for", () => {
		expect([...ONE_SIDED_CALIBRATION_STATS].sort()).toEqual(
			["Expertise", "MeleeHit", "SpellHit"].sort(),
		);
	});
});

describe("effectiveCalibrationSampleSize", () => {
	it("returns the full iteration count for a two-sided stat", () => {
		expect(effectiveCalibrationSampleSize("Stamina", 4000)).toBe(4000);
	});

	it("halves the iteration count for a one-sided stat", () => {
		expect(effectiveCalibrationSampleSize("Expertise", 4000)).toBe(2000);
		expect(effectiveCalibrationSampleSize("MeleeHit", 4000)).toBe(2000);
		expect(effectiveCalibrationSampleSize("SpellHit", 4000)).toBe(2000);
	});
});

describe("deadCalibrationStats", () => {
	it("is empty when no uncritability floor is active", () => {
		expect(deadCalibrationStats(0)).toEqual(new Set());
	});

	it("does NOT mark Resilience dead at the 5.4% (level 72) floor - insufficient against this app's level-73 reference boss", () => {
		expect(deadCalibrationStats(1)).toEqual(new Set());
	});

	it("marks Resilience dead only at the 5.6% (level 73) floor, which matches the boss this app actually simulates", () => {
		expect(deadCalibrationStats(2)).toEqual(new Set(["Resilience"]));
	});
});

describe("SIM_CALIBRATION_STAT_NAMES", () => {
	it("sorts the always-included reference stats (Spell Power, Armor) first", () => {
		expect(SIM_CALIBRATION_STAT_NAMES[0]).toBe("Armor");
		expect(SIM_CALIBRATION_STAT_NAMES[1]).toBe("SpellPower");
		for (const name of SIM_CALIBRATION_STAT_NAMES.slice(2)) {
			expect(ALWAYS_INCLUDED_CALIBRATION_STATS.has(name)).toBe(false);
		}
	});
});
