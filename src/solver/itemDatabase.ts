// The item/gem/enchant pool the solver draws from, indexed for lookup.
//
// Replaces the three hand-maintained JSON blobs src/solver/items.ts used to import directly
// (items.json alone was 3.4MB and 4,513 entries with no generator). The records now come from
// tbc-new's own db.json via src/data/tbcDatabase.ts's adapters, plus the ~30 entries that
// database genuinely lacks (src/data/itemSupplement.ts).
//
// Passing this in rather than importing it is what lets the data be FETCHED: db.json is already
// downloaded at runtime for the sim, so the solver reusing it costs nothing and removes 4.7MB
// from the bundle. It also means an item the app has never heard of - anything added to the
// vendored database later - is accepted without a code change.
import {
	SUPPLEMENT_ENCHANT_CLASSES,
	SUPPLEMENT_ENCHANTS,
	SUPPLEMENT_ITEMS,
} from "#/data/itemSupplement";
import type { TbcDomainDatabase } from "#/data/tbcDatabase";
import { overrideItem } from "./itemOverride";
import type { Enchant, Gem, Item } from "./types";

function appendMissing<T>(
	base: T[],
	extra: T[],
	key: (value: T) => string,
): T[] {
	const seen = new Set(base.map(key));
	return [...base, ...extra.filter((value) => !seen.has(key(value)))];
}

export interface SolverItemDatabase {
	items: Item[];
	gems: Gem[];
	enchants: Enchant[];
	itemsById: Map<string, Item>;
	gemsById: Map<string, Gem>;
	/** Keyed by the enchant's item id (or spell id where it has no item). */
	enchantsById: Map<string, Enchant>;
	/**
	 * Keyed by effectId. Five effectIds are shared by two enchants that differ only by slot
	 * (2649 is both "Bracer - Fortitude" and "Boots - Fortitude"), so this map keeps the FIRST
	 * and is only a fallback for exports that name an effect rather than an item - the same
	 * behaviour the hand data had, where `Enchants.find` returned the first match too.
	 */
	enchantsByEffectId: Map<string, Enchant>;
}

/**
 * Builds the lookup indexes once per solve.
 *
 * `overrideItem` is applied here rather than per lookup (where it used to live): the overrides
 * are static corrections keyed on item name, so applying them at index time is the same result
 * for less work, and it guarantees nothing can read an un-overridden record by accident.
 */
export function indexItemDatabase(
	source: Pick<TbcDomainDatabase, "items" | "gems" | "enchants">,
): SolverItemDatabase {
	// Supplement entries are appended only when the database does not already carry the id.
	// The lookup maps below would dedupe on their own, but the ARRAYS feed candidate generation
	// (see items.ts's getEnchants/getGems), and a duplicate there becomes two LP variables with
	// the same name - which GLPK rejects outright ("duplicate indices not allowed"). Silently
	// preferring the database's own record is also the right call on the merits: it is the
	// sim-accurate one.
	const items = appendMissing(source.items, SUPPLEMENT_ITEMS, (i) => i.id).map(
		overrideItem,
	);
	const gems = source.gems;
	const enchants = appendMissing(
		source.enchants,
		SUPPLEMENT_ENCHANTS,
		(e) => e.effectID,
	).map((enchant) => {
		const classes = SUPPLEMENT_ENCHANT_CLASSES[enchant.effectID];
		return classes && !enchant.classes ? { ...enchant, classes } : enchant;
	});

	const itemsById = new Map<string, Item>();
	for (const item of items) itemsById.set(item.id, item);

	const gemsById = new Map<string, Gem>();
	for (const gem of gems) gemsById.set(gem.id, gem);

	const enchantsById = new Map<string, Enchant>();
	const enchantsByEffectId = new Map<string, Enchant>();
	for (const enchant of enchants) {
		if (!enchantsById.has(enchant.id)) enchantsById.set(enchant.id, enchant);
		if (!enchantsByEffectId.has(enchant.effectID)) {
			enchantsByEffectId.set(enchant.effectID, enchant);
		}
	}

	return {
		items,
		gems,
		enchants,
		itemsById,
		gemsById,
		enchantsById,
		enchantsByEffectId,
	};
}
