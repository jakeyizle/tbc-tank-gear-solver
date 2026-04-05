export interface Item {
	name: string;
	id: string;
	type: ItemType;
	handType?: HandType;
	weaponType?: string;
	stats: Stat[];
	sockets: Socket[];
	socketBonus: Stat[];
}

export interface ItemVariation extends Item {
	enchant: Enchant;
	gems: Gem[];
	uniqueId: string;
}

export interface LPItem extends Omit<ItemVariation, "type"> {
	type: ProcessedItemType;
	avoidanceScore: number;
	objectiveScore: number;
    uncritabilityScore: number;
}

export interface Stat {
	name: StatName;
	value: number;
}

export interface Socket {
	color: "Blue" | "Red" | "Yellow" | "Meta";
}

export const STAT_NAMES = [
  "Strength",
  "Agility",
  "Stamina",
  "Intellect",
  "SpellPower",
  "HealingPower",
  "SpellCrit",
  "Armor",
  "Resilience",
  "Defense",
  "AttackPower",
  "RangedAttackPower",
  "SpellHaste",
  "MeleeCrit",
  "MeleeHit",
  "Dodge",
  "MP5",
  "Spirit",
  "BlockValue",
  "MeleeHaste",
  "SpellHit",
  "ShadowResistance",
  "FireResistance",
  "ShadowSpellPower",
  "ArmorPenetration",
  "Parry",
  "Block",
  "ArcaneSpellPower",
  "SpellPenetration",
  "ArcaneResistance",
  "FeralAttackPower",
  "Expertise",
  "FrostSpellPower",
  "NatureSpellPower",
  "FrostResistance",
  "NatureResistance",
  "HolySpellPower",
  "FireSpellPower",
] as const;

export type StatName = typeof STAT_NAMES[number];

// TODO make item types not dumb
export type ItemType =
	| "Head"
	| "Neck"
	| "Shoulder"
	| "Back"
	| "Chest"
	| "Wrist"
	| "Hands"
	| "Waist"
	| "Legs"
	| "Feet"
	| "Finger"
	| "Trinket"
	| "Weapon"
	| "Ranged";

export type ProcessedItemType =
	| "Head"
	| "Neck"
	| "Shoulder"
	| "Back"
	| "Chest"
	| "Wrist"
	| "Hands"
	| "Waist"
	| "Legs"
	| "Feet"
	| "Finger"
	| "Trinket"
	| "Weapon"
	| "Ranged"
	| "Shield";

type HandType = "TwoHand" | "OneHand" | "OffHand" | "MainHand";

export interface Enchant {
	name: string;
	id: string;
	effectID: string;
	type: ItemType;
	enchantType?: "Shield" | "TwoHand";
	stats: Stat[];
}

export interface Gem {
	name: string;
	id: string;
	color: "Red" | "Blue" | "Yellow" | "Orange" | "Purple" | "Green" | "Meta";
	phase: string;
	stats: Stat[];
	isUnique?: string;
}

export interface InputItem {
	id: string;
	gems: string[];
	enchant?: string;
}
