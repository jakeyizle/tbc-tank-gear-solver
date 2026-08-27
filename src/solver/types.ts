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
	locked: boolean;
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
	type: 'flat' | 'multiplier';
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
  "Health",
  "Mana",
  "Miss",
] as const;

export type StatName = typeof STAT_NAMES[number];

// Human-friendly display labels for stats. Keep in sync with STAT_NAMES.
export const STAT_LABELS: Record<StatName, string> = {
	Strength: "Strength",
	Agility: "Agility",
	Stamina: "Stamina",
	Intellect: "Intellect",
	SpellPower: "Spell Power",
	HealingPower: "Healing Power",
	SpellCrit: "Spell Crit",
	Armor: "Armor",
	Resilience: "Resilience",
	Defense: "Defense Rating",
	AttackPower: "Attack Power",
	RangedAttackPower: "Ranged Attack Power",
	SpellHaste: "Spell Haste",
	MeleeCrit: "Melee Crit",
	MeleeHit: "Melee Hit",
	Dodge: "Dodge",
	MP5: "MP5",
	Spirit: "Spirit",
	BlockValue: "Block Value",
	MeleeHaste: "Melee Haste",
	SpellHit: "Spell Hit",
	ShadowResistance: "Shadow Resistance",
	FireResistance: "Fire Resistance",
	ShadowSpellPower: "Shadow Spell Power",
	ArmorPenetration: "Armor Penetration",
	Parry: "Parry",
	Block: "Block",
	ArcaneSpellPower: "Arcane Spell Power",
	SpellPenetration: "Spell Penetration",
	ArcaneResistance: "Arcane Resistance",
	FeralAttackPower: "Feral Attack Power",
	Expertise: "Expertise",
	FrostSpellPower: "Frost Spell Power",
	NatureSpellPower: "Nature Spell Power",
	FrostResistance: "Frost Resistance",
	NatureResistance: "Nature Resistance",
	HolySpellPower: "Holy Spell Power",
	FireSpellPower: "Fire Spell Power",
	Health: "Health",
	Mana: "Mana",
	Miss: "Miss",
};

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
	locked?: boolean;
}

export interface ModifierSource {
    id: string;
    name: string;
    type: 'talent' | 'buff' | 'ability' | 'gear' | 'consumable'
    maxRank?: number
    rank?: number
    classId?: string
    stats: Stat[];
}

export type Buff = ModifierSource & {
	checked: boolean;
}

export type DisplayStatName =
	| StatName
	| "Avoidance"
	| "ShearAvoidance"
	| "Uncritability"
	| "Effective HP";
