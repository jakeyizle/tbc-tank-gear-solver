import type { LPItem } from "./types";

export const LEFT_SLOTS: string[] = [
	"Head",
	"Neck",
	"Shoulder",
	"Back",
	"Chest",
	"Wrist",
	"Hands",
];

export const RIGHT_SLOTS: string[] = [
	"Waist",
	"Legs",
	"Feet",
	"Finger1",
	"Finger2",
	"Trinket1",
	"Trinket2",
];

export const BOTTOM_SLOTS: string[] = ["Weapon", "Shield", "Ranged"];

// Canonical slot ordering used by WowSims-style gear exports.
export const SLOT_ORDER: string[] = [
	...LEFT_SLOTS,
	...RIGHT_SLOTS,
	...BOTTOM_SLOTS,
];

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
