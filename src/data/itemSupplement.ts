// The handful of entries the vendored database genuinely does not have.
//
// src/data/items.json (4,513 entries) and enchants.json were deleted in favour of tbc-new's own
// db.json, which covers all but these 30 records - see the coverage assertion in
// src/data/tbcDatabase.test.ts, which is what produced this list. Keeping them means the
// cutover cannot reject a gear string the app used to accept.
//
// Four groups:
//   - the Midsummer/Ahune holiday drops (35494-35514), which postdate the vendored snapshot
//     and are the only genuinely wearable gear here;
//   - vanilla-era leftovers (6360, 9449, 12632, 19808, 20966, 22395, 22736, 23363);
//   - unstatted or NPC-only junk ("Monster - ...", "Nax PH ...", "Tom's Legs", 32482, 32824);
//   - two low-value vanilla enchants (effect ids 849, 851).
//
// CAVEAT: these stats come from the hand-maintained data and therefore still carry its
// conventions - notably HealingPower, which that data stored as the DISPLAYED total (healing +
// spell damage) while the sim splits the two. Nothing here is Protection Paladin gear, so this
// has no effect on solving today, but do not treat these records as sim-accurate.
import type { Enchant, Item } from "#/solver/types";

export const SUPPLEMENT_ITEMS: Item[] = [
	{
		name: "Amulet of Bitter Hatred",
		id: "35507",
		type: "Neck",
		stats: [
			{ name: "Agility", value: 20, type: "flat" },
			{ name: "Stamina", value: 18, type: "flat" },
			{ name: "AttackPower", value: 42, type: "flat" },
			{ name: "MeleeHit", value: 18, type: "flat" },
			{ name: "RangedAttackPower", value: 42, type: "flat" },
		],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Amulet of Glacial Tranquility",
		id: "35509",
		type: "Neck",
		stats: [
			{ name: "Stamina", value: 22, type: "flat" },
			{ name: "Intellect", value: 21, type: "flat" },
			{ name: "SpellPower", value: 16, type: "flat" },
			{ name: "HealingPower", value: 64, type: "flat" },
			{ name: "MP5", value: 4, type: "flat" },
		],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Andonisus, Reaper of Souls",
		id: "22736",
		type: "Weapon",
		handType: "MainHand",
		weaponType: "Sword",
		stats: [],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Choker of the Arctic Flow",
		id: "35508",
		type: "Neck",
		stats: [
			{ name: "Stamina", value: 24, type: "flat" },
			{ name: "Intellect", value: 22, type: "flat" },
			{ name: "SpellPower", value: 28, type: "flat" },
			{ name: "HealingPower", value: 28, type: "flat" },
		],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Cloak of the Frigid Winds",
		id: "35497",
		type: "Back",
		stats: [
			{ name: "Stamina", value: 18, type: "flat" },
			{ name: "Intellect", value: 16, type: "flat" },
			{ name: "SpellPower", value: 21, type: "flat" },
			{ name: "HealingPower", value: 21, type: "flat" },
			{ name: "SpellCrit", value: 22, type: "flat" },
			{ name: "Armor", value: 93, type: "flat" },
		],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Frostscythe of Lord Ahune",
		id: "35514",
		type: "Weapon",
		handType: "TwoHand",
		weaponType: "Staff",
		stats: [
			{ name: "Stamina", value: 40, type: "flat" },
			{ name: "Intellect", value: 35, type: "flat" },
			{ name: "SpellPower", value: 176, type: "flat" },
			{ name: "HealingPower", value: 176, type: "flat" },
			{ name: "MP5", value: 13, type: "flat" },
			{ name: "SpellCrit", value: 33, type: "flat" },
		],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Hailstone Pendant",
		id: "35511",
		type: "Neck",
		stats: [
			{ name: "Stamina", value: 33, type: "flat" },
			{ name: "MeleeHit", value: 19, type: "flat" },
			{ name: "Defense", value: 22, type: "flat" },
		],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Icebound Cloak",
		id: "35496",
		type: "Back",
		stats: [
			{ name: "Stamina", value: 30, type: "flat" },
			{ name: "Armor", value: 267, type: "flat" },
			{ name: "Defense", value: 25, type: "flat" },
		],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Jade Pendant of Blasting",
		id: "20966",
		type: "Neck",
		stats: [
			{ name: "Intellect", value: 3, type: "flat" },
			{ name: "SpellPower", value: 8, type: "flat" },
			{ name: "HealingPower", value: 8, type: "flat" },
		],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Manual Crowd Pummeler",
		id: "9449",
		type: "Weapon",
		handType: "TwoHand",
		weaponType: "Mace",
		stats: [
			{ name: "Strength", value: 16, type: "flat" },
			{ name: "Agility", value: 5, type: "flat" },
		],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Monster - Staff, Blooming Druid Staff",
		id: "29748",
		type: "Weapon",
		handType: "TwoHand",
		weaponType: "Staff",
		stats: [
			{ name: "Strength", value: 34, type: "flat" },
			{ name: "Agility", value: 32, type: "flat" },
			{ name: "Stamina", value: 33, type: "flat" },
			{ name: "MeleeHit", value: 22, type: "flat" },
			{ name: "FeralAttackPower", value: 423, type: "flat" },
		],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Monster - Sword, Iblis, Blade of the Fallen Seraph",
		id: "28087",
		type: "Weapon",
		handType: "OneHand",
		weaponType: "Sword",
		stats: [],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Nax PH Crit Plate Shoulders",
		id: "23034",
		type: "Shoulder",
		stats: [
			{ name: "Strength", value: 33, type: "flat" },
			{ name: "Stamina", value: 18, type: "flat" },
			{ name: "MeleeCrit", value: 14, type: "flat" },
			{ name: "Armor", value: 797, type: "flat" },
		],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Rockhide Strongfish",
		id: "19808",
		type: "Weapon",
		handType: "OneHand",
		weaponType: "Mace",
		stats: [{ name: "Stamina", value: 8, type: "flat" }],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Shroud of Winter's Chill",
		id: "35494",
		type: "Back",
		stats: [
			{ name: "Stamina", value: 16, type: "flat" },
			{ name: "Intellect", value: 17, type: "flat" },
			{ name: "SpellPower", value: 16, type: "flat" },
			{ name: "HealingPower", value: 62, type: "flat" },
			{ name: "MP5", value: 8, type: "flat" },
			{ name: "Armor", value: 93, type: "flat" },
		],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Steelscale Crushfish",
		id: "6360",
		type: "Weapon",
		handType: "OneHand",
		weaponType: "Mace",
		stats: [{ name: "Strength", value: 4, type: "flat" }],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Storm Gauntlets",
		id: "12632",
		type: "Hands",
		stats: [
			{ name: "Intellect", value: 7, type: "flat" },
			{ name: "NatureSpellPower", value: 21, type: "flat" },
			{ name: "Armor", value: 218, type: "flat" },
			{ name: "FireResistance", value: 10, type: "flat" },
		],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "The Frost Lord's War Cloak",
		id: "35495",
		type: "Back",
		stats: [
			{ name: "Agility", value: 23, type: "flat" },
			{ name: "Stamina", value: 22, type: "flat" },
			{ name: "AttackPower", value: 48, type: "flat" },
			{ name: "Armor", value: 93, type: "flat" },
			{ name: "RangedAttackPower", value: 48, type: "flat" },
		],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Titanic Breastplate",
		id: "23363",
		type: "Chest",
		stats: [
			{ name: "Strength", value: 15, type: "flat" },
			{ name: "Stamina", value: 15, type: "flat" },
			{ name: "MeleeCrit", value: 14, type: "flat" },
			{ name: "Armor", value: 1148, type: "flat" },
			{ name: "Defense", value: 15, type: "flat" },
			{ name: "ArcaneResistance", value: 10, type: "flat" },
			{ name: "NatureResistance", value: 10, type: "flat" },
		],
		sockets: [{ color: "Meta" }, { color: "Meta" }, { color: "Meta" }],
		socketBonus: [],
	},
	{
		name: "Tom's Legs 1",
		id: "32417",
		type: "Legs",
		stats: [
			{ name: "Strength", value: 41, type: "flat" },
			{ name: "Stamina", value: 60, type: "flat" },
			{ name: "MeleeHit", value: 20, type: "flat" },
			{ name: "MeleeCrit", value: 31, type: "flat" },
			{ name: "Armor", value: 1269, type: "flat" },
		],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Tom's Legs 2",
		id: "32418",
		type: "Legs",
		stats: [
			{ name: "Strength", value: 46, type: "flat" },
			{ name: "Stamina", value: 69, type: "flat" },
			{ name: "MeleeHit", value: 23, type: "flat" },
			{ name: "MeleeCrit", value: 35, type: "flat" },
			{ name: "Armor", value: 1428, type: "flat" },
		],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Tom's Legs 3",
		id: "32419",
		type: "Legs",
		stats: [
			{ name: "Strength", value: 54, type: "flat" },
			{ name: "Stamina", value: 79, type: "flat" },
			{ name: "MeleeHit", value: 26, type: "flat" },
			{ name: "MeleeCrit", value: 41, type: "flat" },
			{ name: "Armor", value: 1587, type: "flat" },
		],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Tom's Legs A",
		id: "32414",
		type: "Legs",
		stats: [
			{ name: "Strength", value: 37, type: "flat" },
			{ name: "Stamina", value: 54, type: "flat" },
			{ name: "MeleeHit", value: 18, type: "flat" },
			{ name: "MeleeCrit", value: 29, type: "flat" },
			{ name: "Armor", value: 1163, type: "flat" },
		],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Tom's Legs B",
		id: "32415",
		type: "Legs",
		stats: [
			{ name: "Strength", value: 40, type: "flat" },
			{ name: "Stamina", value: 58, type: "flat" },
			{ name: "MeleeHit", value: 19, type: "flat" },
			{ name: "MeleeCrit", value: 30, type: "flat" },
			{ name: "Armor", value: 1322, type: "flat" },
		],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Tom's Legs C",
		id: "32416",
		type: "Legs",
		stats: [
			{ name: "Strength", value: 45, type: "flat" },
			{ name: "Stamina", value: 66, type: "flat" },
			{ name: "MeleeHit", value: 22, type: "flat" },
			{ name: "MeleeCrit", value: 35, type: "flat" },
			{ name: "Armor", value: 1512, type: "flat" },
		],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Totem of Rage",
		id: "22395",
		type: "Ranged",
		weaponType: "Totem",
		stats: [],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Touch of Victory",
		id: "32482",
		type: "Ranged",
		weaponType: "Wand",
		stats: [
			{ name: "Stamina", value: 18, type: "flat" },
			{ name: "Intellect", value: 13, type: "flat" },
			{ name: "SpellPower", value: 14, type: "flat" },
			{ name: "HealingPower", value: 14, type: "flat" },
			{ name: "Resilience", value: 12, type: "flat" },
		],
		sockets: [],
		socketBonus: [],
	},
	{
		name: "Trashbringer",
		id: "32824",
		type: "Weapon",
		handType: "TwoHand",
		weaponType: "Sword",
		stats: [],
		sockets: [],
		socketBonus: [],
	},
];

export const SUPPLEMENT_ENCHANTS: Enchant[] = [
	{
		name: "Enchant Boots - Spirit",
		id: "20024",
		effectID: "851",
		type: "Feet",
		stats: [{ name: "Spirit", value: 5, type: "flat" }],
		isSpellID: "true",
	},
	{
		name: "Enchant Cloak - Lesser Agility",
		id: "13882",
		effectID: "849",
		type: "Back",
		stats: [{ name: "Agility", value: 3, type: "flat" }],
		isSpellID: "true",
	},
];

/**
 * Class restrictions the adapter cannot derive, keyed by enchant effectId.
 *
 * `toEnchant` reads an enchant's class allowlist off the ITEM that applies it, but 126 of
 * db.json's 143 enchants name an item the equipment table does not contain (enchanting scrolls
 * are not equipment). That is correct for a scroll, which has no class restriction - it matters
 * only for the rare enchant that IS a directly-equipped item with a "Classes:" line on its
 * tooltip. Presence of Might (effect 2583, item 19782, Warrior-only head enchant) is the one
 * such case in TBC; verified against tbc.wowhead.com, and previously carried by hand in
 * enchants.json.
 */
export const SUPPLEMENT_ENCHANT_CLASSES: Record<string, string[]> = {
	"2583": ["1"],
};
