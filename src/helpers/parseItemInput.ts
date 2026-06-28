// Supported input formats:
//   1. WowSims Exporter JSON: { gear: { items: [...] } }
//   2. WowSims Exporter JSON: { items: [...] }
//   3. Legacy comma-separated list of item IDs: 123, 456, ...

import type { InputItem } from "#/solver/types";

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

export type ItemInputAnalysis =
	| { status: "empty" }
	| { status: "valid"; count: number; format: "json" | "ids" }
	| { status: "error"; message: string };

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
		return { status: "valid", count: items.length, format };
	} catch {
		return {
			status: "error",
			message:
				"Couldn't read that as a WowSims export. Paste the full JSON, or enter a comma-separated list of item IDs.",
		};
	}
};
