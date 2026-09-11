import { convertStatToRating } from "#/helpers/convertStat";
import type { ModifierSource } from "#/solver/types";

export const getTalentsByClass = (classId: string): ModifierSource[] => {
	return TALENTS.filter((talent) => talent.classId === classId);
};

export const TALENTS: ModifierSource[] = [
	{
		classId: "2",
		name: "Toughness",
		id: "toughness",
		type: "talent",
		maxRank: 5,
		stats: [
			{
				name: "Armor",
				value: 0.02,
				type: "multiplier",
			},
		],
	},
	{
		classId: "2",
		name: "Anticipation",
		id: "anticipation",
		type: "talent",
		maxRank: 5,
		stats: [
			{
				name: "Defense",
				type: "flat",
				value: convertStatToRating({
					name: "Defense",
					value: 4,
					type: "flat",
				}),
			},
		],
	},
	{
		classId: "2",
		name: "Sacred Duty",
		id: "sacred-duty",
		type: "talent",
		maxRank: 2,
		stats: [
			{
				name: "Stamina",
				value: 0.03,
				type: "multiplier",
			},
		],
	},
	{
		classId: "2",
		name: "Combat Expertise",
		id: "combat-expertise",
		type: "talent",
		maxRank: 5,
		stats: [
			{
				name: "Stamina",
				value: 0.02,
				type: "multiplier",
			},
		],
	},
	{
		classId: "2",
		name: "Deflection",
		id: "deflection",
		type: "talent",
		maxRank: 5,
		stats: [
			{
				name: "Parry",
				// 1% per rank
				value: 23.6538,
				type: "flat",
			},
		],
	},
	// Improved Righteous Fury has no equivalent StatName (it's a flat multiplicative reduction
	// applied on top of armor mitigation, not a gear-style stat), so it carries no `stats` entry
	// here - calculateEffectiveHP reads its rank directly by id. See ImprovedRighteousFury docs.
	{
		classId: "2",
		id: "improved-righteous-fury",
		name: "Improved Righteous Fury",
		type: "talent",
		maxRank: 3,
		stats: [],
	},
];
