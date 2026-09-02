import { describe, expect, it } from "vitest";
import {
	TEST_CLASS_ID,
	TEST_CONSUMABLE_IDS,
	TEST_GEM_IDS,
	TEST_ITEM_IDS,
	TEST_RACE_ID,
	testItemPool,
} from "./__fixtures__/testItemPool";
import {
	computeAchievedStats,
	validateSolution,
} from "./__test-helpers__/validateSolution";
import { type solve, solveAll } from "./index";
import { SolverConfiguration } from "./SolverConfiguration";
import { type SolveOptions, solveConfig } from "./solveConfig";
import {
	type InputItem,
	type LPItem,
	type ModifierSource,
	STAT_NAMES,
	type Stat,
} from "./types";

// representative of real talent/racial/buff avoidance contributions a character always has -
// calculateAvoidanceTarget subtracts these from the fixed cap, so omitting them (as an empty
// talentSources/buffs array would) tests an unrealistic "buffless" character, not a real one
const TEST_AVOIDANCE_BUFF: ModifierSource = {
	id: "test-avoidance-buff",
	name: "Test Avoidance Buff",
	type: "buff",
	stats: [
		{ name: "Dodge", value: 20, type: "flat" },
		{ name: "Defense", value: 40, type: "flat" },
	],
};

const OBJECTIVE_STATS: Stat[] = [
	{ name: "Stamina", value: 1, type: "flat" },
	{ name: "Defense", value: 1, type: "flat" },
	{ name: "Dodge", value: 1, type: "flat" },
	{ name: "Block", value: 1, type: "flat" },
	{ name: "BlockValue", value: 1, type: "flat" },
	{ name: "Resilience", value: 1, type: "flat" },
	{ name: "Parry", value: 1, type: "flat" },
];

const baseOptions = (overrides: Partial<SolveOptions> = {}): SolveOptions => ({
	uncrushabilitySetting: 0,
	uncritabilitySetting: 0,
	optimizeStats: OBJECTIVE_STATS,
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

describe("solveConfig", () => {
	it("scenario 1: objective-only baseline", async () => {
		const options = baseOptions();
		const result = await solveConfig(testItemPool, options);
		const config = new SolverConfiguration(options);

		expect(validateSolution(result, config)).toEqual([]);
		const achieved = computeAchievedStats(result, config);
		// golden values captured from the current (pre-MIP-reformulation) solver - since both
		// today's model and a correct future reformulation solve to the true optimum
		// (mipgap: 0.0), these must stay exactly reproducible across the rewrite
		expect(achieved.avoidance).toBe(100.50431589303089);
		expect(achieved.uncritability).toBe(8.72);
		expect(achieved.objective).toBe(3059.984123);
	}, 30000);

	it("scenario 2: avoidance floor active", async () => {
		const options = baseOptions({
			uncrushabilitySetting: 1,
			buffs: [TEST_AVOIDANCE_BUFF],
		});
		const result = await solveConfig(testItemPool, options);
		const config = new SolverConfiguration(options);

		expect(validateSolution(result, config)).toEqual([]);
		const achieved = computeAchievedStats(result, config);
		expect(achieved.avoidance).toBe(104.28122517322284);
		expect(achieved.uncritability).toBe(9.4);
		expect(achieved.objective).toBe(3154.297943);
	}, 60000);

	it("scenario 3: uncrit floor active", async () => {
		const options = baseOptions({ uncritabilitySetting: 1 });
		const result = await solveConfig(testItemPool, options);
		const config = new SolverConfiguration(options);

		expect(validateSolution(result, config)).toEqual([]);
		const achieved = computeAchievedStats(result, config);
		expect(achieved.avoidance).toBe(100.50431589303089);
		expect(achieved.uncritability).toBe(8.72);
		expect(achieved.objective).toBe(3059.984123);
	}, 60000);

	it("scenario 4: avoidance + uncrit + resistance floors together", async () => {
		// only "Enchant Cloak - Greater Shadow Resistance" (+15) grants any resistance stat
		// applicable to this fixture, forcing the solver to pick it on the Back slot to comply
		const options = baseOptions({
			uncrushabilitySetting: 1,
			uncritabilitySetting: 1,
			buffs: [TEST_AVOIDANCE_BUFF],
			resistanceFloors: [{ stat: "ShadowResistance", value: 10 }],
			enabledConsumableIds: [
				TEST_CONSUMABLE_IDS.flask,
				TEST_CONSUMABLE_IDS.guardianElixir,
				TEST_CONSUMABLE_IDS.battleElixir,
			],
		});
		const result = await solveConfig(testItemPool, options);
		const config = new SolverConfiguration(options);

		expect(validateSolution(result, config)).toEqual([]);
		const achieved = computeAchievedStats(result, config);
		expect(achieved.avoidance).toBe(104.28122517322284);
		expect(achieved.uncritability).toBe(9.4);
		expect(achieved.objective).toBe(3152.297943);
		expect(achieved.resistances.ShadowResistance).toBe(15);
	}, 60000);

	it("scenario 5: locked item is not re-expanded into new gem/enchant variants", async () => {
		const lockedChest: InputItem = {
			id: TEST_ITEM_IDS.chest,
			gems: [TEST_GEM_IDS.uniqueOrange, TEST_GEM_IDS.blue, TEST_GEM_IDS.blue],
			locked: true,
		};
		const pool = testItemPool.map((item) =>
			item.id === TEST_ITEM_IDS.chest ? lockedChest : item,
		);

		const options = baseOptions();
		const result = await solveConfig(pool, options);
		const config = new SolverConfiguration(options);

		expect(validateSolution(result, config)).toEqual([]);
		const chest = result.find((item) => item.id === TEST_ITEM_IDS.chest);
		expect(chest?.gems.map((g) => g.id)).toEqual([
			TEST_GEM_IDS.uniqueOrange,
			TEST_GEM_IDS.blue,
			TEST_GEM_IDS.blue,
		]);
	}, 30000);

	it("scenario 6: solveAll locks a chosen item's gems/enchant across sequential configs", async () => {
		const solverConfig1 = {
			id: "config-1",
			name: "Config 1",
			uncritabilitySetting: 0,
			uncrushabilitySetting: 0,
			optimizeStats: OBJECTIVE_STATS,
			objectiveMode: "stats" as const,
			simMetricWeights: { tps: 0, dtps: 0, tmi5: 0 },
			resistanceFloors: [],
			abilities: [],
			talents: [],
			buffs: [],
			enabledConsumableIds: [],
		};
		const solverConfig2 = {
			...solverConfig1,
			id: "config-2",
			name: "Config 2",
		};
		const baseConfig = {
			areEnchantsGemsLocked: true,
			excludeUniqueGems: false,
			phase: 3,
			raceId: TEST_RACE_ID,
			classId: TEST_CLASS_ID,
			abilitySources: [],
			talentSources: [],
		};

		// solveAll's real solve() spins up a browser Worker, unavailable under vitest - inject
		// solveConfig directly (same underlying logic solver.worker.ts calls) so this test
		// exercises solveAll's real cross-config locking orchestration without a Worker
		const solveFnForTest: typeof solve = (items, options, onProgress) =>
			solveConfig(items, options, onProgress);

		const results = await solveAll(
			testItemPool,
			baseConfig,
			[solverConfig1, solverConfig2],
			undefined,
			solveFnForTest,
		);
		expect(results).toHaveLength(2);

		const config = new SolverConfiguration({ ...baseConfig, ...solverConfig1 });
		expect(validateSolution(results[0].items, config)).toEqual([]);
		expect(validateSolution(results[1].items, config)).toEqual([]);

		// Head has exactly one candidate in the fixture pool, so config 2 must reuse the same
		// base item with the exact same (locked) gems/enchant chosen by config 1, not re-roll them
		const head1 = results[0].items.find(
			(item) => item.id === TEST_ITEM_IDS.head,
		);
		const head2 = results[1].items.find(
			(item) => item.id === TEST_ITEM_IDS.head,
		);
		expect(head2?.gems.map((g) => g.id)).toEqual(head1?.gems.map((g) => g.id));
		expect(head2?.enchant.id).toEqual(head1?.enchant.id);
	}, 60000);

	it("scenario 7: stays fast with a large relevant-gem candidate pool (was combinatorially intractable before the MIP reformulation)", async () => {
		// widen "relevant" stats to nearly the full stat list so most of the ~150 phase-1 gems
		// become candidates - under the old pre-baked-variant model, a 3-socket item alone
		// would enumerate C(150+2,3) ~= 580k gem combinations before GLPK ever ran
		const ALL_STATS: Stat[] = STAT_NAMES.map((name) => ({
			name,
			value: 1,
			type: "flat",
		}));
		const options = baseOptions({ optimizeStats: ALL_STATS });

		const start = Date.now();
		const result = await solveConfig(testItemPool, options);
		const elapsedMs = Date.now() - start;

		const config = new SolverConfiguration(options);
		expect(validateSolution(result, config)).toEqual([]);
		// generous bound - old model would time out/hang on a pool this size, new model should
		// finish in well under a second on typical hardware
		expect(elapsedMs).toBeLessThan(15000);
	}, 30000);

	it("scenario 8: excludeUniqueGems keeps Unique-Equipped gems out of the candidate pool", async () => {
		// weight MeleeCrit alone - Stone of Blades (33143, Yellow, Unique-Equipped, 12 MeleeCrit)
		// out-scores every non-unique MeleeCrit gem in the phase<=3 pool, so the solver reaches for
		// it whenever unique gems are allowed, and must fall back to a lesser non-unique gem
		// (Smooth Lionseye, 32205, 10 MeleeCrit) once they're excluded
		const optimizeStats: Stat[] = [
			{ name: "MeleeCrit", value: 1, type: "flat" },
		];
		const hasUniqueGem = (items: LPItem[]) =>
			items.some((item) => item.gems.some((gem) => gem.isUnique === "true"));

		const included = await solveConfig(
			testItemPool,
			baseOptions({ optimizeStats }),
		);
		expect(hasUniqueGem(included)).toBe(true);

		const excluded = await solveConfig(
			testItemPool,
			baseOptions({ optimizeStats, excludeUniqueGems: true }),
		);
		expect(hasUniqueGem(excluded)).toBe(false);
	}, 60000);

	it("scenario 9: phase filter is cumulative - gems with phase <= the selected phase are eligible", async () => {
		// Bright Crimson Spinel (35487, Red, phase 5) is the only Red-compatible gem in the data
		// that grants AttackPower - at phase <5 no eligible gem exists, so relevant Red sockets go
		// ungemmed; at phase 5 the solver picks it up
		const optimizeStats: Stat[] = [
			{ name: "AttackPower", value: 1, type: "flat" },
		];
		const phase5Gem = "35487";

		const lowPhase = await solveConfig(
			testItemPool,
			baseOptions({ optimizeStats, phase: 3 }),
		);
		expect(
			lowPhase.some((item) => item.gems.some((gem) => gem.id === phase5Gem)),
		).toBe(false);

		const highPhase = await solveConfig(
			testItemPool,
			baseOptions({ optimizeStats, phase: 5 }),
		);
		expect(
			highPhase.some((item) => item.gems.some((gem) => gem.id === phase5Gem)),
		).toBe(true);
	}, 60000);

	it("scenario 10: throws a descriptive error instead of returning a bogus result when no gear combination can satisfy the constraints", async () => {
		// no item/gem/enchant in the fixture pool comes anywhere close to this much Shadow
		// Resistance, so the resistance constraint makes the LP model infeasible
		const options = baseOptions({
			resistanceFloors: [{ stat: "ShadowResistance", value: 100000 }],
		});

		await expect(solveConfig(testItemPool, options)).rejects.toThrow(
			/ShadowResistance resistance target/,
		);
	}, 30000);

	it("scenario 11: solveAll fails the whole batch, naming the offending config, when one of several configs is infeasible", async () => {
		const solvableConfig = {
			id: "config-1",
			name: "Solvable Config",
			uncritabilitySetting: 0,
			uncrushabilitySetting: 0,
			optimizeStats: OBJECTIVE_STATS,
			objectiveMode: "stats" as const,
			simMetricWeights: { tps: 0, dtps: 0, tmi5: 0 },
			resistanceFloors: [],
			abilities: [],
			talents: [],
			buffs: [],
			enabledConsumableIds: [],
		};
		// same fixture pool can't come close to this much Shadow Resistance - see scenario 10
		const unsolvableConfig = {
			...solvableConfig,
			id: "config-2",
			name: "Unsolvable Config",
			resistanceFloors: [{ stat: "ShadowResistance" as const, value: 100000 }],
		};
		const baseConfig = {
			areEnchantsGemsLocked: false,
			excludeUniqueGems: false,
			phase: 3,
			raceId: TEST_RACE_ID,
			classId: TEST_CLASS_ID,
			abilitySources: [],
			talentSources: [],
		};

		const solveFnForTest: typeof solve = (items, options, onProgress) =>
			solveConfig(items, options, onProgress);

		await expect(
			solveAll(
				testItemPool,
				baseConfig,
				[solvableConfig, unsolvableConfig],
				undefined,
				solveFnForTest,
			),
		).rejects.toThrow(/Unsolvable Config.*ShadowResistance resistance target/s);
	}, 60000);
});
