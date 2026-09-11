// Adapts tbc-new's own committed item/gem/enchant database (vendor/tbc-sim/assets/database/db.json,
// staged to public/sim/db.json by scripts/sim/buildWasm.mjs) into this repo's solver domain types.
//
// This module is the intended replacement for the hand-maintained src/data/items.json,
// gems.json and enchants.json, which have no generator and drift from the sim continuously.
// It imports only *types* from #/solver/types (erased at build time), so it introduces no
// runtime dependency on src/solver/ or src/sim/ and is safe to load from either side.
import { perfTrace } from "#/helpers/perfTrace";
import type { Enchant, Gem, Item, Stat, StatName } from "#/solver/types";

// db.json encodes stats two different ways, and conflating them fails silently:
//   - item stats are a SPARSE map at scalingOptions["0"].stats, keyed by stat index
//   - gem / enchant / consumable stats are a DENSE 42-element array
// Both index into the same enum: sim/core/stats/stats.go:21-63, kept 1:1 with
// proto.Stat in vendor/tbc-sim/proto/common.proto.
export const STAT_INDEX_TO_NAME: readonly (StatName | null)[] = [
	"Strength", // 0
	"Agility", // 1
	"Stamina", // 2
	"Intellect", // 3
	"HealingPower", // 4
	"SpellPower", // 5  (sim: SpellDamage)
	"ArcaneSpellPower", // 6
	"FireSpellPower", // 7
	"FrostSpellPower", // 8
	"HolySpellPower", // 9
	"NatureSpellPower", // 10
	"ShadowSpellPower", // 11
	"SpellHit", // 12
	"SpellCrit", // 13
	"SpellHaste", // 14
	"SpellPenetration", // 15
	"Spirit", // 16
	"AttackPower", // 17
	"RangedAttackPower", // 18
	"FeralAttackPower", // 19
	"MeleeHit", // 20
	"MeleeCrit", // 21
	"MeleeHaste", // 22
	"ArmorPenetration", // 23
	"Expertise", // 24
	"Defense", // 25 (sim: DefenseRating)
	"Block", // 26 (sim: BlockRating)
	"BlockValue", // 27
	"Dodge", // 28 (sim: DodgeRating)
	"Parry", // 29 (sim: ParryRating)
	"Resilience", // 30
	"Armor", // 31
	// Kept distinct from Armor rather than summed into it (which is what the hand-maintained
	// items.json did for all 588 items carrying it): the sim reports the two separately and a
	// stat weight on one must not be applied to the other, so they get separate LP
	// coefficients. (Measured: in THIS sim both end up riding the same Toughness multiplier,
	// because paladin/talents.go:468 multiplies stats.Armor rather than item armor - see
	// src/sim/deriveLinearModel.test.ts, which pins that.)
	"BonusArmor", // 32
	"Health", // 33
	"Mana", // 34
	"MP5", // 35
	"ArcaneResistance", // 36
	"FireResistance", // 37
	"FrostResistance", // 38
	"NatureResistance", // 39
	"ShadowResistance", // 40
	null, // 41 PhysicalDamage - no StatName counterpart
];

// proto.ItemType (common.proto:312-328), indexed by enum value.
const ITEM_TYPE_BY_INDEX = [
	null,
	"Head",
	"Neck",
	"Shoulder",
	"Back",
	"Chest",
	"Wrist",
	"Hands",
	"Waist",
	"Legs",
	"Feet",
	"Finger",
	"Trinket",
	"Weapon",
	"Ranged",
] as const;

// proto.GemColor (common.proto:404-414), indexed by enum value.
const GEM_COLOR_BY_INDEX = [
	null,
	"Meta",
	"Red",
	"Blue",
	"Yellow",
	"Green",
	"Orange",
	"Purple",
	// Prismatic (8) - the two all-resistance spheres. Sockets are never prismatic, only gems.
	"Prismatic",
] as const;

// proto.HandType (common.proto:351-357), indexed by enum value.
const HAND_TYPE_BY_INDEX = [
	null,
	"MainHand",
	"OneHand",
	"OffHand",
	"TwoHand",
] as const;

// proto.WeaponType (common.proto:338-349), indexed by enum value.
const WEAPON_TYPE_BY_INDEX = [
	null,
	"Axe",
	"Dagger",
	"Fist",
	"Mace",
	"OffHand",
	"Polearm",
	"Shield",
	"Staff",
	"Sword",
] as const;

// proto.EnchantType (common.proto:760-767). Only the two this repo models are mapped;
// Kit/Staff/OffHand collapse to undefined (plain enchant).
const ENCHANT_TYPE_BY_INDEX: readonly ("TwoHand" | "Shield" | undefined)[] = [
	undefined,
	"TwoHand",
	"Shield",
];

// proto.Profession (common.proto:113-126). This repo only models the two professions that
// actually gate gear choices in TBC; everything else maps to undefined.
const PROFESSION_BY_INDEX: readonly (
	| "Enchanting"
	| "Jewelcrafting"
	| undefined
)[] = [
	undefined,
	undefined, // Alchemy
	undefined, // Blacksmithing
	"Enchanting", // 3
	undefined, // Engineering
	undefined, // Herbalism
	undefined, // Inscription
	"Jewelcrafting", // 7
];

/**
 * Exposed solely so mechanicsEnums.test.ts can assert these hand-transcribed tables still
 * agree with the generated protobuf enums. Not part of the module's real API.
 */
export const __enumTablesForTest = {
	itemTypes: ITEM_TYPE_BY_INDEX,
	gemColors: GEM_COLOR_BY_INDEX,
	handTypes: HAND_TYPE_BY_INDEX,
	weaponTypes: WEAPON_TYPE_BY_INDEX,
	enchantTypes: ENCHANT_TYPE_BY_INDEX,
	professions: PROFESSION_BY_INDEX,
} as const;

export interface RawDbItem {
	id: number;
	name: string;
	type: number;
	weaponType?: number;
	handType?: number;
	gemSockets?: number[];
	socketBonus?: number[];
	scalingOptions?: Record<string, { stats?: Record<string, number> }>;
	unique?: boolean;
	classAllowlist?: number[];
	requiredProfession?: number;
	phase?: number;
}

export interface RawDbGem {
	id: number;
	name: string;
	color: number;
	stats?: number[];
	phase?: number;
	unique?: boolean;
	requiredProfession?: number;
}

export interface RawDbEnchant {
	effectId: number;
	itemId?: number;
	spellId?: number;
	name: string;
	type: number;
	enchantType?: number;
	extraTypes?: number[];
	stats?: number[];
	requiredProfession?: number;
}

export interface RawTbcDatabase {
	items: RawDbItem[];
	gems: RawDbGem[];
	enchants: RawDbEnchant[];
	consumables: { id: number; name: string; type: number; stats?: number[] }[];
}

function statsFromDense(dense: number[] | undefined): Stat[] {
	if (!dense) return [];
	const stats: Stat[] = [];
	for (let index = 0; index < dense.length; index++) {
		const value = dense[index];
		if (!value) continue;
		const name = STAT_INDEX_TO_NAME[index];
		if (name) stats.push({ name, value, type: "flat" });
	}
	return stats;
}

function statsFromSparse(sparse: Record<string, number> | undefined): Stat[] {
	if (!sparse) return [];
	const stats: Stat[] = [];
	for (const [index, value] of Object.entries(sparse)) {
		if (!value) continue;
		const name = STAT_INDEX_TO_NAME[Number(index)];
		if (name) stats.push({ name, value, type: "flat" });
	}
	return stats;
}

export function toItem(raw: RawDbItem): Item | null {
	const type = ITEM_TYPE_BY_INDEX[raw.type];
	if (!type) return null;

	// Only the four socket colours exist on items; the compound gem colours (Orange, Purple,
	// Green, Prismatic) describe gems only, never a socket.
	const sockets = (raw.gemSockets ?? []).flatMap((color) => {
		const mapped = GEM_COLOR_BY_INDEX[color];
		return mapped === "Red" ||
			mapped === "Blue" ||
			mapped === "Yellow" ||
			mapped === "Meta"
			? [{ color: mapped }]
			: [];
	});

	return {
		name: raw.name,
		id: String(raw.id),
		type,
		...(raw.handType && HAND_TYPE_BY_INDEX[raw.handType]
			? {
					handType: HAND_TYPE_BY_INDEX[raw.handType] as NonNullable<
						Item["handType"]
					>,
				}
			: {}),
		...(raw.weaponType && WEAPON_TYPE_BY_INDEX[raw.weaponType]
			? { weaponType: WEAPON_TYPE_BY_INDEX[raw.weaponType] as string }
			: {}),
		stats: statsFromSparse(raw.scalingOptions?.["0"]?.stats),
		sockets,
		socketBonus: statsFromDense(raw.socketBonus),
	};
}

export function toGem(raw: RawDbGem): Gem | null {
	const color = GEM_COLOR_BY_INDEX[raw.color];
	if (!color) return null;

	const profession = PROFESSION_BY_INDEX[raw.requiredProfession ?? 0];

	return {
		name: raw.name,
		id: String(raw.id),
		color,
		phase: String(raw.phase ?? 1),
		stats: statsFromDense(raw.stats),
		...(raw.unique ? { isUnique: "true" } : {}),
		...(profession ? { profession } : {}),
	};
}

/**
 * `itemsById` is required because an enchant's class restriction is not stored on the
 * enchant record - it lives on the *item* that teaches/applies it (e.g. Presence of Might
 * is Warrior-only via items[19782].classAllowlist).
 */
export function toEnchant(
	raw: RawDbEnchant,
	itemsById: Map<number, RawDbItem>,
): Enchant | null {
	const type = ITEM_TYPE_BY_INDEX[raw.type];
	if (!type) return null;

	const enchantType = ENCHANT_TYPE_BY_INDEX[raw.enchantType ?? 0];
	const profession = PROFESSION_BY_INDEX[raw.requiredProfession ?? 0];
	const classAllowlist = raw.itemId
		? itemsById.get(raw.itemId)?.classAllowlist
		: undefined;

	// The hand-maintained data used the enchant's item id where one exists and fell back to
	// the spell id otherwise, flagging the latter so the UI builds a wowhead /spell= URL.
	const usesSpellId = !raw.itemId && raw.spellId != null;

	return {
		name: raw.name,
		id: String(raw.itemId ?? raw.spellId ?? raw.effectId),
		effectID: String(raw.effectId),
		type,
		...(enchantType ? { enchantType } : {}),
		stats: statsFromDense(raw.stats),
		...(usesSpellId ? { isSpellID: "true" } : {}),
		...(profession ? { profession } : {}),
		...(classAllowlist?.length ? { classes: classAllowlist.map(String) } : {}),
	};
}

export interface TbcDomainDatabase {
	items: Item[];
	gems: Gem[];
	enchants: Enchant[];
	raw: RawTbcDatabase;
}

export function adaptDatabase(raw: RawTbcDatabase): TbcDomainDatabase {
	const itemsById = new Map(raw.items.map((item) => [item.id, item]));
	return {
		items: raw.items.flatMap((item) => toItem(item) ?? []),
		gems: raw.gems.flatMap((gem) => toGem(gem) ?? []),
		enchants: raw.enchants.flatMap(
			(enchant) => toEnchant(enchant, itemsById) ?? [],
		),
		raw,
	};
}

let rawPromise: Promise<RawTbcDatabase> | undefined;

/**
 * Lazily fetches and caches public/sim/db.json. Single module-level promise, so every
 * caller (sim request building and, from Phase 3, the solver's item pool) shares one fetch.
 */
export function loadRawTbcDatabase(): Promise<RawTbcDatabase> {
	if (!rawPromise) {
		rawPromise = perfTrace.timeAsync("loadTbcDatabase", () =>
			fetch("/sim/db.json").then((res) => res.json()),
		);
	}
	return rawPromise;
}

let domainPromise: Promise<TbcDomainDatabase> | undefined;

export function loadTbcDomainDatabase(): Promise<TbcDomainDatabase> {
	if (!domainPromise) {
		domainPromise = loadRawTbcDatabase().then(adaptDatabase);
	}
	return domainPromise;
}
