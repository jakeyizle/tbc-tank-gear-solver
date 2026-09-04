import { describe, expect, it } from "vitest";
import type { LPItem } from "#/solver/types";
import { splitGearAndConsumables } from "./resolveGearAndConsumables";

const item = (
	overrides: Partial<Pick<LPItem, "id" | "type" | "uniqueId">>,
): LPItem =>
	({
		name: "Test Item",
		id: "1",
		type: "Chest",
		stats: [],
		sockets: [],
		socketBonus: [],
		enchant: { name: "", id: "", effectID: "", type: "Chest", stats: [] },
		gems: [],
		gemSlots: [],
		uniqueId: "1",
		locked: false,
		avoidanceScore: 0,
		objectiveScore: 0,
		uncritabilityScore: 0,
		resistanceScores: {},
		constraintScore: 0,
		...overrides,
	}) as LPItem;

describe("splitGearAndConsumables", () => {
	it("reorders scrambled gear into canonical slot order", () => {
		const waist = item({ id: "1", type: "Waist", uniqueId: "waist" });
		const head = item({ id: "2", type: "Head", uniqueId: "head" });
		const feet = item({ id: "3", type: "Feet", uniqueId: "feet" });
		const { gear } = splitGearAndConsumables([waist, head, feet]);
		expect(gear.map((g) => g.id)).toEqual(["2", "1", "3"]);
	});

	it("excludes consumable-type items from the gear array", () => {
		const head = item({ id: "2", type: "Head", uniqueId: "head" });
		const flask = item({
			id: "flask-of-blinding-light",
			type: "Flask",
			uniqueId: "flask-of-blinding-light",
		});
		const { gear } = splitGearAndConsumables([flask, head]);
		expect(gear).toHaveLength(1);
		expect(gear[0].id).toBe("2");
	});

	it("returns an all-zero consumables triple when nothing is chosen", () => {
		const head = item({ id: "2", type: "Head", uniqueId: "head" });
		const { consumables } = splitGearAndConsumables([head]);
		expect(consumables).toEqual({
			flaskId: 0,
			battleElixirId: 0,
			guardianElixirId: 0,
		});
	});

	it("resolves a chosen flask to its wowheadId, leaving elixir ids at 0", () => {
		const flask = item({
			id: "flask-of-blinding-light",
			type: "Flask",
			uniqueId: "flask-of-blinding-light",
		});
		const { consumables } = splitGearAndConsumables([flask]);
		expect(consumables).toEqual({
			flaskId: 22861,
			battleElixirId: 0,
			guardianElixirId: 0,
		});
	});

	it("resolves a chosen battle+guardian elixir combo, leaving flaskId at 0", () => {
		const battle = item({
			id: "elixir-of-major-agility",
			type: "BattleElixir",
			uniqueId: "elixir-of-major-agility",
		});
		const guardian = item({
			id: "elixir-of-major-defense",
			type: "GuardianElixir",
			uniqueId: "elixir-of-major-defense",
		});
		const { consumables } = splitGearAndConsumables([battle, guardian]);
		expect(consumables).toEqual({
			flaskId: 0,
			battleElixirId: 22831,
			guardianElixirId: 22834,
		});
	});

	it("resolves an unknown consumable id to 0 rather than throwing", () => {
		const flask = item({
			id: "not-a-real-consumable",
			type: "Flask",
			uniqueId: "not-a-real-consumable",
		});
		const { consumables } = splitGearAndConsumables([flask]);
		expect(consumables.flaskId).toBe(0);
	});
});
