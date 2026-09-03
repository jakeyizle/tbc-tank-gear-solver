import { describe, expect, it } from "vitest";
import { parseItemInput } from "#/helpers/parseItemInput";
import { calculateStatValue } from "#/helpers/stats";
import { DEFAULT_SIM_CALIBRATION_PROFILE } from "#/types/SimCalibrationProfile";
import { EXAMPLE_GEAR_POOL_JSON } from "./__fixtures__/exampleGearPool";
import {
	TEST_CLASS_ID,
	TEST_RACE_ID,
	testItemPool,
} from "./__fixtures__/testItemPool";
import { validateSolution } from "./__test-helpers__/validateSolution";
import { type solve, solveAll } from "./index";
import { SolverConfiguration } from "./SolverConfiguration";
import { type SolveOptions, solveConfig } from "./solveConfig";
import { solveConfigForEHP, solveGearSet } from "./solveEHP";
import type { ModifierSource, Stat } from "./types";

// representative of real talent/racial/buff avoidance contributions a character always has -
// mirrors TEST_AVOIDANCE_BUFF in solveConfig.test.ts
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
	phase: 3,
	raceId: TEST_RACE_ID,
	classId: TEST_CLASS_ID,
	talentSources: [],
	buffs: [],
	abilitySources: [],
	enabledConsumableIds: [],
	...overrides,
});

describe("solveConfigForEHP", () => {
	it("produces a valid gear set and converges within the iteration cap", async () => {
		const options = baseOptions();
		const { items, effectiveHP, converged, ehpIterations } =
			await solveConfigForEHP(testItemPool, options);

		// validateSolution only needs optimizeStats for the objective readout, which isn't
		// meaningful for the EHP loop's internally-swapped objective - stub it out
		const config = new SolverConfiguration({ ...options, optimizeStats: [] });
		expect(validateSolution(items, config)).toEqual([]);

		expect(converged).toBe(true);
		expect(ehpIterations).toBeGreaterThan(0);
		expect(effectiveHP).toBeGreaterThan(0);
	}, 60000);

	it("beats a plain Stamina-weighted objective on true Effective HP", async () => {
		const options = baseOptions();

		const staminaOnly: Stat[] = [{ name: "Stamina", value: 1, type: "flat" }];
		const staminaResult = await solveConfig(testItemPool, {
			...options,
			optimizeStats: staminaOnly,
		});
		const staminaConfig = new SolverConfiguration({
			...options,
			optimizeStats: staminaOnly,
		});
		const staminaEHP = calculateStatValue({
			items: staminaResult,
			modifierSources: staminaConfig.multiplierModifierSources,
			baseStats: staminaConfig.baseStats,
			statName: "Effective HP",
		});

		const { effectiveHP: ehpOptimizedEHP } = await solveConfigForEHP(
			testItemPool,
			options,
		);

		// EHP-directed solve should do at least as well as ignoring armor entirely - it has
		// strictly more objective flexibility (Health + Armor vs. Stamina alone)
		expect(ehpOptimizedEHP).toBeGreaterThanOrEqual(staminaEHP);
	}, 60000);

	it("still respects avoidance/uncrit/resistance floors while maximizing EHP", async () => {
		// same constraint combination as solveConfig.test.ts scenario 4, so EHP mode is proven
		// against the same "constraints active together" case the stat-weight solve already covers
		const options = baseOptions({
			uncrushabilitySetting: 1,
			uncritabilitySetting: 1,
			buffs: [TEST_AVOIDANCE_BUFF],
			resistanceFloors: [{ stat: "ShadowResistance", value: 10 }],
		});
		const { items, converged } = await solveConfigForEHP(testItemPool, options);
		const config = new SolverConfiguration({ ...options, optimizeStats: [] });

		expect(validateSolution(items, config)).toEqual([]);
		expect(converged).toBe(true);

		const resistance = calculateStatValue({
			items,
			modifierSources: config.multiplierModifierSources,
			baseStats: config.baseStats,
			statName: "ShadowResistance",
		});
		expect(resistance).toBeGreaterThanOrEqual(10);
	}, 60000);

	it("converges on a large, real-world multi-candidate gear pool", async () => {
		// unlike testItemPool (curated, one strong candidate per slot), this pool has several
		// real candidates per slot (8 Finger, 6 Trinket, 5 Weapon, etc. - see exampleGearPool.ts),
		// so this exercises item-vs-item selection at a realistic scale, not just enchant/gem
		// sub-selection on a fixed item set
		const items = parseItemInput(EXAMPLE_GEAR_POOL_JSON);
		const options = baseOptions({ phase: 5 });

		const {
			items: result,
			effectiveHP,
			converged,
		} = await solveConfigForEHP(items, options);
		const config = new SolverConfiguration({ ...options, optimizeStats: [] });

		expect(validateSolution(result, config)).toEqual([]);
		expect(converged).toBe(true);
		// sanity floor, not a tight bound - a phase 4/5 tank's true (armor-only) EHP is comfortably
		// in the tens of thousands at these item levels
		expect(effectiveHP).toBeGreaterThan(10000);
	}, 60000);

	it("solveAll can mix EHP and stat-weight modes across sequential configs", async () => {
		// solveAll's real solve() spins up a Worker, unavailable under vitest - solveGearSet is
		// the same objectiveMode-dispatch logic solver.worker.ts uses, so this exercises the exact
		// routing a real solve would do (see solver.worker.ts)
		const solveFnForTest: typeof solve = (items, options, onProgress) =>
			solveGearSet(items, options, onProgress);

		const ehpConfig = {
			id: "config-1",
			name: "EHP Config",
			uncritabilitySetting: 0,
			uncrushabilitySetting: 0,
			optimizeStats: [],
			objectiveMode: "ehp" as const,
			simMetricWeights: { tps: 0, dtps: 0, tmi5: 0 },
			resistanceFloors: [],
			abilities: [],
			talents: [],
			buffs: [],
			enabledConsumableIds: [],
		};
		const statsConfig = {
			...ehpConfig,
			id: "config-2",
			name: "Stats Config",
			optimizeStats: [
				{ name: "Stamina" as const, value: 1, type: "flat" as const },
			],
			objectiveMode: "stats" as const,
		};
		const baseConfig = {
			areEnchantsGemsLocked: true,
			excludeUniqueGems: false,
			phase: 3,
			raceId: TEST_RACE_ID,
			classId: TEST_CLASS_ID,
			abilitySources: [],
			talentSources: [],
			simCalibrationProfile: DEFAULT_SIM_CALIBRATION_PROFILE,
		};

		const results = await solveAll(
			testItemPool,
			baseConfig,
			[ehpConfig, statsConfig],
			undefined,
			solveFnForTest,
		);
		expect(results).toHaveLength(2);

		const validationConfig = new SolverConfiguration({
			...baseConfig,
			...statsConfig,
		});
		expect(validateSolution(results[0].items, validationConfig)).toEqual([]);
		expect(validateSolution(results[1].items, validationConfig)).toEqual([]);

		// items locked/enchanted/gemmed by the EHP config carry through to the stats config,
		// same cross-config locking behavior as solveConfig.test.ts scenario 6
		const head1 = results[0].items.find((item) => item.type === "Head");
		const head2 = results[1].items.find((item) => item.type === "Head");
		expect(head2?.gems.map((g) => g.id)).toEqual(head1?.gems.map((g) => g.id));
		expect(head2?.enchant.id).toEqual(head1?.enchant.id);
	}, 60000);
});
