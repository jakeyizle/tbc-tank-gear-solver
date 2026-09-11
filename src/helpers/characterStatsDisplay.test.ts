import { describe, expect, it } from "vitest";
import type { UnitStatsView } from "#/types/CharacterStats";
import {
	avoidanceInfo,
	critImmunityInfo,
	defenseSkill,
	missChanceInfo,
	PSEUDO,
	STAT,
} from "./characterStatsDisplay";

/**
 * The reference character from src/sim/computeStatsGolden.test.ts, reduced to just the
 * finalStats values the display layer reads. Keeping these as literals (rather than running
 * the wasm) makes this a fast unit test of the FORMULAS; the golden test separately proves
 * the sim really produces these inputs.
 *
 * The wowsims character panel for this character showed:
 *   Defense 359 (502)   Dodge 22.51%   Parry 17.31%   Block 18.14%
 *   Miss 13.04%         Total avoidance 106.33% (with HS)
 *   Crit Immunity: Over by 0.90%
 */
function referenceView(): UnitStatsView {
	const stats: number[] = new Array(42).fill(0);
	stats[STAT.DefenseRating] = 359.31;
	stats[STAT.Resilience] = 18;
	stats[STAT.Armor] = 18614;

	const pseudoStats: number[] = new Array(27).fill(0);
	pseudoStats[PSEUDO.DodgePercent] = 22.51;
	pseudoStats[PSEUDO.ParryPercent] = 17.31;
	pseudoStats[PSEUDO.BlockPercent] = 18.14;
	pseudoStats[PSEUDO.ReducedCritTakenPercent] = 6.5;

	return { stats, pseudoStats };
}

describe("characterStatsDisplay", () => {
	// Deliberately 501, not the 502 wowsims' panel shows. 359.31 / 2.365385 = 151.90; the
	// game floors that to 151 points of benefit, while wowsims rounds 501.90 for display.
	// Verified against the same character's crit immunity, which the SIM reports as 6.50% -
	// that is 151 * 0.04 + resilience, i.e. the sim itself is using 151, not 152.
	it("derives effective defense skill by flooring, not rounding, the rating", () => {
		expect(defenseSkill(referenceView())).toBe(501);

		// A rating that converts exactly must not be nudged either way.
		const exact = referenceView();
		exact.stats[STAT.DefenseRating] = 2.365385 * 100;
		expect(defenseSkill(exact)).toBe(450);
	});

	it("keeps the floored skill consistent with the sim's own crit-immunity figure", () => {
		const view = referenceView();
		const { defense, resilience, talents } = critImmunityInfo(view);
		// 151 * 0.04 = 6.04, plus 18 resilience, leaves essentially nothing unexplained.
		expect(defense).toBeCloseTo(6.04, 2);
		expect(defense + resilience + talents).toBeCloseTo(6.5, 6);
		expect(Math.abs(talents)).toBeLessThan(0.01);
	});

	it("reproduces the panel's miss chance, including the debuff term", () => {
		const info = missChanceInfo(referenceView(), { insectSwarm: true });
		expect(info.base).toBe(5);
		expect(info.defense).toBeCloseTo(6.04, 2);
		expect(info.debuffs).toBe(2);
		expect(info.total).toBeCloseTo(13.04, 2);
	});

	it("lets Scorpid Sting override Insect Swarm rather than stacking", () => {
		const both = { scorpidSting: true, insectSwarm: true };
		expect(missChanceInfo(referenceView(), both).debuffs).toBe(5);
		expect(missChanceInfo(referenceView(), {}).debuffs).toBe(0);
	});

	it("reproduces the panel's 106.33% total avoidance", () => {
		const info = avoidanceInfo(referenceView(), {
			debuffs: { insectSwarm: true },
			isProtectionPaladin: true,
			hasLibramOfRepentance: true,
		});
		// Holy Shield's flat +30 plus the Libram's 42 block rating (42 / 7.884615 = 5.33).
		expect(info.block).toBeCloseTo(53.47, 2);
		expect(info.total).toBeCloseTo(106.33, 2);
	});

	it("drops the Holy Shield and Libram bonuses when they do not apply", () => {
		const view = referenceView();
		const noLibram = avoidanceInfo(view, {
			isProtectionPaladin: true,
			hasLibramOfRepentance: false,
		});
		expect(noLibram.block).toBeCloseTo(48.14, 2);

		const notPaladin = avoidanceInfo(view, { isProtectionPaladin: false });
		expect(notPaladin.block).toBeCloseTo(18.14, 2);
	});

	it("excludes miss from Shear avoidance and block from hard avoidance", () => {
		const info = avoidanceInfo(referenceView(), {
			debuffs: { insectSwarm: true },
			isProtectionPaladin: true,
			hasLibramOfRepentance: true,
		});
		expect(info.shear).toBeCloseTo(info.total - info.miss, 6);
		expect(info.hard).toBeCloseTo(info.miss + info.dodge + info.parry, 6);
	});

	it("reports crit immunity as the panel's 'over by' figure", () => {
		const info = critImmunityInfo(referenceView());
		expect(info.total).toBeCloseTo(6.5, 2);
		// 5.6 - 6.5 = -0.9, i.e. "Over by 0.90%".
		expect(info.delta).toBeCloseTo(-0.9, 2);
		expect(info.defense).toBeCloseTo(6.04, 2);
		expect(info.resilience).toBeCloseTo(18 / 39.4231, 4);
	});
});
