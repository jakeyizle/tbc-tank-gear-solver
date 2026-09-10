import { describe, expect, it } from "vitest";
import { calculateStatValue } from "#/helpers/stats";
import {
	TEST_CLASS_ID,
	TEST_RACE_ID,
	testItemPool,
} from "./__fixtures__/testItemPool";
import { validateSolution } from "./__test-helpers__/validateSolution";
import { SolverConfiguration } from "./SolverConfiguration";
import { type SolveOptions, solveConfig } from "./solveConfig";
import { solveConfigForHardAvoidance } from "./solveEHP";
import type { ModifierSource, Stat } from "./types";

const TEST_AVOIDANCE_BUFF: ModifierSource = {
	id: "test-avoidance-buff",
	name: "Test Avoidance Buff",
	type: "buff",
	stats: [
		{ name: "Dodge", value: 20, type: "flat" },
		{ name: "Defense", value: 40, type: "flat" },
	],
};

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
	raceId: TEST_RACE_ID,
	classId: TEST_CLASS_ID,
	talentSources: [],
	buffs: [],
	abilitySources: [],
	enabledConsumableIds: [],
	...overrides,
});

const hardAvoidanceScore = (
	items: Awaited<ReturnType<typeof solveConfigForHardAvoidance>>,
	config: SolverConfiguration,
) => {
	const modifierSources = [
		...config.flatModifierSources,
		...config.multiplierModifierSources,
	];
	const baseStats = config.baseStats;
	return (
		calculateStatValue({
			items,
			modifierSources,
			baseStats,
			statName: "Dodge",
		}) +
		calculateStatValue({
			items,
			modifierSources,
			baseStats,
			statName: "Parry",
		}) +
		calculateStatValue({ items, modifierSources, baseStats, statName: "Miss" })
	);
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
			buffs: [TEST_AVOIDANCE_BUFF],
			resistanceFloors: [{ stat: "ShadowResistance", value: 10 }],
		});
		const result = await solveConfigForHardAvoidance(testItemPool, options);
		const config = new SolverConfiguration({ ...options, optimizeStats: [] });

		expect(validateSolution(result, config)).toEqual([]);

		const resistance = calculateStatValue({
			items: result,
			modifierSources: config.multiplierModifierSources,
			baseStats: config.baseStats,
			statName: "ShadowResistance",
		});
		expect(resistance).toBeGreaterThanOrEqual(10);
	}, 60000);
});
