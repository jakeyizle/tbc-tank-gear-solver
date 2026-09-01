// Builds a minimal proto.SimDatabase (JSON form) for a gear set, by filtering tbc-new's own
// committed item/gem/enchant database down to just the records a request needs.
//
// tbc-new's WASM sim ships with no built-in item database (the `with_db` build tag that
// loads assets/database/db.bin is not set for the wasm target) — every StatWeightsRequest
// must carry its own proto.SimDatabase with the item/gem/enchant records for everything in
// Player.equipment. vendor/tbc-sim/assets/database/db.json is a git-tracked dump of the
// *entire* database already in protobuf-ts JSON shape (UIItem/UIGem/UIEnchant — a superset
// of SimItem/SimGem/SimEnchant with a few extra UI-only fields), so building a minimal
// SimDatabase is a filter-by-id + drop-UI-fields operation, not a data pipeline of our own.
//
// See docs/plans/sim-backed-objectives.md for the full design rationale.

export interface GearItemRef {
	id: number;
	enchant?: number;
	gems?: number[];
}

interface UiDatabase {
	items: Record<string, unknown>[];
	enchants: Record<string, unknown>[];
	gems: Record<string, unknown>[];
}

const UI_ONLY_FIELDS = ["icon", "phase", "quality"] as const;

function stripUiOnlyFields(
	record: Record<string, unknown>,
): Record<string, unknown> {
	const stripped = { ...record };
	for (const field of UI_ONLY_FIELDS) delete stripped[field];
	return stripped;
}

/**
 * Filters `db` (parsed vendor/tbc-sim/assets/database/db.json) down to the items, gems, and
 * enchants referenced by `gear`, returning a proto.SimDatabase-shaped plain object suitable
 * for `SimDatabase.fromJson()`.
 *
 * An item's `enchant` field is matched against the enchant record's `effectId` — the only
 * field it actually references (spot-checked against every enchant in the P1-P5 Protection
 * Paladin gear presets: each one's `enchant` id equals exactly one enchant's `effectId`,
 * while that same enchant's separate `itemId`/`spellId` are unrelated numbers). Matching
 * against `itemId`/`spellId` as well, as an earlier draft of this function did, risks a
 * false-positive match against an unrelated enchant whose itemId/spellId happens to equal
 * this one's effectId.
 */
export function buildSimDatabase(
	db: UiDatabase,
	gear: GearItemRef[],
): { items: unknown[]; enchants: unknown[]; gems: unknown[] } {
	const itemIds = new Set(gear.map((item) => item.id));
	const enchantEffectIds = new Set(
		gear.map((item) => item.enchant).filter((id): id is number => id != null),
	);
	const gemIds = new Set(gear.flatMap((item) => item.gems ?? []));

	return {
		items: db.items
			.filter((item) => itemIds.has(item.id as number))
			.map(stripUiOnlyFields),
		enchants: db.enchants
			.filter((enchant) => enchantEffectIds.has(enchant.effectId as number))
			.map(stripUiOnlyFields),
		gems: db.gems
			.filter((gem) => gemIds.has(gem.id as number))
			.map(stripUiOnlyFields),
	};
}
