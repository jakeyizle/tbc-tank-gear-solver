// Supported input: WowSims Exporter JSON, either the full character export
// ({ class, race, talents, gear: { items: [...] }, ... }) or just an item pool
// ({ items: [...] }).

import { CLASS_NAME_TO_ID } from "#/data/classes";
import Enchants from "#/data/enchants.json";
import Gems from "#/data/gems.json";
import Items from "#/data/items.json";
import { RACE_NAME_TO_ID } from "#/data/races";
import { parseTalentsString } from "#/data/talents";
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

// Character info pulled out of a full WowSims character export - present only for
// the "gear.items" export shape, not the bare "{items:[...]}" pool shape.
export interface DetectedCharacter {
	name?: string;
	className?: string;
	classId?: string;
	raceName?: string;
	raceId?: string;
	spec?: string;
	talentRanks: Record<string, number>;
	// false when the export's class doesn't resolve to a class/spec this app models
	// (currently Protection Paladin only) - class/race/talents shouldn't be applied.
	supported: boolean;
}

export const parseCharacterExport = (
	input: string,
): DetectedCharacter | null => {
	const trimmed = input.trim();
	if (!looksLikeJson(trimmed)) return null;

	let data: Record<string, unknown>;
	try {
		data = JSON.parse(trimmed);
	} catch {
		return null;
	}

	const className = typeof data.class === "string" ? data.class : undefined;
	const raceName = typeof data.race === "string" ? data.race : undefined;
	const talentsStr =
		typeof data.talents === "string" ? data.talents : undefined;
	if (!className && !raceName && !talentsStr) return null;

	const normalize = (name: string) => name.toLowerCase().replaceAll(" ", "");
	const classId = className
		? CLASS_NAME_TO_ID[normalize(className)]
		: undefined;
	const raceId = raceName ? RACE_NAME_TO_ID[normalize(raceName)] : undefined;
	const talentRanks =
		classId && talentsStr ? parseTalentsString(classId, talentsStr) : {};

	return {
		name: typeof data.name === "string" ? data.name : undefined,
		className,
		classId,
		raceName,
		raceId,
		spec: typeof data.spec === "string" ? data.spec : undefined,
		talentRanks,
		supported: classId != null,
	};
};

type ItemInputAnalysis =
	| { status: "empty" }
	| { status: "valid"; count: number; character: DetectedCharacter | null }
	| {
			status: "warning";
			count: number;
			character: DetectedCharacter | null;
			unknownItemIds: string[];
			unknownGemIds: string[];
			unknownEnchantIds: string[];
	  }
	| { status: "error"; message: string };

const INVALID_EXPORT_MESSAGE =
	"Couldn't read that as a WowSims export. Paste the full JSON from the WowSims Exporter addon.";

// An id of "0" (or empty) conventionally means "no gem"/"no enchant" in a
// WowSims export, not an unknown id.
const isEmptySlot = (id: string | undefined) => !id || id === "0";

// Non-throwing analysis used to give the user live feedback as they type/paste.
export const analyzeItemInput = (input: string): ItemInputAnalysis => {
	const trimmed = input.trim();
	if (!trimmed) return { status: "empty" };

	if (!looksLikeJson(trimmed)) {
		return { status: "error", message: INVALID_EXPORT_MESSAGE };
	}

	try {
		const items = parseItemInput(trimmed);
		if (items.length === 0) {
			return {
				status: "error",
				message:
					"No items found in that export. Make sure you copied the full WowSims Exporter output.",
			};
		}

		const character = parseCharacterExport(trimmed);

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
				character,
				unknownItemIds: [...unknownItemIds],
				unknownGemIds: [...unknownGemIds],
				unknownEnchantIds: [...unknownEnchantIds],
			};
		}

		return { status: "valid", count: items.length, character };
	} catch {
		return { status: "error", message: INVALID_EXPORT_MESSAGE };
	}
};
