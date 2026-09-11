import { describe, expect, it } from "vitest";
import { TEST_ITEM_DATABASE } from "./__fixtures__/testItemDatabase";
import { TEST_CLASS_ID, testItemPool } from "./__fixtures__/testItemPool";
import { TEST_LINEAR_MODEL } from "./__fixtures__/testLinearModel";
import { validateSolution } from "./__test-helpers__/validateSolution";
import { SolverConfiguration } from "./SolverConfiguration";
import { scoreItemSet } from "./scores";
import { type SolveOptions, solveConfig } from "./solveConfig";
import { solveConfigForHardAvoidance } from "./solveEHP";
import type { Stat } from "./types";

const baseOptions = (
	overrides: Partial<Omit<SolveOptions, "optimizeStats">> = {},
): Omit<SolveOptions, "optimizeStats"> => ({
	uncrushabilitySetting: 0,
	uncritabilitySetting: 0,
	resistanceFloors: [],
	areEnchantsGemsLocked: false,
	excludeUniqueGems: false,
	excludeJewelcraftingItems: false,
	excludeEnchantingItems: false,
	phase: 3,
	classId: TEST_CLASS_ID,
	linearModel: TEST_LINEAR_MODEL,
	itemDatabase: TEST_ITEM_DATABASE,
	enabledConsumableIds: [],
	...overrides,
});

// The gear's own contribution to Dodge/Parry/Miss - the same three stats
// HARD_AVOIDANCE_STATS weights, re-derived from the stat model rather than read off the
// solver's internal per-item scores.
const hardAvoidanceScore = (
	items: Awaited<ReturnType<typeof solveConfigForHardAvoidance>>,
	config: SolverConfiguration,
) => {
	const totals = scoreItemSet(items, config.linearModel, [
		"Dodge",
		"Parry",
		"Miss",
	]);
	return (totals.Dodge ?? 0) + (totals.Parry ?? 0) + (totals.Miss ?? 0);
};

describe("solveConfigForHardAvoidance", () => {
	it("produces a valid gear set", async () => {
		const options = baseOptions();
		const result = await solveConfigForHardAvoidance(testItemPool, options);
		// hard avoidance's synthetic optimizeStats isn't meaningful for validateSolution's
		// objective readout - stub it out, same pattern as solveEHP.test.ts
		const config = new SolverConfiguration({ ...options, optimizeStats: [] });

		expect(validateSolution(result, config)).toEqual([]);
	}, 60000);

	it("beats a Block-weighted stat objective on Dodge+Parry+Miss", async () => {
		const options = baseOptions();

		const blockOnly: Stat[] = [
			{ name: "Block", value: 1, type: "flat" },
			{ name: "BlockValue", value: 1, type: "flat" },
		];
		const blockResult = await solveConfig(testItemPool, {
			...options,
			optimizeStats: blockOnly,
		});
		const blockConfig = new SolverConfiguration({
			...options,
			optimizeStats: blockOnly,
		});

		const hardAvoidanceResult = await solveConfigForHardAvoidance(
			testItemPool,
			options,
		);
		const hardAvoidanceConfig = new SolverConfiguration({
			...options,
			optimizeStats: [],
		});

		expect(
			hardAvoidanceScore(hardAvoidanceResult, hardAvoidanceConfig),
		).toBeGreaterThan(hardAvoidanceScore(blockResult, blockConfig));
	}, 60000);

	it("ignores the Avoidance floor constraint even when uncrushabilitySetting is set", async () => {
		// If the (Block-inclusive) Avoidance floor constraint were still being applied, requiring
		// it via uncrushabilitySetting could force the solver away from whichever gear set purely
		// maximizes Dodge+Parry+Miss (e.g. toward more Block to help clear the floor), lowering the
		// achieved hard avoidance score below the unconstrained optimum. Since
		// solveConfigForHardAvoidance force-disables that constraint, the achieved score should be
		// identical (within MIP gap tolerance) regardless of uncrushabilitySetting.
		const unconstrainedOptions = baseOptions({ uncrushabilitySetting: 0 });
		const constrainedOptions = baseOptions({ uncrushabilitySetting: 1 });

		const unconstrainedResult = await solveConfigForHardAvoidance(
			testItemPool,
			unconstrainedOptions,
		);
		const constrainedResult = await solveConfigForHardAvoidance(
			testItemPool,
			constrainedOptions,
		);
		const config = new SolverConfiguration({
			...unconstrainedOptions,
			optimizeStats: [],
		});

		expect(hardAvoidanceScore(constrainedResult, config)).toBeCloseTo(
			hardAvoidanceScore(unconstrainedResult, config),
			5,
		);
	}, 60000);

	it("still respects uncritability and resistance floors while maximizing hard avoidance", async () => {
		const options = baseOptions({
			uncritabilitySetting: 1,
			resistanceFloors: [{ stat: "ShadowResistance", value: 10 }],
		});
		const result = await solveConfigForHardAvoidance(testItemPool, options);
		const config = new SolverConfiguration({ ...options, optimizeStats: [] });

		expect(validateSolution(result, config)).toEqual([]);

		const resistance =
			scoreItemSet(result, config.linearModel, ["ShadowResistance"])
				.ShadowResistance ?? 0;
		expect(resistance).toBeGreaterThanOrEqual(
			config.resistanceTargets[0].target,
		);
	}, 60000);
});
