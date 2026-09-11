import type { InputItem } from "../types";

// A small, hand-picked pool of real raid-tier tank items/gems from the game data, chosen to
// exercise every constraint the solver builds without the combinatorial explosion of the full
// item database:
//   - Head (34400): Meta + Blue sockets -> meta-gem cross-join
//   - Chest (34394): Blue/Blue/Red sockets + socket bonus -> multi-socket gem combinations
//   - Chest and Feet (32267) both have a Red-compatible socket -> both items can want the scarce
//     Unique-Equipped gem (30565), exercising the unique-gem constraint
//   - Shoulder/Hands/Legs also socketed, for general multi-item socket-bonus coverage
//   - 3 Finger / 3 Trinket candidates (slot bound is 2) -> forces a real choice
//
// Every item carries real Dodge/Defense/Block/Parry stats (raid-tier values, not filler) so
// avoidance/uncrit floor scenarios are actually satisfiable within a handful of solver
// iterations, not just structurally valid but numerically impossible for a pool this size.
//
// Every item must also be equippable by TEST_CLASS_ID (Paladin). This pool previously used three
// Onslaught pieces (Warrior T6, classAllowlist [1]); prepareItemCandidates now filters
// class-restricted gear, so they would simply vanish from the pool - and before that filter
// existed they crashed the sim outright when two of them triggered the Warrior set bonus.
export const TEST_ITEM_IDS = {
	head: "34400", // Crown of Dath'Remar (Meta, Blue)
	neck: "30007", // The Darkener's Grasp
	shoulder: "28743", // Mantle of Abrahmis (Red, Yellow)
	back: "29925", // Phoenix-Wing Cloak
	chest: "34394", // Breastplate of Agony's Aversion (Blue, Blue, Red)
	wrist: "28502", // Vambraces of Courage (Yellow)
	hands: "34352", // Borderland Fortress Grips (Red, Yellow)
	waist: "34488", // Lightbringer Waistguard (Blue)
	legs: "32263", // Praetorian's Legguards (Yellow, Yellow, Red)
	feet: "32267", // Boots of the Resilient (Red, Yellow)
	weapon: "30021", // Wildfury Greatstaff (two-hand)
	ranged: "32325", // Rifle of the Stoic Guardian
	fingers: ["29323", "30083", "30028"],
	trinkets: ["32501", "33830", "28528"],
} as const;

export const TEST_GEM_IDS = {
	blue: "23118", // Solid Azure Moonstone (Stamina) - not Unique-Equipped
	red: "24032", // Subtle Living Ruby (Dodge) - not Unique-Equipped
	meta: "25898", // Tenacious Earthstorm Diamond (Defense) - not Unique-Equipped
	uniqueOrange: "30565", // Assassin's Fire Opal (MeleeCrit, Dodge) - Unique-Equipped
} as const;

export const TEST_CONSUMABLE_IDS = {
	flask: "flask-of-fortification", // Health, Defense
	guardianElixir: "elixir-of-major-defense", // Armor
	battleElixir: "greater-arcane-elixir", // SpellPower
} as const;

const item = (id: string): InputItem => ({ id, gems: [] });

export const testItemPool: InputItem[] = [
	item(TEST_ITEM_IDS.head),
	item(TEST_ITEM_IDS.neck),
	item(TEST_ITEM_IDS.shoulder),
	item(TEST_ITEM_IDS.back),
	item(TEST_ITEM_IDS.chest),
	item(TEST_ITEM_IDS.wrist),
	item(TEST_ITEM_IDS.hands),
	item(TEST_ITEM_IDS.waist),
	item(TEST_ITEM_IDS.legs),
	item(TEST_ITEM_IDS.feet),
	item(TEST_ITEM_IDS.weapon),
	item(TEST_ITEM_IDS.ranged),
	...TEST_ITEM_IDS.fingers.map(item),
	...TEST_ITEM_IDS.trinkets.map(item),
];

export const TEST_RACE_ID = "1";
export const TEST_CLASS_ID = "2";
