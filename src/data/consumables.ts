import type { ConsumableItem } from "../solver/types";

// `id` is the real tbc-new/game item id (a wowhead item URL's numeric id is the same id the game
// and the sim use) - cross-checked against vendor/tbc-sim/assets/database/db.json's entries for
// each of these exact names/stats, and (for Flask of Blinding Light) against
// protPaladinProfile.ts's own hardcoded PROT_PALADIN_CONSUMABLES.flaskId comment.
//
// These entries used to be keyed by a hand-written slug ("flask-of-fortification") with the game
// id alongside. Keying on the game id instead means this list and db.consumables address the
// same things the same way, so replacing this file with db.consumables later is a data swap
// rather than an id-space migration through persistence, the UI and resolveGearAndConsumables.
// The `icon` slugs are the only hand-maintained icon data left in the repo. Gear, gems and
// enchants all carry an icon in db.json and read it from there, but consumables do not appear in
// db.items, db.consumables has no icon field, and db.itemIcons is empty - so there is no
// database source for these six. They were lifted from the deleted src/data/item-tooltips.json
// before it went, and are verifiable against each item's wowhead page.
export const CONSUMABLES: ConsumableItem[] = [
	{
		id: 22861,
		icon: "inv_potion_116",
		name: "Flask of Blinding Light",
		type: "Flask",
		stats: [
			{
				name: "SpellPower",
				value: 80,
				type: "flat",
			},
		],
	},
	{
		id: 22851,
		icon: "inv_potion_119",
		name: "Flask of Fortification",
		type: "Flask",
		stats: [
			{
				name: "Health",
				value: 500,
				type: "flat",
			},
			{
				name: "Defense",
				value: 10,
				type: "flat",
			},
		],
	},
	{
		id: 22834,
		icon: "inv_potion_122",
		name: "Elixir of Major Defense",
		type: "GuardianElixir",
		stats: [
			{
				name: "Armor",
				value: 550,
				type: "flat",
			},
		],
	},
	{
		id: 32062,
		icon: "inv_potion_158",
		name: "Elixir of Major Fortitude",
		type: "GuardianElixir",
		stats: [
			{
				name: "Health",
				value: 250,
				type: "flat",
			},
		],
	},
	{
		id: 13454,
		icon: "inv_potion_25",
		name: "Greater Arcane Elixir",
		type: "BattleElixir",
		stats: [
			{
				name: "SpellPower",
				value: 35,
				type: "flat",
			},
		],
	},
	{
		id: 22831,
		icon: "inv_potion_127",
		name: "Elixir of Major Agility",
		type: "BattleElixir",
		stats: [
			{
				name: "Agility",
				value: 35,
				type: "flat",
			},
			{
				name: "MeleeCrit",
				value: 20,
				type: "flat",
			},
		],
	},
];
