import { describe, expect, it } from "vitest";
import {
	CONSUMABLE_TYPES,
	groupItemsBySlot,
	SLOT_LABELS,
	SLOT_ORDER,
} from "./itemSlots";
import type { LPItem } from "./types";

// Slot ordering and grouping for gear export/display.
//
// SLOT_ORDER is a POSITIONAL contract with the WowSims importer (see the file's own comment: it
// must match ExportStructures/EquipmentSpec.lua's itemLayout, because items are mapped to slots
// by position). A reorder produces an export that another tool silently misreads - every item
// lands in the wrong slot, and nothing here throws.
//
// That makes the literal assertion below the right test even though it reads like a tautology:
// the failure mode is someone reordering the list, and pinning it is precisely what should make
// them stop and think.

const item = (type: string, id = type): LPItem =>
	({ id, uniqueId: `${id}-0`, name: id, type }) as unknown as LPItem;

describe("SLOT_ORDER", () => {
	it("is the exact 17-slot positional layout the exporter expects", () => {
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

	it("has a label for every slot, so no export row can render blank", () => {
		for (const slot of SLOT_ORDER) {
			expect(SLOT_LABELS[slot], `no label for ${slot}`).toBeTruthy();
		}
	});

	// The doubled slots are the ones groupItemsBySlot has to number, so the two lists must agree:
	// a Finger3 in SLOT_ORDER, or a missing Finger2, would drop a real item from the export.
	it("numbers exactly the slots that can hold two items", () => {
		expect(SLOT_ORDER.filter((s) => s.startsWith("Finger"))).toEqual([
			"Finger1",
			"Finger2",
		]);
		expect(SLOT_ORDER.filter((s) => s.startsWith("Trinket"))).toEqual([
			"Trinket1",
			"Trinket2",
		]);
	});

	it("contains no duplicates", () => {
		expect(SLOT_ORDER).toHaveLength(new Set(SLOT_ORDER).size);
	});

	// Consumables are solved as pseudo-items but are not equipment, so they must never appear in
	// a gear export's slot layout.
	//
	// The list is asserted explicitly first. An earlier version of this test only looped over
	// CONSUMABLE_TYPES asserting absence, which mutation testing showed to be vacuous: emptying
	// the array made the loop body never run, and the test still passed.
	it("excludes the consumable pseudo-slots", () => {
		expect(CONSUMABLE_TYPES).toEqual([
			"Flask",
			"GuardianElixir",
			"BattleElixir",
		]);
		for (const type of CONSUMABLE_TYPES) {
			expect(SLOT_ORDER).not.toContain(type);
		}
	});
});

describe("groupItemsBySlot", () => {
	it("keys a single-slot item by its own type", () => {
		const grouped = groupItemsBySlot([item("Head"), item("Chest")]);
		expect(grouped.Head?.id).toBe("Head");
		expect(grouped.Chest?.id).toBe("Chest");
	});

	// The numbering is positional, in input order - so a set's two rings land in Finger1/Finger2
	// rather than colliding on one key and losing an item.
	it("numbers two rings and two trinkets in input order", () => {
		const grouped = groupItemsBySlot([
			item("Finger", "ring-a"),
			item("Finger", "ring-b"),
			item("Trinket", "trink-a"),
			item("Trinket", "trink-b"),
		]);
		expect(grouped.Finger1?.id).toBe("ring-a");
		expect(grouped.Finger2?.id).toBe("ring-b");
		expect(grouped.Trinket1?.id).toBe("trink-a");
		expect(grouped.Trinket2?.id).toBe("trink-b");
		// And never an un-numbered key, which no SLOT_ORDER entry would match.
		expect(grouped.Finger).toBeUndefined();
		expect(grouped.Trinket).toBeUndefined();
	});

	it("numbers a lone ring as Finger1, not Finger", () => {
		const grouped = groupItemsBySlot([item("Finger", "only-ring")]);
		expect(grouped.Finger1?.id).toBe("only-ring");
		expect(grouped.Finger2).toBeUndefined();
	});

	// A shield is its own slot, not a second Weapon - an off-hand and a main hand must not
	// overwrite each other.
	it("keeps a shield and a weapon in separate slots", () => {
		const grouped = groupItemsBySlot([item("Weapon"), item("Shield")]);
		expect(grouped.Weapon?.id).toBe("Weapon");
		expect(grouped.Shield?.id).toBe("Shield");
	});

	it("counts rings and trinkets independently of each other", () => {
		const grouped = groupItemsBySlot([
			item("Trinket", "trink-a"),
			item("Finger", "ring-a"),
			item("Trinket", "trink-b"),
		]);
		expect(grouped.Finger1?.id).toBe("ring-a");
		expect(grouped.Trinket1?.id).toBe("trink-a");
		expect(grouped.Trinket2?.id).toBe("trink-b");
	});

	it("returns an empty record for an empty set", () => {
		expect(groupItemsBySlot([])).toEqual({});
	});
});
