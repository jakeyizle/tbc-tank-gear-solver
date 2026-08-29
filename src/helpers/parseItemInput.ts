// Supported input formats:
//   1. WowSims Exporter JSON: { gear: { items: [...] } }
//   2. WowSims Exporter JSON: { items: [...] }
//   3. Legacy comma-separated list of item IDs: 123, 456, ...

import Enchants from "#/data/enchants.json";
import Gems from "#/data/gems.json";
import Items from "#/data/items.json";
import { groupItemsBySlot, SLOT_ORDER } from "#/solver/itemSlots";
import type { InputItem, LPItem } from "#/solver/types";

const knownItemIds = new Set(Items.map((i) => i.id));
const knownGemIds = new Set(Gems.map((g) => g.id));
const knownEnchantIds = new Set(Enchants.flatMap((e) => [e.id, e.effectID]));

const looksLikeJson = (input: string) => {
	const trimmed = input.trim();
	return trimmed.startsWith("{") || trimmed.startsWith("[");
};

export const parseItemInput = (input: string): InputItem[] => {
	const trimmed = input.trim();
	if (!trimmed) return [];

	if (!looksLikeJson(trimmed)) {
		return trimmed
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean)
			.map((id) => ({ id, gems: [] })) as InputItem[];
	}

	const data = JSON.parse(trimmed);
	const items = data.items || data.gear?.items || [];

	return items.map(
		(item: {
			id: string | number;
			enchant?: string | number;
			gems: (string | number)[];
		}) => ({
			id: item.id != null ? String(item.id) : "",
			enchant: item.enchant != null ? String(item.enchant) : undefined,
			gems: Array.isArray(item.gems) ? item.gems.map((g) => String(g)) : [],
		}),
	) as InputItem[];
};

export const formatItemExport = (items: LPItem[]): string => {
	const itemMap = groupItemsBySlot(items);
	const orderedItems = SLOT_ORDER.map((slot) => itemMap[slot]).filter(
		(item): item is LPItem => item != null,
	);

	const exportItems = orderedItems.map((item) => ({
		...(item.enchant.effectID
			? { enchant: Number(item.enchant.effectID) }
			: {}),
		gems: item.gemSlots.map((id) => Number(id)),
		id: Number(item.id),
	}));
	return JSON.stringify({ gear: { items: exportItems } });
};

export type ItemInputAnalysis =
	| { status: "empty" }
	| { status: "valid"; count: number; format: "json" | "ids" }
	| {
			status: "warning";
			count: number;
			format: "json" | "ids";
			unknownItemIds: string[];
			unknownGemIds: string[];
			unknownEnchantIds: string[];
	  }
	| { status: "error"; message: string };

// An id of "0" (or empty) conventionally means "no gem"/"no enchant" in a
// WowSims export, not an unknown id.
const isEmptySlot = (id: string | undefined) => !id || id === "0";

// Non-throwing analysis used to give the user live feedback as they type/paste.
export const analyzeItemInput = (input: string): ItemInputAnalysis => {
	const trimmed = input.trim();
	if (!trimmed) return { status: "empty" };

	const format = looksLikeJson(trimmed) ? "json" : "ids";

	try {
		const items = parseItemInput(trimmed);
		if (items.length === 0) {
			return {
				status: "error",
				message:
					format === "json"
						? "No items found in that export. Make sure you copied the full WowSims Exporter output."
						: "No item IDs found. Enter IDs separated by commas, e.g. 28825, 29011.",
			};
		}

		const unknownItemIds = new Set<string>();
		const unknownGemIds = new Set<string>();
		const unknownEnchantIds = new Set<string>();
		for (const item of items) {
			if (!knownItemIds.has(item.id)) unknownItemIds.add(item.id);
			for (const gem of item.gems) {
				if (!isEmptySlot(gem) && !knownGemIds.has(gem)) unknownGemIds.add(gem);
			}
			const { enchant } = item;
			if (enchant && !isEmptySlot(enchant) && !knownEnchantIds.has(enchant)) {
				unknownEnchantIds.add(enchant);
			}
		}

		if (unknownItemIds.size || unknownGemIds.size || unknownEnchantIds.size) {
			return {
				status: "warning",
				count: items.length,
				format,
				unknownItemIds: [...unknownItemIds],
				unknownGemIds: [...unknownGemIds],
				unknownEnchantIds: [...unknownEnchantIds],
			};
		}

		return { status: "valid", count: items.length, format };
	} catch {
		return {
			status: "error",
			message:
				"Couldn't read that as a WowSims export. Paste the full JSON, or enter a comma-separated list of item IDs.",
		};
	}
};
