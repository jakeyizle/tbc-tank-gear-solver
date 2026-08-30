import { describe, expect, it } from "vitest";
import { calculateAvoidanceTarget, calculateUncritabilityTarget } from "./avoidance";

describe("calculateAvoidanceTarget", () => {
	it("returns 0 when uncrushability is disabled, regardless of base avoidance", () => {
		expect(calculateAvoidanceTarget(0, 50)).toBe(0);
	});

	it("targets the standard 102.4% uncrushable threshold", () => {
		expect(calculateAvoidanceTarget(1, 80)).toBeCloseTo(102.4 - 80);
	});

	it("targets the lower Illidan Shear threshold instead of the standard one", () => {
		expect(calculateAvoidanceTarget(2, 80)).toBeCloseTo(101.8 - 80);
	});

	it("can return a negative target when base avoidance already exceeds the threshold", () => {
		expect(calculateAvoidanceTarget(1, 110)).toBeLessThan(0);
	});
});

describe("calculateUncritabilityTarget", () => {
	it("returns 0 when uncritability is disabled", () => {
		expect(calculateUncritabilityTarget(0, 2)).toBe(0);
	});

	it("uses the 5.4% target for setting 1", () => {
		expect(calculateUncritabilityTarget(1, 2)).toBeCloseTo(5.4 - 2);
	});

	it("uses the 5.6% target for any other non-zero setting", () => {
		expect(calculateUncritabilityTarget(2, 2)).toBeCloseTo(5.6 - 2);
	});
});
