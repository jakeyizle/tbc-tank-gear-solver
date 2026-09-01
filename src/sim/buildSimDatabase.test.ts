import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSimDatabase } from "./buildSimDatabase";

const fakeDb = {
	items: [
		{ id: 1, name: "Item One", icon: "inv_1", phase: 1, quality: 4 },
		{ id: 2, name: "Item Two", icon: "inv_2", phase: 1, quality: 4 },
		{ id: 3, name: "Unrelated Item", icon: "inv_3", phase: 1, quality: 4 },
	],
	enchants: [
		{
			effectId: 100,
			itemId: 200,
			spellId: 300,
			name: "Enchant matching by effectId",
		},
		// same numeric id as the enchant above's effectId, but as this one's itemId/spellId -
		// must NOT be picked up when gear references effectId 100.
		{
			effectId: 999,
			itemId: 100,
			spellId: 100,
			name: "Decoy sharing the id space",
		},
	],
	gems: [
		{ id: 10, name: "Gem Ten", icon: "inv_gem", phase: 1, quality: 3 },
		{ id: 20, name: "Unrelated Gem", icon: "inv_gem2", phase: 1, quality: 3 },
	],
};

describe("buildSimDatabase", () => {
	it("filters items/enchants/gems down to only what the gear set references", () => {
		const result = buildSimDatabase(fakeDb, [
			{ id: 1, enchant: 100, gems: [10] },
			{ id: 2 },
		]);
		expect(result.items.map((i) => (i as Record<string, unknown>).id)).toEqual([
			1, 2,
		]);
		expect(
			result.enchants.map((e) => (e as Record<string, unknown>).effectId),
		).toEqual([100]);
		expect(result.gems.map((g) => (g as Record<string, unknown>).id)).toEqual([
			10,
		]);
	});

	it("matches an enchant by effectId only, not itemId/spellId, to avoid cross-namespace collisions", () => {
		const result = buildSimDatabase(fakeDb, [{ id: 1, enchant: 100 }]);
		expect(result.enchants).toHaveLength(1);
		expect((result.enchants[0] as Record<string, unknown>).name).toBe(
			"Enchant matching by effectId",
		);
	});

	it("strips UI-only fields (icon/phase/quality) that SimItem/SimGem/SimEnchant don't have", () => {
		const result = buildSimDatabase(fakeDb, [{ id: 1, gems: [10] }]);
		expect(result.items[0]).not.toHaveProperty("icon");
		expect(result.items[0]).not.toHaveProperty("phase");
		expect(result.items[0]).not.toHaveProperty("quality");
		expect(result.gems[0]).not.toHaveProperty("icon");
	});

	it("ignores gear entries with no enchant/gems", () => {
		const result = buildSimDatabase(fakeDb, [{ id: 3 }]);
		expect(result.items.map((i) => (i as Record<string, unknown>).id)).toEqual([
			3,
		]);
		expect(result.enchants).toEqual([]);
		expect(result.gems).toEqual([]);
	});
});

describe("buildSimDatabase against the real vendored database", () => {
	const dbPath = path.resolve(
		__dirname,
		"../../vendor/tbc-sim/assets/database/db.json",
	);
	const gearPath = path.resolve(
		__dirname,
		"../../vendor/tbc-sim/ui/paladin/protection/gear_sets/p3.gear.json",
	);

	it.skipIf(!fs.existsSync(dbPath) || !fs.existsSync(gearPath))(
		"finds a match for every item/enchant/gem in the P3 Protection Paladin preset",
		() => {
			const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
			const gear = JSON.parse(fs.readFileSync(gearPath, "utf8")).items as {
				id: number;
				enchant?: number;
				gems?: number[];
			}[];

			const result = buildSimDatabase(db, gear);

			const expectedEnchants = new Set(
				gear.map((i) => i.enchant).filter((id): id is number => id != null),
			);
			const expectedGems = new Set(gear.flatMap((i) => i.gems ?? []));

			expect(result.items).toHaveLength(gear.length);
			expect(result.enchants).toHaveLength(expectedEnchants.size);
			expect(result.gems).toHaveLength(expectedGems.size);
		},
	);
});
