import { describe, expect, it } from "vitest";
import {
	TEST_CLASS_ID,
	TEST_ITEM_IDS,
	TEST_RACE_ID,
	testItemPool,
} from "./__fixtures__/testItemPool";
import { validateSolution } from "./__test-helpers__/validateSolution";
import { SolverConfiguration } from "./SolverConfiguration";
import { type SolveOptions, solveConfig } from "./solveConfig";
import type { InputItem, Stat } from "./types";

// King's Defender (28749): a one-handed sword (Stamina, MeleeHit, Armor, Defense).
// Aegis of the Sunbird (28316): a shield (Stamina, Armor, Defense, BlockValue).
// TEST_ITEM_IDS.weapon (30021, Wildfury Greatstaff) is already a two-hander with a very high
// Stamina/Dodge payload (75/54) - a buggy solver that doesn't link the off-hand slot to the
// weapon's handedness would happily equip it *and* the shield at once, since both independently
// look attractive under a Stamina/Defense/BlockValue objective. This pool offers all three so
// that temptation is real, not just structurally possible.
const item = (id: string): InputItem => ({ id, gems: [] });
const poolWithOneHandAndShieldOptions: InputItem[] = [
	...testItemPool,
	item("28749"), // King's Defender (one-hand)
	item("28316"), // Aegis of the Sunbird (shield)
];

const OBJECTIVE_STATS: Stat[] = [
	{ name: "Stamina", value: 1, type: "flat" },
	{ name: "Dodge", value: 1, type: "flat" },
	{ name: "Defense", value: 1, type: "flat" },
	{ name: "BlockValue", value: 1, type: "flat" },
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
	raceId: TEST_RACE_ID,
	classId: TEST_CLASS_ID,
	talentSources: [],
	buffs: [],
	abilitySources: [],
	enabledConsumableIds: [],
	...overrides,
});

describe("weapon/shield handedness exclusivity", () => {
	it("never equips a two-handed weapon together with a shield", async () => {
		const options = baseOptions();
		const result = await solveConfig(poolWithOneHandAndShieldOptions, options);
		const config = new SolverConfiguration(options);

		expect(validateSolution(result, config)).toEqual([]);

		const hasShield = result.some((item) => item.type === "Shield");
		const hasTwoHand = result.some(
			(item) => item.type === "Weapon" && item.handType === "TwoHand",
		);
		expect(hasShield && hasTwoHand).toBe(false);
		// exactly one of {a shield, a two-hander} must be true - never neither, since a weapon is
		// always mandatory and this pool's only weapon options are the two-hander and the one-hander
		expect(hasShield || hasTwoHand).toBe(true);
	}, 60000);

	it("still equips a one-handed weapon with a shield when no two-hander is offered", async () => {
		const oneHandOnlyPool: InputItem[] = [
			...testItemPool.filter((i) => i.id !== TEST_ITEM_IDS.weapon),
			item("28749"), // King's Defender (one-hand)
			item("28316"), // Aegis of the Sunbird (shield)
		];
		const options = baseOptions();
		const result = await solveConfig(oneHandOnlyPool, options);
		const config = new SolverConfiguration(options);

		expect(validateSolution(result, config)).toEqual([]);
		expect(result.some((item) => item.type === "Shield")).toBe(true);
		expect(
			result.some(
				(item) => item.type === "Weapon" && item.handType === "OneHand",
			),
		).toBe(true);
	}, 60000);
});
