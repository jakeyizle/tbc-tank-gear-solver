import { describe, expect, it } from "vitest";
import { getBaseStats } from "#/data/baseStats";
import type { LPItem, ModifierSource, Stat } from "#/solver/types";
import { calculateStatValue } from "./stats";

const makeItem = (stats: Stat[]): LPItem =>
	({
		name: "Test Item",
		id: "1",
		type: "Chest",
		stats,
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
	}) as LPItem;

const makeModifierSource = (
	stats: Stat[],
	overrides: Partial<ModifierSource & { checked: boolean }> = {},
): ModifierSource => ({
	id: "src",
	name: "Test Source",
	type: "buff",
	stats,
	...overrides,
});

describe("Mana", () => {
	// Human Paladin baseline: Mana 2953, Intellect 83
	const baseStats = getBaseStats("1", "2");

	it("TotalMana clamps the first 20 Intellect to 1:1, matching mangos-tbc's GetManaBonusFromIntellect", () => {
		const totalMana = calculateStatValue({
			items: [],
			modifierSources: [],
			baseStats,
			statName: "TotalMana",
		});
		// 2953 base + (20 + (83 - 20) * 15) bonus from Intellect
		expect(totalMana).toBe(2953 + 965);
	});

	it("Mana is unclamped, since any Intellect an item contributes is always past the clamp", () => {
		const mana = calculateStatValue({
			items: [],
			modifierSources: [],
			baseStats,
			statName: "Mana",
		});
		// 2953 base + 83 * 15, no clamp
		expect(mana).toBe(2953 + 83 * 15);
	});
});

describe("stat aggregation", () => {
	it("stacks multiplier stats multiplicatively on top of the summed flat value", () => {
		const items = [
			makeItem([
				{ name: "Stamina", value: 100, type: "flat" },
				{ name: "Stamina", value: 0.1, type: "multiplier" },
				{ name: "Stamina", value: 0.1, type: "multiplier" },
			]),
		];
		const stamina = calculateStatValue({
			items,
			modifierSources: [],
			baseStats: [],
			statName: "Stamina",
		});
		// 100 * 1.1 * 1.1, floored
		expect(stamina).toBe(Math.floor(100 * 1.1 * 1.1));
	});

	it("excludes an unchecked buff's stats entirely", () => {
		const modifierSources = [
			makeModifierSource([{ name: "Stamina", value: 50, type: "flat" }], { checked: false }),
		];
		const stamina = calculateStatValue({
			items: [],
			modifierSources,
			baseStats: [],
			statName: "Stamina",
		});
		expect(stamina).toBe(0);
	});

	it("scales a ranked modifier source's stats by its rank", () => {
		const modifierSources = [
			makeModifierSource([{ name: "Stamina", value: 5, type: "flat" }], { rank: 3 }),
		];
		const stamina = calculateStatValue({
			items: [],
			modifierSources,
			baseStats: [],
			statName: "Stamina",
		});
		expect(stamina).toBe(15);
	});
});

describe("Armor", () => {
	it("adds 2 Armor per point of Agility on top of flat Armor, floored", () => {
		const items = [
			makeItem([
				{ name: "Armor", value: 100, type: "flat" },
				{ name: "Agility", value: 10.7, type: "flat" },
			]),
		];
		const armor = calculateStatValue({
			items,
			modifierSources: [],
			baseStats: [],
			statName: "Armor",
		});
		// Agility itself floors to 10 before the x2 conversion
		expect(armor).toBe(100 + 10 * 2);
	});
});

describe("Effective HP", () => {
	it("scales Health up by the armor damage-reduction factor", () => {
		const items = [
			makeItem([
				{ name: "Health", value: 1000, type: "flat" },
				{ name: "Armor", value: 5000, type: "flat" },
			]),
		];
		const ehp = calculateStatValue({
			items,
			modifierSources: [],
			baseStats: [],
			statName: "Effective HP",
		});
		const armorDR = 5000 / (5000 + 10557.5);
		expect(ehp).toBeCloseTo(1000 / (1 - armorDR));
	});
});

describe("Avoidance vs ShearAvoidance", () => {
	it("Avoidance includes Miss chance but ShearAvoidance (Illidan Shear ignores Miss) does not", () => {
		const items = [
			makeItem([
				{ name: "Dodge", value: 0, type: "flat" },
				{ name: "Parry", value: 0, type: "flat" },
				{ name: "Block", value: 0, type: "flat" },
				{ name: "Miss", value: 8, type: "flat" },
			]),
		];
		const avoidance = calculateStatValue({
			items,
			modifierSources: [],
			baseStats: [],
			statName: "Avoidance",
		});
		const shearAvoidance = calculateStatValue({
			items,
			modifierSources: [],
			baseStats: [],
			statName: "ShearAvoidance",
		});
		expect(avoidance - shearAvoidance).toBeCloseTo(8);
	});
});
