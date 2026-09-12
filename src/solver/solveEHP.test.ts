import { describe, expect, it } from "vitest";
import { armorDamageReduction } from "#/data/mechanics";
import { parseItemInput } from "#/helpers/parseItemInput";
import { DEFAULT_SIM_CALIBRATION_PROFILE } from "#/types/SimCalibrationProfile";
import { EXAMPLE_GEAR_POOL_JSON } from "./__fixtures__/exampleGearPool";
import { TEST_ITEM_DATABASE } from "./__fixtures__/testItemDatabase";
import {
	TEST_CLASS_ID,
	TEST_RACE_ID,
	testItemPool,
} from "./__fixtures__/testItemPool";
import { TEST_LINEAR_MODEL } from "./__fixtures__/testLinearModel";
import { validateSolution } from "./__test-helpers__/validateSolution";
import { type solve, solveAll } from "./index";
import { SolverConfiguration } from "./SolverConfiguration";
import { scoreItemSet } from "./scores";
import { type SolveOptions, solveConfig } from "./solveConfig";
import { solveConfigForEHP, solveGearSet } from "./solveEHP";
import type { LPItem, Stat } from "./types";

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

// Effective HP for an assembled set, mirroring solveEHP.ts's own final calculation but derived
// here so the test is not just re-reading the number under test.
const effectiveHPOf = (
	items: LPItem[],
	config: SolverConfiguration,
): number => {
	const model = config.linearModel;
	const totals = scoreItemSet(items, model, ["Armor", "Health"]);
	const armor = (model.base.Armor ?? 0) + (totals.Armor ?? 0);
	const health = (model.base.Health ?? 0) + (totals.Health ?? 0);
	return (
		health /
		((1 - armorDamageReduction(armor, model.attackerLevel)) *
			model.physicalDamageTakenMultiplier)
	);
};

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
		const staminaEHP = effectiveHPOf(staminaResult, staminaConfig);

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
			resistanceFloors: [{ stat: "ShadowResistance", value: 10 }],
		});
		const { items, converged } = await solveConfigForEHP(testItemPool, options);
		const config = new SolverConfiguration({ ...options, optimizeStats: [] });

		expect(validateSolution(items, config)).toEqual([]);
		expect(converged).toBe(true);

		const resistance =
			scoreItemSet(items, config.linearModel, ["ShadowResistance"])
				.ShadowResistance ?? 0;
		expect(resistance).toBeGreaterThanOrEqual(
			config.resistanceTargets[0].target,
		);
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
		// The real solve() runs in the Worker, which is where the stat model is derived (see
		// solver.worker.ts); this stand-in supplies the committed fixture in its place.
		const solveFnForTest: typeof solve = (items, options, onProgress) =>
			solveGearSet(
				items,
				{
					...options,
					linearModel: TEST_LINEAR_MODEL,
					itemDatabase: TEST_ITEM_DATABASE,
				},
				onProgress,
			);

		const ehpConfig = {
			id: "config-1",
			name: "EHP Config",
			uncritabilitySetting: 0,
			uncrushabilitySetting: 0,
			optimizeStats: [],
			objectiveMode: "ehp" as const,
			balance: 0.5,
			survivabilityMetric: "tmi" as const,
			resistanceFloors: [],
			abilities: [],
			talents: [],
			buffs: [],
			enabledConsumableIds: [],
			enabledCalibrationStats: [],
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
			excludeJewelcraftingItems: false,
			excludeEnchantingItems: false,
			independentConfigs: false,
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
			linearModel: TEST_LINEAR_MODEL,
			itemDatabase: TEST_ITEM_DATABASE,
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

// A "stats" config with nothing weighted has an identically-zero objective: every feasible set
// ties and glpk returns an arbitrary one. Under dependent configs (solveAll's default) those
// arbitrary picks are then locked into every later config carrying their gems, so a config that
// expressed no preference silently dictates the gemming for the ones that did - and any pool
// change reshuffles the tie-break. See assertObjectiveIsWeighted in solveEHP.ts.
describe("zero-objective guard", () => {
	it("refuses a stats-mode solve with nothing weighted", async () => {
		await expect(
			solveGearSet(testItemPool, {
				...baseOptions(),
				optimizeStats: [],
				objectiveMode: "stats",
			}),
		).rejects.toThrow(/No stats are weighted/);
	});

	it("refuses when every weight is zero", async () => {
		await expect(
			solveGearSet(testItemPool, {
				...baseOptions(),
				optimizeStats: [{ name: "Stamina", value: 0, type: "flat" }],
				objectiveMode: "stats",
			}),
		).rejects.toThrow(/No stats are weighted/);
	});

	it("treats a missing objectiveMode as stats mode", async () => {
		await expect(
			solveGearSet(testItemPool, { ...baseOptions(), optimizeStats: [] }),
		).rejects.toThrow(/No stats are weighted/);
	});

	it("does not fire for modes that compute their own weights", async () => {
		// ehp/hardAvoidance/tps/... all ignore optimizeStats entirely, so an empty one is normal
		// and must not be rejected - this is exactly how the UI submits an EHP config.
		const result = await solveGearSet(testItemPool, {
			...baseOptions(),
			optimizeStats: [],
			objectiveMode: "ehp",
		});
		expect(result.length).toBeGreaterThan(0);
	}, 60000);
});

// Dependent configs (the default) lock each set's picks into the next set's pool WITH their gems,
// because an item exists once and can be gemmed one way. That is intended, but it makes a later
// set's result depend on earlier ones - which is what made an 18-item pool look like it scored
// worse than its own 17-item subset. solveAll records what was inherited so the UI can say so.
describe("inherited item tracking", () => {
	const configFor = (id: string, name: string) => ({
		id,
		name,
		uncritabilitySetting: 0,
		uncrushabilitySetting: 0,
		optimizeStats: [{ name: "Stamina" as const, value: 1, type: "flat" as const }],
		objectiveMode: "stats" as const,
		balance: 0.5,
		survivabilityMetric: "tmi" as const,
		resistanceFloors: [],
		enabledConsumableIds: [],
		enabledCalibrationStats: [],
	});

	const baseConfigFor = (overrides: Record<string, unknown>) => ({
		areEnchantsGemsLocked: false,
		excludeUniqueGems: false,
		excludeJewelcraftingItems: false,
		excludeEnchantingItems: false,
		independentConfigs: false,
		phase: 3,
		raceId: TEST_RACE_ID,
		classId: TEST_CLASS_ID,
		simCalibrationProfile: DEFAULT_SIM_CALIBRATION_PROFILE,
		...overrides,
	});

	const solveFnForTest: typeof solve = (items, options, onProgress) =>
		solveGearSet(
			items,
			{
				...options,
				linearModel: TEST_LINEAR_MODEL,
				itemDatabase: TEST_ITEM_DATABASE,
			},
			onProgress,
		);

	it("records what a later set inherited, and nothing for the first", async () => {
		const results = await solveAll(
			testItemPool,
			baseConfigFor({}),
			[configFor("a", "First"), configFor("b", "Second")],
			undefined,
			solveFnForTest,
		);
		// The first set solves an untouched pool, so it inherits nothing.
		expect(results[0].inheritedItemIds).toEqual([]);
		// The second inherits every item the first took and it also kept.
		expect(results[1].inheritedItemIds?.length).toBeGreaterThan(0);
		const firstIds = new Set(results[0].items.map((item) => item.id));
		for (const id of results[1].inheritedItemIds ?? []) {
			expect(firstIds.has(id)).toBe(true);
		}
	}, 120000);

	it("records nothing when configs solve independently", async () => {
		const results = await solveAll(
			testItemPool,
			baseConfigFor({ independentConfigs: true }),
			[configFor("a", "First"), configFor("b", "Second")],
			undefined,
			solveFnForTest,
		);
		expect(results[1].inheritedItemIds).toEqual([]);
	}, 120000);

	it("records nothing when the user locked gems themselves", async () => {
		// They fixed every item's gems, so an earlier set re-fixing them to the same thing
		// constrains nothing - flagging it would be noise on every row.
		const results = await solveAll(
			testItemPool,
			baseConfigFor({ areEnchantsGemsLocked: true }),
			[configFor("a", "First"), configFor("b", "Second")],
			undefined,
			solveFnForTest,
		);
		expect(results[1].inheritedItemIds).toEqual([]);
	}, 120000);
});
