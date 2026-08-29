// consumable ids in data/consumables.ts are already wowhead-style slugs
// (e.g. "flask-of-blinding-light"), so they double as the URL slug here.
export const getConsumableWowheadUrl = (
	wowheadId: number,
	slug: string,
): string => `https://www.wowhead.com/tbc/item=${wowheadId}/${slug}`;
