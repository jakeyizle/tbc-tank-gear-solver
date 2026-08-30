import { describe, expect, it } from "vitest";
import { gemsSatisfySocketBonus, itemMeetsSocketBonus } from "./socketBonus";
import type { LPItem } from "./types";

describe("gemsSatisfySocketBonus", () => {
	it("matches when every gem is the exact socket color", () => {
		expect(gemsSatisfySocketBonus(["Red", "Blue"], ["Red", "Blue"])).toBe(true);
	});

	it("lets Purple satisfy either a Red or a Blue socket", () => {
		expect(gemsSatisfySocketBonus(["Red", "Blue"], ["Purple", "Purple"])).toBe(true);
	});

	it("does not let Purple satisfy a Yellow socket", () => {
		expect(gemsSatisfySocketBonus(["Yellow"], ["Purple"])).toBe(false);
	});

	it("fails when a hybrid gem is double-counted across two sockets it could each individually fill", () => {
		// one Purple gem can fill Red OR Blue, but not both at once - two sockets need two gems
		expect(gemsSatisfySocketBonus(["Red", "Blue"], ["Purple"])).toBe(false);
	});

	it("fails when there are fewer gems than sockets", () => {
		expect(gemsSatisfySocketBonus(["Red", "Blue", "Yellow"], ["Red", "Blue"])).toBe(false);
	});

	it("ignores extra gems beyond what the sockets need", () => {
		expect(gemsSatisfySocketBonus(["Red"], ["Red", "Blue", "Yellow"])).toBe(true);
	});

	it("returns true for zero sockets regardless of gems supplied", () => {
		expect(gemsSatisfySocketBonus([], ["Red"])).toBe(true);
	});
});

describe("itemMeetsSocketBonus", () => {
	const baseItem = (
		overrides: Partial<Pick<LPItem, "socketBonus" | "sockets" | "gems">>,
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
			...overrides,
		}) as LPItem;

	it("is false when the item has no socket bonus to earn", () => {
		const item = baseItem({
			socketBonus: [],
			sockets: [{ color: "Red" }],
			gems: [{ name: "g", id: "1", color: "Red", phase: "1", stats: [] }],
		});
		expect(itemMeetsSocketBonus(item)).toBe(false);
	});

	it("is true when socketed gems match the required socket colors", () => {
		const item = baseItem({
			socketBonus: [{ name: "Stamina", value: 4, type: "flat" }],
			sockets: [{ color: "Red" }, { color: "Blue" }],
			gems: [
				{ name: "g1", id: "1", color: "Red", phase: "1", stats: [] },
				{ name: "g2", id: "2", color: "Blue", phase: "1", stats: [] },
			],
		});
		expect(itemMeetsSocketBonus(item)).toBe(true);
	});

	it("is false when a socket is left empty", () => {
		const item = baseItem({
			socketBonus: [{ name: "Stamina", value: 4, type: "flat" }],
			sockets: [{ color: "Red" }, { color: "Blue" }],
			gems: [{ name: "g1", id: "1", color: "Red", phase: "1", stats: [] }],
		});
		expect(itemMeetsSocketBonus(item)).toBe(false);
	});

	it("ignores Meta sockets and Meta gems when checking the colored-socket bonus", () => {
		const item = baseItem({
			socketBonus: [{ name: "Stamina", value: 4, type: "flat" }],
			sockets: [{ color: "Meta" }, { color: "Red" }],
			gems: [
				{ name: "meta", id: "1", color: "Meta", phase: "1", stats: [] },
				{ name: "g", id: "2", color: "Red", phase: "1", stats: [] },
			],
		});
		expect(itemMeetsSocketBonus(item)).toBe(true);
	});
});
