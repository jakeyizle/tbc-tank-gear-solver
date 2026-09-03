import { describe, expect, it } from "vitest";
import {
	TEST_CLASS_ID,
	TEST_RACE_ID,
} from "#/solver/__fixtures__/testItemPool";
import type { InputItem } from "#/solver/types";
import type { TbcUiDatabase } from "./buildStatWeightsRequest";
import {
	exceedsHysteresisThreshold,
	filterItemsForClass,
	isSignificantImprovement,
} from "./solveSimMetric";

// classAllowlist values are tbc-new's proto.Class ordinals (common.proto): Warrior=1, Paladin=2.
const fakeDb: TbcUiDatabase = {
	items: [
		{ id: 1, name: "Onslaught Shoulderguards", classAllowlist: [1] },
		{ id: 2, name: "Lightbringer Chestguard", classAllowlist: [2] },
		{ id: 3, name: "Generic Plate Belt" }, // no allowlist - usable by anyone
		{ id: 4, name: "Empty Allowlist Item", classAllowlist: [] },
	],
	enchants: [],
	gems: [],
};

const item = (id: string): InputItem => ({ id, gems: [] });

describe("filterItemsForClass", () => {
	it("drops items restricted to a different class", () => {
		const items = [item("1"), item("2"), item("3"), item("4")];
		const result = filterItemsForClass(items, fakeDb, "2");
		expect(result.map((i) => i.id)).toEqual(["2", "3", "4"]);
	});

	it("keeps items with no allowlist or an empty allowlist for any class", () => {
		const items = [item("3"), item("4")];
		expect(filterItemsForClass(items, fakeDb, "1")).toEqual(items);
	});

	it("keeps items missing from the database entirely (nothing to validate against)", () => {
		const items = [item("999")];
		expect(filterItemsForClass(items, fakeDb, "2")).toEqual(items);
	});

	it("returns an empty pool unchanged", () => {
		expect(filterItemsForClass([], fakeDb, "2")).toEqual([]);
	});
});

describe("exceedsHysteresisThreshold", () => {
	it("accepts a delta that comfortably clears the noise band", () => {
		expect(exceedsHysteresisThreshold(10, 2)).toBe(true);
	});

	it("rejects a delta smaller than the noise band", () => {
		expect(exceedsHysteresisThreshold(1, 2)).toBe(false);
	});

	it("rejects a delta exactly equal to the noise band (must strictly exceed it)", () => {
		expect(exceedsHysteresisThreshold(2, 2)).toBe(false);
	});

	it("treats stdevDelta's sign as irrelevant (only magnitude matters)", () => {
		expect(exceedsHysteresisThreshold(10, -2)).toBe(true);
		expect(exceedsHysteresisThreshold(1, -2)).toBe(false);
	});

	it("rejects a non-positive delta regardless of how small the noise band is", () => {
		expect(exceedsHysteresisThreshold(0, 0)).toBe(false);
		expect(exceedsHysteresisThreshold(-5, 0.001)).toBe(false);
	});

	it("a higher confidence k requires a proportionally larger delta", () => {
		expect(exceedsHysteresisThreshold(5, 2, 1)).toBe(true);
		expect(exceedsHysteresisThreshold(5, 2, 3)).toBe(false);
	});
});

describe("isSignificantImprovement", () => {
	// Real fixture items (src/data/items.json) - id 34400 (Crown of Dath'Remar) carries 91
	// Stamina, id 30007 (The Darkener's Grasp) carries 40 - a real, known-nonzero gap so the
	// test doesn't need to hand-construct fake item data, only real.ish weight vectors.
	const previous = [{ id: "30007", enchant: { id: "" }, gemSlots: [] }];
	const proposed = [{ id: "34400", enchant: { id: "" }, gemSlots: [] }];
	const optimizeStats = [
		{ name: "Stamina" as const, value: 1, type: "flat" as const },
	];
	const proposedScore = 91; // 34400's Stamina under the weight-1 config above

	const baseOptions = {
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
	};

	it("accepts the swap when the calibrated stdev is small relative to the real stat gap", () => {
		const stdevStats = [
			{ name: "Stamina" as const, value: 0.01, type: "flat" as const },
		];
		expect(
			isSignificantImprovement(
				previous,
				proposed,
				proposedScore,
				optimizeStats,
				stdevStats,
				baseOptions,
			),
		).toBe(true);
	});

	it("rejects the swap when the calibrated stdev swamps the real stat gap", () => {
		const stdevStats = [
			{ name: "Stamina" as const, value: 1000, type: "flat" as const },
		];
		expect(
			isSignificantImprovement(
				previous,
				proposed,
				proposedScore,
				optimizeStats,
				stdevStats,
				baseOptions,
			),
		).toBe(false);
	});
});
