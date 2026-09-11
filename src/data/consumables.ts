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
export const CONSUMABLES: ConsumableItem[] = [
	{
		id: 22861,
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
		name: "Elixir of Major Agility",
		type: "BattleElixir",
		stats: [
			{
				name: "Agility",
				value: 35,
				type: "flat",
			},
		],
	},
];
