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
	// gem ids in socket-position order, "0" for an empty socket that precedes a
	// filled one, trailing empty sockets dropped - matches the positional array
	// WowSims-style exports expect (see ExportStructures/ItemSpec.lua)
	gemSlots: string[];
	uniqueId: string;
	locked: boolean;
}

export interface LPItem extends Omit<ItemVariation, "type"> {
	type: ProcessedItemType;
	avoidanceScore: number;
	objectiveScore: number;
    uncritabilityScore: number;
    resistanceScores: Partial<Record<StatName, number>>;
}

export interface ScoreSet {
	avoidanceScore: number;
	objectiveScore: number;
	uncritabilityScore: number;
	resistanceScores: Partial<Record<StatName, number>>;
}

export type ScoreAxis = "avoidanceScore" | "objectiveScore" | "uncritabilityScore";

export interface EnchantCandidate {
	enchant: Enchant;
	varName: string;
	scores: ScoreSet;
}

export interface GemCandidate {
	gem: Gem;
	varName: string;
	scores: ScoreSet;
}

export interface SocketCandidates {
	socketIndex: number;
	color: Socket["color"];
	candidates: GemCandidate[];
}

// an unlocked, non-consumable item decomposed into first-class (item, enchant) and
// (item, socket, gem) binary-variable candidates instead of a pre-baked variant list
export interface DecomposableItem {
	base: Item;
	uniqueId: string;
	processedType: ProcessedItemType;
	itemScores: ScoreSet;
	enchantCandidates: EnchantCandidate[];
	sockets: SocketCandidates[];
	bonusVarName?: string;
	bonusScores?: ScoreSet;
}

export interface ResistanceFloor {
	stat: StatName;
	value: number;
}

export interface Stat {
	name: StatName;
	value: number;
	type: 'flat' | 'multiplier';
}

interface Socket {
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

export const RESISTANCE_STAT_NAMES: StatName[] = [
	"ArcaneResistance",
	"FireResistance",
	"FrostResistance",
	"NatureResistance",
	"ShadowResistance",
];

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
type ItemType =
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
	| "Shield"
	| "Flask"
	| "BattleElixir"
	| "GuardianElixir";

type ConsumableType = "Flask" | "BattleElixir" | "GuardianElixir";

export interface ConsumableItem {
	id: string;
	name: string;
	type: ConsumableType;
	stats: Stat[];
	// numeric wowhead item id, e.g. 22861 for https://www.wowhead.com/tbc/item=22861/flask-of-blinding-light
	// placeholder 0 until filled in via a separate data pass
	wowheadId: number;
}

type HandType = "TwoHand" | "OneHand" | "OffHand" | "MainHand";

export interface Enchant {
	name: string;
	id: string;
	effectID: string;
	type: ItemType;
	enchantType?: "Shield" | "TwoHand";
	stats: Stat[];
	// when "true", `id` is a spell id (wowhead.com/spell=<id>) rather than an item id (wowhead.com/item=<id>)
	isSpellID?: string;
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
