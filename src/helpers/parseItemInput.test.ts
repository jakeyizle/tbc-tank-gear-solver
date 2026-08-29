import { describe, expect, it } from "vitest";
import { SLOT_ORDER } from "#/solver/itemSlots";
import type { Enchant, LPItem, ProcessedItemType } from "#/solver/types";
import { formatItemExport } from "./parseItemInput";

const EMPTY_ENCHANT: Enchant = { name: "", id: "", effectID: "", type: "Ranged", stats: [] };

const makeItem = (
	id: string,
	type: ProcessedItemType,
	overrides: Partial<LPItem> = {},
): LPItem => ({
	id,
	name: `item-${id}`,
	type,
	stats: [],
	sockets: [],
	socketBonus: [],
	enchant: EMPTY_ENCHANT,
	gems: [],
	gemSlots: [],
	uniqueId: `${id}-0`,
	locked: false,
	avoidanceScore: 0,
	objectiveScore: 0,
	uncritabilityScore: 0,
	resistanceScores: {},
	...overrides,
});

describe("formatItemExport", () => {
	it("matches the addon's canonical inventory slot order (WowSims-style importers map items by position)", () => {
		expect(SLOT_ORDER).toEqual([
			"Head",
			"Neck",
			"Shoulder",
			"Back",
			"Chest",
			"Wrist",
			"Hands",
			"Waist",
			"Legs",
			"Feet",
			"Finger1",
			"Finger2",
			"Trinket1",
			"Trinket2",
			"Weapon",
			"Shield",
			"Ranged",
		]);
	});

	it("orders exported items by slot, not by input order", () => {
		// scrambled input order - Chest and Waist are far apart in SLOT_ORDER
		const items = [
			makeItem("100", "Waist"),
			makeItem("101", "Chest"),
			makeItem("102", "Head"),
			makeItem("103", "Ranged"),
			makeItem("104", "Weapon"),
		];

		const exported = JSON.parse(formatItemExport(items));
		const ids = exported.gear.items.map((i: { id: number }) => i.id);

		expect(ids).toEqual([102, 101, 100, 104, 103]);
	});

	it("assigns the first Finger/Trinket item encountered to slot 1 and the second to slot 2", () => {
		const items = [
			makeItem("200", "Finger", { gemSlots: ["1"] }),
			makeItem("201", "Finger", { gemSlots: ["2"] }),
			makeItem("202", "Trinket"),
			makeItem("203", "Trinket"),
		];

		const exported = JSON.parse(formatItemExport(items));
		const ids = exported.gear.items.map((i: { id: number }) => i.id);

		// Finger1, Finger2, Trinket1, Trinket2 in SLOT_ORDER
		expect(ids).toEqual([200, 201, 202, 203]);
	});

	it("keeps a gem gap ('0') that precedes a filled socket but drops trailing empty sockets", () => {
		const item = makeItem("300", "Head", {
			gemSlots: ["11111", "0", "33333"],
		});

		const exported = JSON.parse(formatItemExport([item]));
		expect(exported.gear.items[0].gems).toEqual([11111, 0, 33333]);
	});

	it("omits the enchant key entirely when the item has no enchant", () => {
		const item = makeItem("301", "Wrist", { enchant: EMPTY_ENCHANT });

		const exported = JSON.parse(formatItemExport([item]));
		expect(exported.gear.items[0]).not.toHaveProperty("enchant");
	});

	it("includes the enchant's effectID (not its recipe/item id) when present", () => {
		const enchant: Enchant = { name: "Fake Enchant", id: "9999", effectID: "2648", type: "Chest", stats: [] };
		const item = makeItem("302", "Chest", { enchant });

		const exported = JSON.parse(formatItemExport([item]));
		expect(exported.gear.items[0].enchant).toBe(2648);
	});
});
