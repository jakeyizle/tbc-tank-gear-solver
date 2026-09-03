import type { ConsumableItem } from "../solver/types";

// wowheadId doubles as the real tbc-new/game item ID (a wowhead item URL's numeric id is the
// same id the game/sim use) - cross-checked against vendor/tbc-sim/assets/database/db.json's
// entries for each of these exact names/stats, and (for Flask of Blinding Light) against
// protPaladinProfile.ts's own hardcoded PROT_PALADIN_CONSUMABLES.flaskId comment.
export const CONSUMABLES: ConsumableItem[] = [
	{
		id: "flask-of-blinding-light",
		name: "Flask of Blinding Light",
		type: "Flask",
		wowheadId: 22861,
		stats: [
			{
				name: "SpellPower",
				value: 80,
				type: "flat",
			},
		],
	},
	{
		id: "flask-of-fortification",
		name: "Flask of Fortification",
		type: "Flask",
		wowheadId: 22851,
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
		id: "elixir-of-major-defense",
		name: "Elixir of Major Defense",
		type: "GuardianElixir",
		wowheadId: 22834,
		stats: [
			{
				name: "Armor",
				value: 550,
				type: "flat",
			},
		],
	},
	{
		id: "elixir-of-major-fortitude",
		name: "Elixir of Major Fortitude",
		type: "GuardianElixir",
		wowheadId: 32062,
		stats: [
			{
				name: "Armor",
				value: 250,
				type: "flat",
			},
		],
	},
	{
		id: "greater-arcane-elixir",
		name: "Greater Arcane Elixir",
		type: "BattleElixir",
		wowheadId: 13454,
		stats: [
			{
				name: "SpellPower",
				value: 35,
				type: "flat",
			},
		],
	},
	{
		id: "elixir-of-major-agility",
		name: "Elixir of Major Agility",
		type: "BattleElixir",
		wowheadId: 22831,
		stats: [
			{
				name: "Agility",
				value: 35,
				type: "flat",
			},
		],
	},
];
