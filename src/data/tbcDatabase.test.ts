// What the adapter must guarantee now that it IS the item database.
//
// This file used to diff the adapter against the hand-maintained src/data/items.json (4,513
// entries), gems.json and enchants.json - that was Phase 0's gate, and it did its job twice
// over: it produced the exact list of ids db.json lacks (now src/data/itemSupplement.ts) and a
// reviewed inventory of the hand data's bugs. Those files are deleted, so the diff cannot run
// any more; the findings are preserved here.
//
// Reviewed 2026-09-10, against the hand data as it stood at deletion. Three groups of
// disagreement, all hand-data bugs, all now fixed by construction:
//   1. HealingPower (the large majority of item diffs). The sim splits a healing item into
//      HealingPower + SpellDamage, where displayed healing is the SUM. The hand data stored the
//      displayed total AND the spell damage, double counting the overlap - verified on
//      31749/30908/34199/30012/32273, where db HealingPower + db SpellDamage === hand
//      HealingPower exactly.
//   2. Gems (7) and spellpower enchants (11) where the hand data simply dropped a secondary
//      stat (MP5, MeleeCrit, MeleeHit, HealingPower).
//   3. "Chest - Exceptional Mana" (2660), where the sim models +150 Mana as an enchant effect
//      rather than a flat stat.
// None affected Protection Paladin solving, but all would have been silent wrong answers for
// any objective that touched those stats.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SUPPLEMENT_ENCHANTS, SUPPLEMENT_ITEMS } from "./itemSupplement";
import { adaptDatabase, type RawTbcDatabase } from "./tbcDatabase";

const dbPath = path.resolve(
	__dirname,
	"../../vendor/tbc-sim/assets/database/db.json",
);
const hasDb = fs.existsSync(dbPath);

function loadAdapted() {
	const raw = JSON.parse(fs.readFileSync(dbPath, "utf8")) as RawTbcDatabase;
	return adaptDatabase(raw);
}

describe.skipIf(!hasDb)("tbcDatabase adapter", () => {
	it("adapts the whole vendored database without dropping records", () => {
		const raw = JSON.parse(fs.readFileSync(dbPath, "utf8")) as RawTbcDatabase;
		const adapted = adaptDatabase(raw);

		// Items with an unmapped proto.ItemType are dropped by design (toItem returns null),
		// but that should be a rounding error, not a silent cull of the pool.
		expect(adapted.items.length).toBeGreaterThan(raw.items.length * 0.99);
		expect(adapted.gems.length).toBe(raw.gems.length);
		// One enchant is dropped: "Felsteel Shield Spike" (effect 2714) has no `type` at all, so
		// it maps to no slot. It also carries no stats, so getEnchants would filter it out
		// regardless - pinned here so a future vendor bump that drops something real is visible.
		expect(adapted.enchants.length).toBe(raw.enchants.length - 1);
	});

	it("reads an item's sparse stat map and dense socket bonus correctly", () => {
		// Crystalforge Faceguard: db.json stores its stats as a SPARSE {statIndex: value} map
		// under scalingOptions["0"], and its socket bonus as a DENSE 42-element array. Confusing
		// the two fails silently, which is why this is pinned on a real record.
		const head = loadAdapted().items.find((item) => item.id === "30125");
		expect(head?.name).toBe("Crystalforge Faceguard");
		expect(head?.stats).toEqual(
			expect.arrayContaining([
				{ name: "Stamina", value: 48, type: "flat" },
				{ name: "Defense", value: 28, type: "flat" },
				{ name: "Armor", value: 1355, type: "flat" },
			]),
		);
		expect(head?.socketBonus).toEqual([
			{ name: "Stamina", value: 6, type: "flat" },
		]);
		expect(head?.sockets.map((socket) => socket.color)).toEqual([
			"Red",
			"Meta",
		]);
	});

	it("cannot derive a class restriction when the teaching item is absent", () => {
		// toEnchant reads the allowlist off the item that applies the enchant, but 126 of the
		// 143 enchants name an item db.json's equipment table does not contain (scrolls are not
		// equipment). Presence of Might is the one case where that loses a real restriction -
		// hence SUPPLEMENT_ENCHANT_CLASSES, which indexItemDatabase applies. Pinned here so the
		// supplement is not quietly made redundant (or quietly left wrong) by a vendor bump.
		const presenceOfMight = loadAdapted().enchants.find(
			(enchant) => enchant.effectID === "2583",
		);
		expect(presenceOfMight?.name).toBe("Presence of Might");
		expect(presenceOfMight?.classes).toBeUndefined();
	});

	it("keeps the supplement to entries the database genuinely lacks", () => {
		// A supplement entry that db.json also has would shadow the sim-accurate record with
		// hand-maintained stats - exactly the drift this refactor exists to end. indexItemDatabase
		// appends the supplement, so a duplicate id would win.
		const adapted = loadAdapted();
		const dbItemIds = new Set(adapted.items.map((item) => item.id));
		const dbEnchantEffectIds = new Set(
			adapted.enchants.map((enchant) => enchant.effectID),
		);

		expect(
			SUPPLEMENT_ITEMS.filter((item) => dbItemIds.has(item.id)).map(
				(item) => `${item.id} ${item.name}`,
			),
		).toEqual([]);
		expect(
			SUPPLEMENT_ENCHANTS.filter((enchant) =>
				dbEnchantEffectIds.has(enchant.effectID),
			).map((enchant) => `${enchant.effectID} ${enchant.name}`),
		).toEqual([]);
	});
});
