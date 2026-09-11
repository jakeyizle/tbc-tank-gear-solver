import { describe, expect, it } from "vitest";
import { DEFAULT_SIM_CALIBRATION_PROFILE } from "#/types/SimCalibrationProfile";
import { TEST_ITEM_DATABASE } from "./__fixtures__/testItemDatabase";
import {
	TEST_CLASS_ID,
	TEST_CONSUMABLE_IDS,
	TEST_GEM_IDS,
	TEST_ITEM_IDS,
	TEST_RACE_ID,
	testItemPool,
} from "./__fixtures__/testItemPool";
import { TEST_LINEAR_MODEL } from "./__fixtures__/testLinearModel";
import {
	computeAchievedStats,
	validateSolution,
} from "./__test-helpers__/validateSolution";
import { type solve, solveAll } from "./index";
import { prepareItemCandidates } from "./items";
import { SolverConfiguration } from "./SolverConfiguration";
import { type SolveOptions, solveConfig } from "./solveConfig";
import { type InputItem, type LPItem, STAT_NAMES, type Stat } from "./types";

// "Enchant Ring - Stats", which only an Enchanter can apply to their own rings. The database
// identifies an enchant by the ITEM that applies it (22538), where the hand-maintained data
// used the spell id (27927) - same enchant, authoritative id.
const ENCHANTING_ONLY_RING_ENCHANT = "22538";

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
	excludeJewelcraftingItems: false,
	excludeEnchantingItems: false,
	phase: 3,
	classId: TEST_CLASS_ID,
	linearModel: TEST_LINEAR_MODEL,
	itemDatabase: TEST_ITEM_DATABASE,
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
		// Golden values. The solver runs to the true optimum (mipgap: 0.0), so these are exactly
		// reproducible and any drift is a real change in what the LP considers best. The figures
		// are the ITEMS' contribution only, measured against TEST_LINEAR_MODEL's coefficients.
		//
		// Re-captured twice: once when the sim-measured stat model replaced the hand-written
		// stat engine, and again when the item pool moved from src/data/items.json to the
		// vendored db.json. The second move picked the SAME 16 base items and raised the
		// objective from 2978.31 to 2988.36 - the database carries enchants the hand data never
		// had (Glyph of the Wild, on the head slot here), so the LP simply had more to choose
		// from. Avoidance fell slightly because nothing constrains it in this scenario.
		expect(achieved.avoidance).toBe(73.74731453011535);
		expect(achieved.uncritability).toBe(7.064390065722888);
		expect(achieved.objective).toBe(2988.3631778599997);
	}, 30000);

	it("scenario 2: avoidance floor active", async () => {
		const options = baseOptions({
			uncrushabilitySetting: 1,
		});
		const result = await solveConfig(testItemPool, options);
		const config = new SolverConfiguration(options);

		expect(validateSolution(result, config)).toEqual([]);
		const achieved = computeAchievedStats(result, config);
		expect(achieved.avoidance).toBe(73.74731453011535);
		expect(achieved.uncritability).toBe(7.064390065722888);
		expect(achieved.objective).toBe(2988.3631778599997);
	}, 60000);

	it("scenario 3: uncrit floor active", async () => {
		const options = baseOptions({ uncritabilitySetting: 1 });
		const result = await solveConfig(testItemPool, options);
		const config = new SolverConfiguration(options);

		expect(validateSolution(result, config)).toEqual([]);
		const achieved = computeAchievedStats(result, config);
		expect(achieved.avoidance).toBe(73.74731453011535);
		expect(achieved.uncritability).toBe(7.064390065722888);
		expect(achieved.objective).toBe(2988.3631778599997);
	}, 60000);

	it("scenario 4: avoidance + uncrit + resistance floors together", async () => {
		// only "Enchant Cloak - Greater Shadow Resistance" (+15) grants any resistance stat
		// applicable to this fixture, forcing the solver to pick it on the Back slot to comply.
		// The floor has to clear what the character already has: the raid profile's Shadow
		// Protection puts base Shadow Resistance at 80, so a 10-point floor would be met by
		// wearing nothing at all - the constraint only binds above that.
		const options = baseOptions({
			uncrushabilitySetting: 1,
			uncritabilitySetting: 1,
			resistanceFloors: [{ stat: "ShadowResistance", value: 90 }],
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
		expect(achieved.avoidance).toBe(73.74731453011535);
		expect(achieved.uncritability).toBe(7.064390065722888);
		expect(achieved.objective).toBe(2986.3631778599993);
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
			balance: 0.5,
			survivabilityMetric: "tmi" as const,
			enabledCalibrationStats: [],
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

		// solveAll's real solve() spins up a browser Worker, unavailable under vitest - inject
		// solveConfig directly (same underlying logic solver.worker.ts calls) so this test
		// exercises solveAll's real cross-config locking orchestration without a Worker
		// The real solve() runs in the Worker, which is where the stat model is derived (see
		// solver.worker.ts); this stand-in supplies the committed fixture in its place.
		const solveFnForTest: typeof solve = (items, options, onProgress) =>
			solveConfig(
				items,
				{
					...options,
					linearModel: TEST_LINEAR_MODEL,
					itemDatabase: TEST_ITEM_DATABASE,
				},
				onProgress,
			);

		const results = await solveAll(
			testItemPool,
			baseConfig,
			[solverConfig1, solverConfig2],
			undefined,
			solveFnForTest,
		);
		expect(results).toHaveLength(2);

		const config = new SolverConfiguration({
			...baseConfig,
			...solverConfig1,
			linearModel: TEST_LINEAR_MODEL,
			itemDatabase: TEST_ITEM_DATABASE,
		});
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

	it("scenario 6b: solveAll with independentConfigs solves every config from the original, unlocked pool", async () => {
		const solverConfig1 = {
			id: "config-1",
			name: "Config 1",
			uncritabilitySetting: 0,
			uncrushabilitySetting: 0,
			optimizeStats: OBJECTIVE_STATS,
			objectiveMode: "stats" as const,
			balance: 0.5,
			survivabilityMetric: "tmi" as const,
			enabledCalibrationStats: [],
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
			excludeJewelcraftingItems: false,
			excludeEnchantingItems: false,
			independentConfigs: true,
			phase: 3,
			raceId: TEST_RACE_ID,
			classId: TEST_CLASS_ID,
			abilitySources: [],
			talentSources: [],
			simCalibrationProfile: DEFAULT_SIM_CALIBRATION_PROFILE,
		};

		const capturedInputs: InputItem[][] = [];
		const solveFnForTest: typeof solve = (items, options, onProgress) => {
			capturedInputs.push(items);
			return solveConfig(
				items,
				{
					...options,
					linearModel: TEST_LINEAR_MODEL,
					itemDatabase: TEST_ITEM_DATABASE,
				},
				onProgress,
			);
		};

		const results = await solveAll(
			testItemPool,
			baseConfig,
			[solverConfig1, solverConfig2],
			undefined,
			solveFnForTest,
		);
		expect(results).toHaveLength(2);

		// with independentConfigs, config 2 must receive the exact same starting pool as
		// config 1 - not config 1's locked-in picks
		expect(capturedInputs).toHaveLength(2);
		expect(capturedInputs[1]).toEqual(capturedInputs[0]);
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

	it("scenario 8b: excludeJewelcraftingItems keeps Jewelcrafting-only gems out of the candidate pool, independently of excludeEnchantingItems", async () => {
		// Stone of Blades (33143, Yellow, Jewelcrafting-only, 12 MeleeCrit) out-scores every
		// non-profession-restricted MeleeCrit gem in the phase<=3 pool, so the solver reaches for
		// it whenever Jewelcrafting-only items are allowed, and must fall back to a lesser item
		// (Smooth Lionseye, 32205, 10 MeleeCrit) once they're excluded - same fixture as scenario
		// 8, but gated on the profession flag instead of isUnique.
		const optimizeStats: Stat[] = [
			{ name: "MeleeCrit", value: 1, type: "flat" },
		];
		const hasJewelcraftingGem = (items: LPItem[]) =>
			items.some((item) => item.gems.some((gem) => gem.id === "33143"));

		const included = await solveConfig(
			testItemPool,
			baseOptions({ optimizeStats }),
		);
		expect(hasJewelcraftingGem(included)).toBe(true);

		const excluded = await solveConfig(
			testItemPool,
			baseOptions({ optimizeStats, excludeJewelcraftingItems: true }),
		);
		expect(hasJewelcraftingGem(excluded)).toBe(false);

		// a character who knows Jewelcrafting but not Enchanting (or vice versa) is common - the
		// two toggles must not affect each other's item pool
		const enchantingExcludedOnly = await solveConfig(
			testItemPool,
			baseOptions({ optimizeStats, excludeEnchantingItems: true }),
		);
		expect(hasJewelcraftingGem(enchantingExcludedOnly)).toBe(true);
	}, 60000);

	it("scenario 8d: excludeEnchantingItems keeps Enchanting-only ring enchants out of the Finger candidate pool, independently of excludeJewelcraftingItems", async () => {
		// Ring - Stats (Finger, Enchanting-only per its formula's "Only the Enchanter's
		// rings can be enchanted" restriction) grants Stamina among its stats, which is in
		// OBJECTIVE_STATS, so it clears the relevant-stats filter regardless of eligibility - it
		// must disappear from every Finger item's enchant candidates when excludeEnchantingItems
		// is set, but stay present when only excludeJewelcraftingItems is set. Checked against
		// the raw candidate pool (not a solve outcome), since which enchant wins the slot depends
		// on relative stat weighting, not just eligibility.
		const fingerCandidateIds = (config: SolverConfiguration) => {
			const { decomposableItems } = prepareItemCandidates(
				testItemPool,
				config,
				TEST_ITEM_DATABASE,
			);
			const finger = decomposableItems.find((item) =>
				(TEST_ITEM_IDS.fingers as readonly string[]).includes(item.base.id),
			);
			return (
				finger?.enchantCandidates.map((candidate) => candidate.enchant.id) ?? []
			);
		};

		const defaultConfig = new SolverConfiguration(baseOptions());
		expect(fingerCandidateIds(defaultConfig)).toContain(
			ENCHANTING_ONLY_RING_ENCHANT,
		);

		const enchantingExcludedConfig = new SolverConfiguration(
			baseOptions({ excludeEnchantingItems: true }),
		);
		expect(fingerCandidateIds(enchantingExcludedConfig)).not.toContain(
			ENCHANTING_ONLY_RING_ENCHANT,
		);

		const jewelcraftingExcludedConfig = new SolverConfiguration(
			baseOptions({ excludeJewelcraftingItems: true }),
		);
		expect(fingerCandidateIds(jewelcraftingExcludedConfig)).toContain(
			ENCHANTING_ONLY_RING_ENCHANT,
		);
	});

	it("scenario 8c: class-restricted enchants are excluded from the Head candidate pool for the wrong class", async () => {
		// Presence of Might (19782, Head, Warrior-only) must never even be offered as a candidate
		// for a Paladin (TEST_CLASS_ID = "2"), but is eligible for a Warrior (classId "1") - tested
		// against the raw candidate pool (not the final solve) since which enchant actually wins
		// the slot depends on relative stat weighting, not just eligibility.
		const headCandidateIds = (config: SolverConfiguration) => {
			const { decomposableItems } = prepareItemCandidates(
				testItemPool,
				config,
				TEST_ITEM_DATABASE,
			);
			const head = decomposableItems.find(
				(item) => item.base.id === TEST_ITEM_IDS.head,
			);
			return (
				head?.enchantCandidates.map((candidate) => candidate.enchant.id) ?? []
			);
		};

		const paladinConfig = new SolverConfiguration(baseOptions());
		expect(headCandidateIds(paladinConfig)).not.toContain("19782");

		const warriorConfig = new SolverConfiguration(
			baseOptions({ classId: "1" }),
		);
		expect(headCandidateIds(warriorConfig)).toContain("19782");
	});

	it("scenario 9: phase filter is cumulative - gems with phase <= the selected phase are eligible", async () => {
		// Quick Lionseye (35761, Yellow, phase 5) is the strongest Spell Haste gem in the
		// database, so under a Spell-Haste objective it survives dominance pruning (see
		// pruneDominatedGems) and must appear at phase 5 - and must not exist at all at phase 3.
		//
		// Asserted on the candidate pool rather than the final solve: which gem WINS a socket
		// depends on the stat model's cross-terms, while eligibility is what this scenario is
		// about. It also has to be a stat nothing else feeds, or a lower-phase gem carrying a
		// stat that converts into this one would dominate it.
		const optimizeStats: Stat[] = [
			{ name: "SpellHaste", value: 1, type: "flat" },
		];
		const phase5Gem = "35761";

		const gemCandidateIds = (phase: number) => {
			const config = new SolverConfiguration(
				baseOptions({ optimizeStats, phase }),
			);
			const { decomposableItems } = prepareItemCandidates(
				testItemPool,
				config,
				TEST_ITEM_DATABASE,
			);
			return new Set(
				decomposableItems.flatMap((item) =>
					item.sockets.flatMap((socket) =>
						socket.candidates.map((candidate) => candidate.gem.id),
					),
				),
			);
		};

		const lowPhase = gemCandidateIds(3);
		const highPhase = gemCandidateIds(5);

		expect(lowPhase).not.toContain(phase5Gem);
		expect(highPhase).toContain(phase5Gem);
		// Nothing eligible at phase 3 may become ineligible at phase 5.
		for (const id of lowPhase) expect(highPhase).toContain(id);
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
			balance: 0.5,
			survivabilityMetric: "tmi" as const,
			enabledCalibrationStats: [],
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

		// The real solve() runs in the Worker, which is where the stat model is derived (see
		// solver.worker.ts); this stand-in supplies the committed fixture in its place.
		const solveFnForTest: typeof solve = (items, options, onProgress) =>
			solveConfig(
				items,
				{
					...options,
					linearModel: TEST_LINEAR_MODEL,
					itemDatabase: TEST_ITEM_DATABASE,
				},
				onProgress,
			);

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
