import { describe, expect, it } from "vitest";
import { SLOT_ORDER } from "#/solver/itemSlots";
import type { Enchant, LPItem, ProcessedItemType } from "#/solver/types";
import {
	analyzeItemInput,
	formatItemExport,
	parseCharacterExport,
	parseItemInput,
} from "./parseItemInput";

const FULL_CHARACTER_EXPORT = `{"talents":"00000000000000000000-0530503050000132521050-0520502030030100000000","id":"Player-6065-040B8751","class":"paladin","unit":"player","professions":[{"name":"Enchanting","level":375},{"name":"Engineering","level":361}],"race":"Human","name":"Peevo","spec":"protection","gear":{"items":[{"enchant":3002,"gems":[24056,25896],"id":30125},{"id":30007,"gems":[]}]},"level":70,"version":"v3.2.4","realm":"Nightslayer"}`;

const EMPTY_ENCHANT: Enchant = {
	name: "",
	id: "",
	effectID: "",
	type: "Ranged",
	stats: [],
};

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
		const enchant: Enchant = {
			name: "Fake Enchant",
			id: "9999",
			effectID: "2648",
			type: "Chest",
			stats: [],
		};
		const item = makeItem("302", "Chest", { enchant });

		const exported = JSON.parse(formatItemExport([item]));
		expect(exported.gear.items[0].enchant).toBe(2648);
	});
});

describe("parseItemInput", () => {
	it("parses items from a bare item-pool export", () => {
		const items = parseItemInput(
			'{"items":[{"id":28825,"enchant":2673,"gems":[24033]}]}',
		);
		expect(items).toEqual([{ id: "28825", enchant: "2673", gems: ["24033"] }]);
	});

	it("parses items from a full character export's gear.items", () => {
		const items = parseItemInput(FULL_CHARACTER_EXPORT);
		expect(items).toEqual([
			{ id: "30125", enchant: "3002", gems: ["24056", "25896"] },
			{ id: "30007", enchant: undefined, gems: [] },
		]);
	});

	it("throws on non-JSON input", () => {
		expect(() => parseItemInput("28825, 29011, 28749")).toThrow();
	});
});

describe("parseCharacterExport", () => {
	it("returns null for a bare item-pool export (no character info)", () => {
		expect(
			parseCharacterExport('{"items":[{"id":28825,"gems":[]}]}'),
		).toBeNull();
	});

	it("returns null for non-JSON input", () => {
		expect(parseCharacterExport("28825, 29011")).toBeNull();
	});

	it("extracts class/race/name/spec and decodes ranks for the modeled Paladin talents", () => {
		const character = parseCharacterExport(FULL_CHARACTER_EXPORT);
		expect(character).toEqual({
			name: "Peevo",
			className: "paladin",
			classId: "2",
			raceName: "Human",
			raceId: "1",
			spec: "protection",
			talentRanks: {
				toughness: 5,
				anticipation: 5,
				"sacred-duty": 2,
				"combat-expertise": 5,
				deflection: 5,
			},
			supported: true,
		});
	});

	it("marks an unsupported class as such and skips talent parsing", () => {
		const character = parseCharacterExport(
			'{"class":"Warrior","race":"Human","talents":"5500000-0000000-0000000"}',
		);
		expect(character?.supported).toBe(false);
		expect(character?.classId).toBeUndefined();
		expect(character?.talentRanks).toEqual({});
	});
});

describe("analyzeItemInput", () => {
	it("surfaces detected character info alongside a valid gear pool", () => {
		const analysis = analyzeItemInput(FULL_CHARACTER_EXPORT);
		expect(analysis.status).toBe("valid");
		if (analysis.status !== "valid") throw new Error("expected valid");
		expect(analysis.character?.name).toBe("Peevo");
	});

	it("errors on non-JSON input instead of treating it as item IDs", () => {
		const analysis = analyzeItemInput("28825, 29011, 28749");
		expect(analysis.status).toBe("error");
	});
});
