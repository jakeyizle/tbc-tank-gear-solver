import { itemMeetsSocketBonus } from "./socketBonus";
import type { LPItem } from "./types";

export const LEFT_SLOTS: string[] = [
	"Head",
	"Neck",
	"Shoulder",
	"Back",
	"Chest",
	"Wrist",
	"Hands",
	"Weapon",
	"Shield",
];

export const RIGHT_SLOTS: string[] = [
	"Waist",
	"Legs",
	"Feet",
	"Finger1",
	"Finger2",
	"Trinket1",
	"Trinket2",
	"Ranged",
];

// Canonical slot ordering used by WowSims-style gear exports.
export const SLOT_ORDER: string[] = [...LEFT_SLOTS, ...RIGHT_SLOTS];

export const SLOT_LABELS: Record<string, string> = {
	Head: "Head",
	Neck: "Neck",
	Shoulder: "Shoulder",
	Back: "Back",
	Chest: "Chest",
	Wrist: "Wrist",
	Hands: "Hands",
	Waist: "Waist",
	Legs: "Legs",
	Feet: "Feet",
	Finger1: "Ring 1",
	Finger2: "Ring 2",
	Trinket1: "Trinket 1",
	Trinket2: "Trinket 2",
	Weapon: "Main Hand",
	Shield: "Off Hand",
	Ranged: "Ranged",
};

export interface EquipmentSummary {
	filledSlots: number;
	totalSlots: number;
	gemCount: number;
	socketBonusesMet: number;
}

export const summarizeEquipment = (items: LPItem[]): EquipmentSummary => {
	let gemCount = 0;
	let socketBonusesMet = 0;

	for (const item of items) {
		gemCount += item.gems.length;
		if (itemMeetsSocketBonus(item)) socketBonusesMet++;
	}

	return {
		filledSlots: items.length,
		totalSlots: SLOT_ORDER.length,
		gemCount,
		socketBonusesMet,
	};
};

export const groupItemsBySlot = (
	items: LPItem[],
): Record<string, LPItem> => {
	const result: Record<string, LPItem> = {};
	const counters: Record<string, number> = {};

	items.forEach((item) => {
		const type = item.type;
		// Slots that can have multiples
		if (type === "Finger" || type === "Trinket") {
			counters[type] = (counters[type] || 0) + 1;
			const indexedType = `${type}${counters[type]}`;
			result[indexedType] = item;
		} else {
			result[type] = item;
		}
	});

	return result;
};
