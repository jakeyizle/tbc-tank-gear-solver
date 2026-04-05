// 3 data formats

import type { InputItem } from "#/solver/types";

// {gear: items: [...]} or {items: [...]} or list of ids - 123, 456, ...
export const parseItemInput = (input: string) => {
	if (!input.startsWith("{") && !input.startsWith("[")) {
		return input
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean)
			.map((id) => ({ id: id, gems: [] })) as InputItem[];
	}
	const data = JSON.parse(input);
	const items = data.items || data.gear?.items || [];

    const inputItems = items.map((item: { id: string | number; enchant?: string | number; gems: string | number[]; }) => ({
		id: item.id != null ? String(item.id) : "",
		enchant: item.enchant != null ? String(item.enchant) : undefined,
		gems: Array.isArray(item.gems) ? item.gems.map((g) => String(g)) : [],
	}));
	return inputItems; 
};
