import { convertStatToRating } from "#/helpers.ts/convertStat";
import type { ModifierSource } from "#/solver/types";

export const getTalent = (id: string, rank: number): ModifierSource => {
	const talentData = TALENTS.find((t) => t.id === id);
	if (!talentData) {
		throw new Error(`No talent found for id ${id}`);
	}
	return { ...talentData, rank };
};

export const TALENTS: ModifierSource[] = [
	{
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
];
