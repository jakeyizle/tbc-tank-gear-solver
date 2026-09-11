// consumable ids in data/consumables.ts are already wowhead-style slugs
// (e.g. "flask-of-blinding-light"), so they double as the URL slug here.
// The slug after the id is cosmetic - wowhead resolves item=<id> on its own - so it is derived
// from the display name rather than hand-maintained alongside every consumable.
export const getConsumableWowheadUrl = (id: number, name: string): string =>
	`https://www.wowhead.com/tbc/item=${id}/${name.toLowerCase().replaceAll(" ", "-")}`;
