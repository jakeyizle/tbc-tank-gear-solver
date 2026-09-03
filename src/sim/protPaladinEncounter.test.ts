import { describe, expect, it } from "vitest";
import {
	buildReferenceTargetStats,
	PROT_PALADIN_REFERENCE_ENCOUNTER,
	TARGET_ARMOR_STAT_INDEX,
	TARGET_HEALTH_STAT_INDEX,
} from "./protPaladinEncounter";

describe("buildReferenceTargetStats", () => {
	it("writes armor/health at their known indices", () => {
		const stats = buildReferenceTargetStats(1234, 5678);
		expect(stats[TARGET_ARMOR_STAT_INDEX]).toBe(1234);
		expect(stats[TARGET_HEALTH_STAT_INDEX]).toBe(5678);
	});

	it("leaves every other slot untouched from the reference target", () => {
		const baseline = PROT_PALADIN_REFERENCE_ENCOUNTER.targets[0].stats;
		const stats = buildReferenceTargetStats(1234, 5678);

		expect(stats).toHaveLength(baseline.length);
		stats.forEach((value, index) => {
			if (
				index === TARGET_ARMOR_STAT_INDEX ||
				index === TARGET_HEALTH_STAT_INDEX
			) {
				return;
			}
			expect(value).toBe(baseline[index]);
		});
	});

	it("reproduces the exact baseline when passed the reference target's own values", () => {
		const baseline = PROT_PALADIN_REFERENCE_ENCOUNTER.targets[0];
		const stats = buildReferenceTargetStats(
			baseline.stats[TARGET_ARMOR_STAT_INDEX],
			baseline.stats[TARGET_HEALTH_STAT_INDEX],
		);
		expect(stats).toEqual(baseline.stats);
	});

	it("does not mutate the shared reference encounter constant", () => {
		const before = [...PROT_PALADIN_REFERENCE_ENCOUNTER.targets[0].stats];
		buildReferenceTargetStats(999, 888);
		expect(PROT_PALADIN_REFERENCE_ENCOUNTER.targets[0].stats).toEqual(before);
	});
});
