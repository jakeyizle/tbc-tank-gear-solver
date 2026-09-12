// The slug after the id is cosmetic - wowhead resolves item=<id> on its own - so it is derived
// from the display name rather than hand-maintained alongside every consumable.
export const getConsumableWowheadUrl = (id: number, name: string): string =>
	`https://www.wowhead.com/tbc/item=${id}/${name.toLowerCase().replaceAll(" ", "-")}`;

/**
 * Image URL for a wowhead icon slug (e.g. "inv_potion_119").
 *
 * The slug comes off the record itself - `Item.icon` / `Gem.icon`, carried from db.json by
 * src/data/tbcDatabase.ts's adapters, or `ConsumableItem.icon` for the six consumables no
 * database covers. It used to come from a 1.2MB bundled item-tooltips.json scanned linearly per
 * rendered row, which was both dead weight in the bundle and a lookup for something the database
 * already had.
 *
 * Returns undefined when a record carries no icon, so callers render their placeholder rather
 * than requesting ".../undefined.jpg".
 */
export const wowheadIconUrl = (icon: string | undefined): string | undefined =>
	icon
		? `https://wow.zamimg.com/images/wow/icons/large/${icon}.jpg`
		: undefined;
