import { describe, expect, it } from "vitest";
import {
	effectiveCalibrationSampleSize,
	ONE_SIDED_CALIBRATION_STATS,
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
